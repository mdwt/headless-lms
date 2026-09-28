import type {
  ActiveSession,
  Logger,
  NewOrganizationInput,
  SessionVerifier,
} from "@headless-lms/core/types";
import type { IncomingHttpHeaders } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { APIError, betterAuth } from "better-auth";
import type { CreateAuthOptions } from "./types.js";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import * as authSchema from "@headless-lms/adapter-db/schema/better-auth";
import { prefixId } from "@headless-lms/core/shared/id";
import { customSession, magicLink, organization } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { ac, roles } from "./access.js";
import {
  type AuthHeaders,
  type AuthOrganization,
  type MemberWriteContext,
  type OrgAdmin,
  OrganizationRuleError,
  parseRole,
  type Role,
  type UpdateOrganizationInput,
} from "@headless-lms/core/organizations";
import type { SessionAdmin } from "@headless-lms/core/identity";

export function createAuth(opts: CreateAuthOptions) {
  const { sendResetPassword, sendMagicLink, beforeUserCreate, beforeCreateSession } = opts.hooks;

  const auth = betterAuth({
    baseURL: opts.baseUrl,
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
        generateId: () => prefixId("id"),
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
        sameSite: "lax",
        secure: opts.secureCookies ?? false,
        httpOnly: true,
      },
    },
    database: drizzleAdapter(opts.db, {
      provider: "pg",
      schema: authSchema,
    }),
    emailAndPassword: {
      enabled: true,
      sendResetPassword,
    },
    plugins: [
      magicLink({
        disableSignUp: true,
        sendMagicLink,
      }),
      organization({
        ac,
        roles,
        creatorRole: "owner",
        organizationHooks: opts.hooks,
      }),
      // Enrich get-session with the caller's memberships (role + org) so BFFs
      // resolve auth in one call instead of fanning out to get-active-member /
      // get-full-organization / organization/list. Custom fields bypass the
      // cookie cache, so this costs one indexed query per get-session.
      customSession(async ({ user, session }) => {
        const memberships = await opts.db
          .select({
            role: authSchema.member.role,
            id: authSchema.organization.id,
            name: authSchema.organization.name,
            slug: authSchema.organization.slug,
          })
          .from(authSchema.member)
          .innerJoin(
            authSchema.organization,
            eq(authSchema.member.organizationId, authSchema.organization.id),
          )
          .where(eq(authSchema.member.userId, user.id));
        const activeOrgId =
          (session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null;
        const active = memberships.find((m) => m.id === activeOrgId) ?? null;
        return {
          user,
          session,
          activeMemberRole: active?.role ?? null,
          activeOrganization: active
            ? { id: active.id, name: active.name, slug: active.slug }
            : null,
          organizations: memberships.map(({ id, name, slug }) => ({ id, name, slug })),
        };
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          before: beforeUserCreate,
        },
      },
      session: {
        create: {
          before: beforeCreateSession,
        },
      },
    },
  });
  return auth;
}

export type Auth = ReturnType<typeof createAuth>;

export class BetterAuth implements SessionVerifier, OrgAdmin, SessionAdmin {
  protected auth: Auth;
  protected logger: Logger;

  constructor(opts: CreateAuthOptions) {
    this.auth = createAuth(opts);
    this.logger = opts.logger;
  }

  async handler(request: Request): Promise<Response> {
    return this.auth.handler(request);
  }

