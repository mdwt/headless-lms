import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink, organization, mcp } from 'better-auth/plugins';
import type { OAuthAccessToken } from 'better-auth/plugins';
import { invite } from 'better-invite';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { Mailer } from '../../core/shared/mailer.js';
import type { Logger } from '../../core/shared/ports.js';
import type { IdentityService } from '../../core/identity/index.js';
import type { OrganizationProvisioner } from '../../core/organizations/index.js';
import { ID_PREFIXES, prefixId } from '../../core/shared/id.js';
import * as authSchema from './schema.js';
import { ac, roles } from './access.js';
import { inviteAllowsSignup, inviteLinkFor, STUDENT_ROLE, type InviteRecord } from './invites.js';

// better-invite's own cookie name for the staged invite token, set by its
// activate-invite route. Not re-exported from the package root (only `invite`
// / `inviteClient` are), so declared here — verified against
// `better-invite/dist/constants.mjs`.
const INVITE_COOKIE_NAME = 'invite_token';

// Prefixes for better-auth's own tables. This is a distinct id space from the
// mirrored domain rows (auth `user.id` → `users.external_id`, etc.), but we reuse
// the same human-readable prefixes so a `usr_`/`org_` id reads the same on both
// sides of the mirror. Unmapped models fall back to a generic `id_` prefix.
const AUTH_ID_PREFIXES: Record<string, string> = {
  user: ID_PREFIXES.user,
  session: 'ses',
  account: 'acc',
  verification: 'ver',
  organization: ID_PREFIXES.organization,
  member: 'mem',
  invitation: 'inv',
  oauthApplication: 'oap',
  oauthAccessToken: 'oat',
  oauthConsent: 'oac',
};

export interface CreateAuthOptions {
  db: NodePgDatabase;
  baseURL: string;
  secret: string;
  trustedOrigins: string[];
  /** Sends transactional auth emails via the template catalog. */
  mailer: Mailer;
  /** Logs failures that must not abort an auth flow (e.g. a failed invite email). */
  logger: Logger;
  /** Provisions a domain student and resolves auth users to students. */
  identity: IdentityService;
  /** Mirrors the organization plugin's records into the domain. */
  organizations: OrganizationProvisioner;
  /** Login page URL shown to unauthenticated MCP OAuth clients. */
  mcpLoginPage: string;
  /** Parent domain for cross-subdomain session cookies (e.g. ".example.com"); undefined → host-only cookie. */
  cookieDomain?: string;
  /** Mark session cookies Secure (set behind HTTPS / in production). */
  secureCookies?: boolean;
  /** Student portal origin — invite links for students, and the origin whose signups are invite-gated. */
  studentPortalUrl: string;
  /** Admin app origin — invite links for staff. */
  adminAppUrl: string;
}

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  const scopeList = p.scopes.map((s) => `<li>${htmlEscape(s)}</li>`).join('');
  // clientIcon is attacker-controlled under open DCR — escape it in the attribute.
  const icon = p.clientIcon
    ? `<img src="${htmlEscape(p.clientIcon)}" alt="" style="width:48px;height:48px;border-radius:8px;margin-bottom:12px;" /><br />`
    : '';
  // Escape code for safe embedding in JS string literal
  const safeCode = p.code.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
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

