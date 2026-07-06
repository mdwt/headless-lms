// Auth adapter — wraps better-auth. Runtime/infra only; never imported by core.
//
// It depends on core ports (an EmailSender, the identity service, and the
// organizations provisioner) and owns the translation between better-auth's
// shapes and those ports: the magic-link email body, mapping a new credential
// user to a domain student, and mirroring the organization plugin's records
// (org, members, invitations) into the organizations context. Crucially, this
// adapter resolves better-auth user ids to domain student ids before calling
// core, so core contexts never import the auth schema. Composition only injects
// the port implementations.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink, organization, mcp } from "better-auth/plugins";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { EmailSender } from "../../core/shared/ports.js";
import type { IdentityService } from "../../core/identity/index.js";
import type { OrganizationProvisioner } from "../../core/organizations/index.js";
import { prefixId } from "../../core/shared/id.js";
import * as authSchema from "./schema.js";
import { ac, roles } from "./access.js";

// Prefixes for better-auth's own tables. This is a distinct id space from the
// mirrored domain rows (auth `user.id` → `users.external_id`, etc.), but we reuse
// the same human-readable prefixes so a `usr_`/`org_` id reads the same on both
// sides of the mirror. Unmapped models fall back to a generic `id_` prefix.
const AUTH_ID_PREFIXES: Record<string, string> = {
  user: "usr",
  session: "ses",
  account: "acc",
  verification: "ver",
  organization: "org",
  member: "mem",
  invitation: "inv",
  oauthApplication: "oap",
  oauthAccessToken: "oat",
  oauthConsent: "oac",
};

export interface CreateAuthOptions {
  db: NodePgDatabase;
  baseURL: string;
  secret: string;
  trustedOrigins: string[];
  /** Sends transactional auth emails (e.g. the magic-link sign-in email). */
  email: EmailSender;
  /** Provisions a domain student and resolves auth users to students. */
  identity: IdentityService;
  /** Mirrors the organization plugin's records into the domain. */
  organizations: OrganizationProvisioner;
  /** Login page URL shown to unauthenticated MCP OAuth clients. */
  mcpLoginPage: string;
}

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Renders an inline HTML consent page for the MCP OAuth flow.
 * POSTs JSON to POST /api/auth/oauth2/consent with { accept: boolean, consent_code: string }.
 * The consent endpoint requires a boolean `accept` field (not a form string), so we use
 * fetch() to send JSON rather than a plain HTML form.
 */