  async verify(headers: IncomingHttpHeaders): Promise<ActiveSession | null> {
    const res = await this.auth.api.getSession({ headers: fromNodeHeaders(headers) });
    if (!res) {
      return null;
    }
    return {
      user: {
        id: res.user.id,
        createdAt: res.user.createdAt,
        email: res.user.email,
        firstName: res.user.name,
        externalId: res.user.id,
        lastName: res.user.name,
        updatedAt: res.user.updatedAt,
      },
      session: {
        // customSession erases the org plugin's session extension from the
        // inferred type; the field is still present at runtime.
        activeOrganizationId:
          (res.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null,
      },
    };
  }

  /** Stamps the org onto the caller's session row. The 5-minute cookie cache
   *  still holds the pre-stamp session, so callers refresh it client-side with
   *  `getSession({ disableCookieCache: true })`. */
  async stampActiveOrganization(headers: AuthHeaders, orgId: string): Promise<boolean> {
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(headers) });
    const token = (session?.session as { token?: string } | undefined)?.token;
    if (!token) {
      return false;
    }
    const ctx = await this.auth.$context;
    await ctx.internalAdapter.updateSession(token, { activeOrganizationId: orgId });
    return true;
  }

  async createOrganization(
    headers: AuthHeaders,
    input: NewOrganizationInput,
  ): Promise<AuthOrganization> {
    const org = await this.auth.api.createOrganization({
      body: { name: input.name, slug: input.slug },
      headers: fromNodeHeaders(headers),
    });
    if (!org) {
      throw new Error(`Couldn't create organization`);
    }
    return { id: org.id, name: org.name, slug: org.slug, createdAt: org.createdAt };
  }
  async setActiveOrganization(headers: AuthHeaders, externalId: string): Promise<void> {
    await this.auth.api.setActiveOrganization({
      body: { organizationId: externalId },
      headers: fromNodeHeaders(headers),
    });
  }
  async updateOrganization(
    headers: AuthHeaders,
    externalId: string,
    input: UpdateOrganizationInput,
  ): Promise<AuthOrganization> {
    try {
      const org = await this.auth.api.updateOrganization({
        body: { organizationId: externalId, data: { name: input.name, slug: input.slug } },
        headers: fromNodeHeaders(headers),
      });
      if (!org) {
        throw new Error(`Couldn't update organization`);
      }
      return { id: org.id, name: org.name, slug: org.slug, createdAt: org.createdAt };
    } catch (err) {
      // Surface Better Auth validation/permission failures (e.g. slug taken) as
      // a domain rule error the route maps to 409 rather than a raw 500.
      if (err instanceof APIError) {
        throw new OrganizationRuleError(err.message || "Could not update organization");
      }
      throw err;
    }
  }
  async deleteOrganization(headers: AuthHeaders, externalId: string): Promise<void> {
    try {
      await this.auth.api.deleteOrganization({
        body: { organizationId: externalId },
        headers: fromNodeHeaders(headers),
      });
    } catch (err) {
      if (err instanceof APIError) {
        throw new OrganizationRuleError(err.message || "Could not delete organization");
      }
      throw err;
    }
  }
  async grantMembership(
    orgExternalId: string,
    userExternalId: string,
    role: string,
  ): Promise<void> {
    // Server-side (no session): the accepted invitation is the authorisation.
    try {
      await this.auth.api.addMember({
        body: { userId: userExternalId, organizationId: orgExternalId, role: parseRole(role) },
      });
    } catch (err) {
      if (
        err instanceof APIError &&
        err.body?.code === "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION"
      ) {
        return;
      }
      throw err;
    }
  }
  async updateRole(ctx: MemberWriteContext, userExternalId: string, role: Role): Promise<void> {
    await this.auth.api.updateMemberRole({
      body: {
        memberId: await this.resolveMemberId(ctx, userExternalId),
        role,
        organizationId: ctx.authOrgId,
      },
      headers: this.headersOf(ctx),
    });
  }
  async removeMember(ctx: MemberWriteContext, userExternalId: string): Promise<void> {
    await this.auth.api.removeMember({
      body: {
        memberIdOrEmail: await this.resolveMemberId(ctx, userExternalId),
        organizationId: ctx.authOrgId,
      },
      headers: this.headersOf(ctx),
    });
  }

  protected headersOf(ctx: MemberWriteContext): Headers {
    return fromNodeHeaders(ctx.headers);
  }

  // Better Auth's member endpoints key on its own member id, which the domain
  // deliberately does not store — `(org, user)` already identifies the record,
  // so it is looked up here instead of mirrored into org_users.
  protected async resolveMemberId(
    ctx: MemberWriteContext,
    userExternalId: string,
  ): Promise<string> {
    const res = await this.auth.api.listMembers({
      query: {
        organizationId: ctx.authOrgId,
        filterField: "userId",
        filterValue: userExternalId,
        limit: 1,
      },
      headers: this.headersOf(ctx),
    });
    const memberId = res?.members?.[0]?.id;
    if (!memberId) {
      throw new OrganizationRuleError("That person is no longer a member of this organization");
    }
    return memberId;
  }
}