export function createAuth(opts: CreateAuthOptions): Auth {
  // Resolve a better-auth user id to its mirrored domain staff User. The User is
  // provisioned on user creation, so it exists by the time org hooks fire.
  const requireUser = async (externalId: string) => {
    const user = await opts.identity.getUserByExternalId(externalId);
    if (!user) {
      throw new Error(`no domain user for auth user ${externalId}`);
    }
    return user;
  };

  // afterAcceptInvite needs auth.api.addMember, but hooks are defined before
  // betterAuth() returns — resolved via this ref, assigned right after creation.
  const authRef: { current: Auth | null } = { current: null };

  const auth = betterAuth({
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
        generateId: ({ model }) => prefixId(AUTH_ID_PREFIXES[model] ?? 'id'),
      },
      // Cross-subdomain shared session cookie for admin/api/web on one parent
      // domain (e.g. `.example.com` in prod). Left unset in local dev so the
      // host-only `localhost` cookie is used, which is already shared across
      // ports (cookies are not port-scoped).
      crossSubDomainCookies: {
        enabled: true,
        domain: opts.cookieDomain || undefined,
      },
      // Same-site cookie for the shared-parent-domain plan. Only switch to
      // `sameSite: "none"` + `secure` if admin and api are genuinely cross-site
      // (different registrable domains).
      defaultCookieAttributes: {
        sameSite: 'lax',
        secure: opts.secureCookies ?? false,
        httpOnly: true,
      },
    },
    database: drizzleAdapter(opts.db, {
      provider: 'pg',
      schema: authSchema,
    }),
    emailAndPassword: {
      enabled: true,
      sendResetPassword: async ({ user, url }) => {
        await opts.mailer.send(user.email, 'passwordReset', { resetUrl: url });
      },
    },
    plugins: [
      magicLink({
        // Invite-only: magic links sign in existing accounts, never mint new ones.
        disableSignUp: true,
        sendMagicLink: async ({ email, url }) => {
          await opts.mailer.send(email, 'magicLink', { url });
        },
      }),
      invite({
        invitationTokenExpiresIn: 60 * 60 * 24 * 7, // 7 days
        defaultMaxUses: 1,
        // Only staff (users with an org membership) may mint invitations; blocks
        // authenticated portal students from hitting /invite/create.
        canCreateInvite: async ({ inviterUser, ctx }) => {
          const domainUser = await opts.identity.getUserByExternalId(inviterUser.id);
          if (!domainUser) {
            return false;
          }
          const membership = await opts.organizations.getMembershipByUser(domainUser.id);
          if (membership === null) {
            return false;
          }
          const session = ctx.context.session as {
            session: { activeOrganizationId?: string | null };
          } | null;
          // No active org → afterCreateInvite couldn't record the invite; refuse before anything is sent.
          if (!session?.session?.activeOrganizationId) {
            return false;
          }
          return true;
        },
        sendUserInvitation: async ({ email, name, role, token }) => {
          const link = inviteLinkFor(role, token, email, {
            studentPortalUrl: opts.studentPortalUrl,
            adminAppUrl: opts.adminAppUrl,
          });
          try {
            if (role === STUDENT_ROLE) {
              await opts.mailer.send(email, 'studentInvite', {
                inviteUrl: link,
                studentName: name ?? email,
              });
            } else {
              // better-invite's callback doesn't expose the inviter, so the
              // member template gets a generic sender name.
              await opts.mailer.send(email, 'memberInvite', {
                inviteUrl: link,
                inviterName: 'Your team',
                role,
              });
            }
          } catch (err) {
            // A failed email must not abort invite creation: the token is already minted and
            // afterCreateInvite still records it, so the admin can fix transport and resend.
            opts.logger.error('failed to send invite email', {
              email,
              role,
              err: err instanceof Error ? err.message : String(err),
            });
          }
        },
        inviteHooks: {
          // Capture which domain record each invitation belongs to, using the
          // inviter's active org (the surface that minted it).
          afterCreateInvite: async ({ ctx, invitations }) => {
            const session = ctx.context.session as {
              user: { id: string };
              session: { activeOrganizationId?: string | null };
            } | null;
            const orgExternalId = session?.session?.activeOrganizationId ?? null;
            if (!orgExternalId) {
              return;
            }
            for (const inv of invitations) {
              const email = (inv.emails?.[0] ?? inv.email) as string | undefined;
              if (!email) {
                continue;
              }
              if (inv.role === STUDENT_ROLE) {
                const org = await opts.organizations.getByExternalId(orgExternalId);
                if (!org) {
                  throw new Error('unknown organization for invite');
                }
                await opts.identity.recordStudentInvite(org.id, email, inv.id);
              } else {
                const inviter = await requireUser(session!.user.id);
                await opts.organizations.recordInvitation({
                  orgExternalId,
                  externalId: inv.id,
                  email,
                  role: inv.role,
                  status: 'pending',
                  inviterUserId: inviter.id,
                  expiresAt: inv.expiresAt ?? null,
                });
              }
            }
          },
          // One accept path for every auth method: link the student row, or grant
          // the staff membership recorded for this invitation.
          afterAcceptInvite: async ({ ctx, invitation, invitedUser }) => {
            if (invitation.role === STUDENT_ROLE) {
              await opts.identity.linkStudentByInvite(invitation.id, invitedUser.email, invitedUser.id);
              // The signup/sign-in session was created BEFORE this hook linked the
              // row, so the session.create.before org-stamping saw nothing — stamp
              // the fresh session now or the very first portal load 401s.
              const orgExternalId = await opts.identity.studentOrgExternalId(invitedUser.id);
              const liveSession = (
                ctx.context as {
                  newSession?: { session?: { token?: string } } | null;
                  session?: { session?: { token?: string } } | null;
                }
              ).newSession?.session ?? (ctx.context as { session?: { session?: { token?: string } } | null }).session?.session;
              if (orgExternalId && liveSession?.token) {
                const updated = await ctx.context.internalAdapter.updateSession(liveSession.token, {
                  activeOrganizationId: orgExternalId,
                });
                // Refresh the cookie cache too — consumeInvite already re-issued
                // it with the pre-stamp session, and getSession trusts the cache
                // for its maxAge (same pattern as the org plugin's set-active).
                await setSessionCookie(ctx as Parameters<typeof setSessionCookie>[0], {
                  session: updated,
                  user: invitedUser,
                } as Parameters<typeof setSessionCookie>[1]);
                opts.logger.info('invite session stamped', { orgExternalId });
              } else {
                opts.logger.warn('invite session NOT stamped', {
                  hasOrg: orgExternalId !== null,
                  hasToken: Boolean(liveSession?.token),
                });
              }
              return;
            }
            const record = await opts.organizations.invitationForAccept(invitation.id);
            if (!record || record.status !== 'pending') {
              return; // canceled/unknown → no grant
            }
            await authRef.current!.api.addMember({
              body: { userId: invitedUser.id, organizationId: record.orgExternalId, role: record.role },
            });
            await opts.organizations.acceptInvitation({ externalId: invitation.id });
          },
        },
      }),
      organization({
        ac,
        roles,
        creatorRole: 'owner',
        // No sendInvitationEmail: the org plugin's native invitations are blocked
        // below (beforeCreateInvitation) — all invites flow through better-invite.
        organizationHooks: {
          // The org plugin's own invitation endpoints (createInvitation/acceptInvitation)
          // are unmirrored on this branch — invites are minted and recorded exclusively
          // through better-invite (see `invite(...)` above). Block the native endpoint so
          // it cannot silently create invitations the domain never learns about.
          beforeCreateInvitation: async () => {
            throw new APIError('BAD_REQUEST', {
              message: 'Invitations are managed by the invite system',
            });
          },
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
            if (!mirrored) {
              return;
            }
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
        },
      }),
      mcp({
        loginPage: opts.mcpLoginPage,
        oidcConfig: {
          // loginPage is required by OIDCOptions; the mcp plugin also sets it
          // from the outer loginPage option at runtime, so this is consistent.
          loginPage: opts.mcpLoginPage,
          allowDynamicClientRegistration: true,
          storeClientSecret: 'hashed',
          scopes: [
            'openid',
            'profile',
            'courses:read',
            'courses:write',
            'students:read',
            'progress:read',
            'entitlements:read',
            'entitlements:write',
            'assessments:read',
            'org:read',
          ],
          getConsentHTML,
        },
      }),
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/sign-up/email') {
          return;
        }
        // Fail closed: signup is invite-only everywhere except the admin app's
        // create-your-org funnel. Missing/unknown Origin (scripted clients) is gated —
        // better-auth's CSRF origin check skips cookie-less requests, so it is no backstop.
        const origin = ctx.headers?.get('origin') ?? '';
        if (origin === new URL(opts.adminAppUrl).origin) {
          return;
        }

        const cookie = ctx.context.createAuthCookie(INVITE_COOKIE_NAME, { maxAge: 60 * 10 });
        const token = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
        const email = (ctx.body as { email?: string } | undefined)?.email ?? '';
        const invite = token
          ? await ctx.context.adapter.findOne<InviteRecord>({
              model: 'invite',
              where: [{ field: 'token', value: token }],
            })
          : null;
        if (!inviteAllowsSignup(invite, email, new Date())) {
          throw new APIError('FORBIDDEN', { message: 'The student portal is invite-only' });
        }
      }),
    },
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
      session: {
        create: {
          before: async (session) => {
            // Org-scoped students: stamp the student's org onto their session at
            // login, so the API scopes reads by the session (`req.orgId`) instead
            // of a per-request header. Staff logins have no student row → left
            // untouched (their active org comes from the organization plugin).
            const orgExternalId = await opts.identity.studentOrgExternalId(session.userId);
            if (!orgExternalId) {
              return;
            }
            return { data: { ...session, activeOrganizationId: orgExternalId } };
          },
        },
      },
    },
  }) as unknown as Auth;
  authRef.current = auth;
  return auth;
}