function getConsentHTML(p: {
  scopes: string[];
  clientMetadata: unknown;
  clientIcon?: string;
  clientId: string;
  clientName: string;
  code: string;
}): string {
  const scopeList = p.scopes.map((s) => `<li>${htmlEscape(s)}</li>`).join("");
  // clientIcon is attacker-controlled under open DCR — escape it in the attribute.
  const icon = p.clientIcon
    ? `<img src="${htmlEscape(p.clientIcon)}" alt="" style="width:48px;height:48px;border-radius:8px;margin-bottom:12px;" /><br />`
    : "";
  // Escape code for safe embedding in JS string literal
  const safeCode = p.code.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Authorize ${htmlEscape(p.clientName)}</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    .card { background: #fff; border-radius: 12px; padding: 32px; max-width: 400px; width: 100%; box-shadow: 0 2px 12px rgba(0,0,0,.1); }
    h1 { font-size: 1.25rem; margin: 0 0 8px; }
    p { color: #555; margin: 0 0 16px; }
    ul { margin: 0 0 24px; padding-left: 20px; color: #333; }
    .actions { display: flex; gap: 12px; }
    button { flex: 1; padding: 10px; border: none; border-radius: 8px; font-size: 1rem; cursor: pointer; }
    .allow { background: #2563eb; color: #fff; }
    .deny { background: #e5e7eb; color: #333; }
  </style>
</head>
<body>
  <div class="card">
    ${icon}
    <h1>${htmlEscape(p.clientName)} wants access</h1>
    <p>This app is requesting the following permissions:</p>
    <ul>${scopeList}</ul>
    <div class="actions">
      <button class="allow" onclick="respond(true)">Allow</button>
      <button class="deny" onclick="respond(false)">Deny</button>
    </div>
    <p id="err" style="color:#dc2626;margin-top:12px;display:none;"></p>
  </div>
  <script>
    async function respond(accept) {
      try {
        const res = await fetch('/api/auth/oauth2/consent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ accept, consent_code: '${safeCode}' })
        });
        if (!res.ok) { showError('Request failed (' + res.status + ')'); return; }
        const data = await res.json();
        if (data.redirectURI) { window.location.href = data.redirectURI; return; }
        showError('Authorization failed: no redirect received.');
      } catch (e) {
        showError('Network error. Please try again.');
      }
    }
    function showError(msg) {
      const el = document.getElementById('err');
      if (el) { el.textContent = msg; el.style.display = ''; }
    }
  </script>
</body>
</html>`;
}

export function createAuth(opts: CreateAuthOptions) {
  // Resolve a better-auth user id to its mirrored domain staff User. The User is
  // provisioned on user creation, so it exists by the time org hooks fire.
  const requireUser = async (externalId: string) => {
    const user = await opts.identity.getUserByExternalId(externalId);
    if (!user) throw new Error(`no domain user for auth user ${externalId}`);
    return user;
  };

  return betterAuth({
    baseURL: opts.baseURL,
    secret: opts.secret,
    trustedOrigins: opts.trustedOrigins,
    session: {
      // Signed short-lived cookie cache: avoids a Postgres session lookup on
      // every request. The BFF verifies the session per request (each API call
      // + every SSR getSession), so without this each one is a DB round-trip.
      // The cache holds for maxAge; sign-out / expiry still invalidate it.
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    advanced: {
      database: {
        // Prefixed, KSUID-bodied ids for every better-auth table (usr_, org_, …).
        generateId: ({ model }) => prefixId(AUTH_ID_PREFIXES[model] ?? "id"),
      },
      // Cross-subdomain shared session cookie for admin/api/web on one parent
      // domain (e.g. `.example.com` in prod). Left unset in local dev so the
      // host-only `localhost` cookie is used, which is already shared across
      // ports (cookies are not port-scoped).
      crossSubDomainCookies: {
        enabled: true,
        domain: process.env.AUTH_COOKIE_DOMAIN || undefined,
      },
      // Same-site cookie for the shared-parent-domain plan. Only switch to
      // `sameSite: "none"` + `secure` if admin and api are genuinely cross-site
      // (different registrable domains).
      defaultCookieAttributes: {
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
      },
    },
    database: drizzleAdapter(opts.db, {
      provider: "pg",
      schema: authSchema,
    }),
    emailAndPassword: {
      enabled: true,
    },
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await opts.email.send({
            to: email,
            subject: "Your sign-in link",
            text: `Click to sign in: ${url}`,
          });
        },
      }),
      organization({
        ac,
        roles,
        creatorRole: "owner",
        organizationHooks: {
          // New org → mirror it plus the creator's owner membership.
          afterCreateOrganization: async ({ organization: org, member, user }) => {
            const owner = await requireUser(user.id);
            await opts.organizations.createOrg({
              externalId: org.id,
              name: org.name,
              slug: org.slug,
              ownerId: owner.id,
            });
            await opts.organizations.addMembership({
              orgExternalId: org.id,
              externalId: member.id,
              userId: owner.id,
              role: member.role,
            });
          },
          afterAddMember: async ({ member, user, organization: org }) => {
            // During org creation better-auth adds the creator and may fire this
            // hook before afterCreateOrganization has mirrored the org. In that
            // case skip — the creator's membership is mirrored by
            // afterCreateOrganization. For genuine later adds the org exists.
            const mirrored = await opts.organizations.getByExternalId(org.id);
            if (!mirrored) return;
            const user_ = await requireUser(user.id);
            await opts.organizations.addMembership({
              orgExternalId: org.id,
              externalId: member.id,
              userId: user_.id,
              role: member.role,
            });
          },
          afterRemoveMember: async ({ member }) => {
            await opts.organizations.removeMembership(member.id);
          },
          afterCreateInvitation: async ({ invitation, inviter, organization: org }) => {
            const inviterUser = await requireUser(inviter.id);
            await opts.organizations.recordInvitation({
              orgExternalId: org.id,
              authInvitationId: invitation.id,
              email: invitation.email,
              role: invitation.role,
              status: invitation.status,
              inviterUserId: inviterUser.id,
              expiresAt: invitation.expiresAt ?? null,
            });
          },
          afterAcceptInvitation: async ({ invitation }) => {
            await opts.organizations.acceptInvitation({ authInvitationId: invitation.id });
          },
        },
      }),
      mcp({
        loginPage: opts.mcpLoginPage,
        oidcConfig: {
          // loginPage is required by OIDCOptions; the mcp plugin also sets it
          // from the outer loginPage option at runtime, so this is consistent.
          loginPage: opts.mcpLoginPage,
          allowDynamicClientRegistration: true,
          storeClientSecret: "hashed",
          scopes: [
            "openid",
            "profile",
            "courses:read",
            "courses:write",
            "students:read",
            "progress:read",
            "enrollments:read",
            "enrollments:write",
            "assessments:read",
            "org:read",
          ],
          getConsentHTML,
        },
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            // Translate better-auth's user into the identity context's staff User.
            await opts.identity.registerUser({
              externalId: user.id,
              email: user.email,
              displayName: user.name,
            });
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
