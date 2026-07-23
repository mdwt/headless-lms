import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink, organization, mcp } from 'better-auth/plugins';
import type { OAuthAccessToken } from 'better-auth/plugins';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { Mailer } from '../../core/shared/mailer.js';
import type { Logger } from '../../core/shared/ports.js';
import type { IdentityService } from '../../core/identity/index.js';
import type { OrganizationProvisioner } from '../../core/organizations/index.js';
import { ID_PREFIXES, prefixId } from '../../core/shared/id.js';
import { INVITE_COOKIE_NAME } from '../../core/shared/invite-token.js';
import * as authSchema from './schema.js';
import { ac, roles } from './access.js';

function readCookie(header: string, name: string): string | null {
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return null;
}

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
  /** Consent page URL the MCP OAuth flow redirects to (?consent_code&client_id&scope). */
  mcpConsentPage: string;
  /** Parent domain for cross-subdomain session cookies (e.g. ".example.com"); undefined → host-only cookie. */
  cookieDomain?: string;
  /** Mark session cookies Secure (set behind HTTPS / in production). */
  secureCookies?: boolean;
  /** Admin app origin — the only origin whose signups are not invite-gated. */
  adminAppUrl: string;
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
      organization({
        ac,
        roles,
        creatorRole: 'owner',
        organizationHooks: {
          // Invitations are domain-owned (core organizations + /api/invites).
          // Block the org plugin's native invitation endpoint so it cannot
          // silently create invitations the domain never learns about.
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
          consentPage: opts.mcpConsentPage,
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

        const token = readCookie(ctx.headers?.get('cookie') ?? '', INVITE_COOKIE_NAME);
        const email = (ctx.body as { email?: string } | undefined)?.email ?? '';
        if (!token || !(await opts.organizations.inviteAllowsSignup(token, email))) {
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
    // Grants a membership on an accepted staff invitation (server-side, no session).
    addMember: (input: {
      body: { userId: string; organizationId: string; role: string };
    }) => Promise<unknown>;
  };
  /** better-auth's internal context — used by the accept route to stamp the
   *  session's active org (students are not members, so set-active can't). */
  $context: Promise<{
    internalAdapter: {
      updateSession: (token: string, data: Record<string, unknown>) => Promise<unknown>;
    };
  }>;
}