// Hand-declared instead of `ReturnType<typeof betterAuth>`: better-auth infers
// that return type from the literal `plugins` array above, and the mcp
// plugin's shape embeds an internal (non-exported) `MCPOptions` type that
// TypeScript's declaration emitter cannot name when this package builds its
// own .d.ts — see the mcp plugin in better-auth/plugins. This interface
// covers exactly the surface the package touches (the web handler, session
// lookup, the MCP OAuth hooks, and organization member-writes); the object
// `createAuth` returns is the real better-auth instance underneath, just
// narrowed to this shape at the boundary.
export interface Auth {
  handler: (request: Request) => Promise<Response>;
  options: BetterAuthOptions;
  api: {
    getSession: (input: { headers: Headers }) => Promise<{
      user: {
        id: string;
        email: string;
        name: string;
        emailVerified: boolean;
        image?: string | null;
      };
      session: Record<string, unknown>;
    } | null>;
    // Consumed only structurally by better-auth's own mcp helpers
    // (withMcpAuth, oAuthDiscoveryMetadata, oAuthProtectedResourceMetadata).
    getMcpSession: (...args: unknown[]) => Promise<OAuthAccessToken | null>;
    getMcpOAuthConfig: (...args: unknown[]) => unknown;
    getMCPProtectedResource: (...args: unknown[]) => unknown;
    // Organization member-writes (see org-admin.ts).
    createOrganization: (input: {
      body: Record<string, unknown>;
      headers: Headers;
    }) => Promise<{ id: string } | null>;
    setActiveOrganization: (input: {
      body: Record<string, unknown>;
      headers: Headers;
    }) => Promise<unknown>;
    updateOrganization: (input: {
      body: Record<string, unknown>;
      headers: Headers;
    }) => Promise<unknown>;
    updateMemberRole: (input: {
      body: Record<string, unknown>;
      headers: Headers;
    }) => Promise<unknown>;
    removeMember: (input: { body: Record<string, unknown>; headers: Headers }) => Promise<unknown>;
    // better-invite (see invites.ts + org-admin.ts). Driven by OrgAdmin.invite
    // for staff roles; the same endpoint mints student invites too.
    createInvite: (input: { body: { email: string; role: string }; headers: Headers }) => Promise<unknown>;
    // Grants a membership on an accepted staff invitation (see afterAcceptInvite).
    addMember: (input: {
      body: { userId: string; organizationId: string; role: string };
    }) => Promise<unknown>;
  };
}
