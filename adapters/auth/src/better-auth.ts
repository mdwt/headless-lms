import type {
  AccessGrant,
  AccessRequest,
  AccessTokenVerifier,
  ActiveSession,
  ApiKeySummary,
  AppAccessAdmin,
  ConnectedApp,
  CreatedApiKey,
  HeaderBag,
  Logger,
  NewApiKey,
  NewOrganizationInput,
  SessionVerifier,
} from "@headless-lms/core/types";
import type { IncomingHttpHeaders } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { APIError, betterAuth, type BetterAuthOptions, type BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import type { CreateAuthOptions } from "./types.js";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import * as authSchema from "@headless-lms/adapter-db/schema/better-auth";
import { prefixId } from "@headless-lms/core/shared/id";
import { customSession, jwt, magicLink, organization } from "better-auth/plugins";
import {
  type AccessTokenAuthorization,
  createDpopReplayStore,
  enforceDpopBinding,
  isDpopBindingError,
  verifyJwsAccessToken,
} from "better-auth/oauth2";
import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { mcp } from "@better-auth/mcp";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { apiKey } from "@better-auth/api-key";
import { eq } from "drizzle-orm";
import { ac, roles } from "./access.js";
import {
  accessTokenAuthorization,
  grantFromClaims,
  isCompactJws,
  needsOrgChoice,
  orgIdFromMetadata,
  permissionsToScopes,
  scopesToPermissions,
} from "./access-grant.js";
import { withLoopbackNativeDefault } from "./client-registration.js";
import {
  ACCESS_SCOPES,
  type AuthHeaders,
  type AuthOrganization,
  type MemberWriteContext,
  type OrgAdmin,
  OrganizationRuleError,
  parseRole,
  type Role,
  type UpdateOrganizationInput,
} from "@headless-lms/core/organizations";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  ORG_CLAIM,
  type SessionAdmin,
} from "@headless-lms/core/identity";

function activeOrgOf(session: unknown): string | null {
  const value = (session as { activeOrganizationId?: string | null } | null)?.activeOrganizationId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function memberOrgIds(db: CreateAuthOptions["db"], userId: string): Promise<string[]> {
  const rows = await db
    .select({ organizationId: authSchema.member.organizationId })
    .from(authSchema.member)
    .where(eq(authSchema.member.userId, userId));
  return rows.map((row) => row.organizationId);
}

function mcpOAuthPlugins(opts: CreateAuthOptions): BetterAuthPlugin[] {
  return [
    mcp({
      resource: opts.mcp.resource,
      loginPage: opts.mcp.loginPage,
      consentPage: opts.mcp.consentPage,
      scopes: [...ACCESS_SCOPES, "offline_access"],
      clientRegistrationDefaultScopes: [...ACCESS_SCOPES, "offline_access"],
      accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      postLogin: {
        page: opts.mcp.orgPickerPage,
        shouldRedirect: ({ session, user }) =>
          needsOrgChoice(activeOrgOf(session), () => memberOrgIds(opts.db, user.id)),
        consentReferenceId: ({ session }) => activeOrgOf(session) ?? undefined,
      },
      customAccessTokenClaims: ({ referenceId }) =>
        referenceId ? { [ORG_CLAIM]: referenceId } : {},
    }) as BetterAuthPlugin,
    cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }) as BetterAuthPlugin,
  ];
}

export function buildAuthOptions(opts: CreateAuthOptions) {
  const {
    sendResetPassword,
    onPasswordReset,
    sendMagicLink,
    beforeUserCreate,
    beforeCreateSession,
  } = opts.hooks;
  const detached =
    <A extends unknown[]>(name: string, hook: (...args: A) => Promise<void>) =>
    async (...args: A): Promise<void> => {
      void hook(...args).catch((err: unknown) =>
        opts.logger.error(`auth hook ${name} failed`, { err }),
      );
    };

  return {
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
      // Detached so send time can't reveal which emails have accounts, and a failed notice can't fail the reset.
      sendResetPassword: detached("sendResetPassword", sendResetPassword),
      onPasswordReset: detached("onPasswordReset", onPasswordReset),
      revokeSessionsOnPasswordReset: true,
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
      jwt({ disableSettingJwtHeader: true }) as BetterAuthPlugin,
      ...(opts.mcp.oauthEnabled ? mcpOAuthPlugins(opts) : []),
      apiKey({ enableMetadata: true, rateLimit: { enabled: false } }) as BetterAuthPlugin,
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
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/api-key/create" && (ctx.request || ctx.headers)) {
          throw new APIError("FORBIDDEN", { message: "API keys are created through the LMS" });
        }
        if (ctx.path === "/api-key/update" && ctx.body?.metadata !== undefined) {
          throw new APIError("FORBIDDEN", {
            message: "An API key stays in the organization it was made for",
          });
        }
        if (ctx.path !== "/oauth2/register") {
          return;
        }
        const body = withLoopbackNativeDefault(ctx.body);
        return body ? { context: { body } } : undefined;
      }),
    },
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
  } satisfies BetterAuthOptions;
}

export function createAuth(opts: CreateAuthOptions) {
  return betterAuth(buildAuthOptions(opts));
}

export type Auth = ReturnType<typeof createAuth>;

type JSONWebKeySet = { keys: Array<Record<string, unknown>> };

type PluginApiKey = {
  id: string;
  name: string | null;
  start: string | null;
  referenceId: string;
  metadata: unknown;
  permissions: Record<string, string[]> | null;
  createdAt: Date;
  lastRequest: Date | null;
};

type PluginApi = {
  getJwks(): Promise<JSONWebKeySet>;
  verifyApiKey(input: {
    body: { key: string };
  }): Promise<{ valid: boolean; key: PluginApiKey | null }>;
  createApiKey(input: {
    body: {
      name: string;
      userId: string;
      metadata: Record<string, unknown>;
      permissions: Record<string, string[]>;
    };
  }): Promise<PluginApiKey & { key: string }>;
  listApiKeys(input: { headers: Headers }): Promise<{ apiKeys: PluginApiKey[] }>;
  deleteApiKey(input: { body: { keyId: string }; headers: Headers }): Promise<unknown>;
};

export class BetterAuth
  implements SessionVerifier, OrgAdmin, SessionAdmin, AccessTokenVerifier, AppAccessAdmin
{
  protected auth: Auth;
  protected logger: Logger;
  protected mcp: CreateAuthOptions["mcp"];
  protected issuer: string;

  constructor(opts: CreateAuthOptions, auth?: Auth) {
    this.auth = auth ?? createAuth(opts);
    this.logger = opts.logger;
    this.mcp = opts.mcp;
    this.issuer = `${opts.baseUrl.replace(/\/+$/, "")}/api/auth`;
  }

  protected get pluginApi(): PluginApi {
    return this.auth.api as unknown as PluginApi;
  }

  async handler(request: Request): Promise<Response> {
    return this.auth.handler(request);
  }

  async authorizationServerMetadata(request: Request): Promise<Response> {
    return oauthProviderAuthServerMetadata(
      this.auth as unknown as Parameters<typeof oauthProviderAuthServerMetadata>[0],
    )(request);
  }

  async verifyAccess(request: AccessRequest): Promise<AccessGrant | null> {
    const apiKeyHeader = request.headers["x-api-key"];
    if (typeof apiKeyHeader === "string" && apiKeyHeader.length > 0) {
      return this.verifyApiKey(apiKeyHeader);
    }
    const authorization = accessTokenAuthorization(request.headers.authorization);
    if (!authorization) {
      return null;
    }
    if (authorization.scheme === "Bearer" && !isCompactJws(authorization.token)) {
      return this.verifyApiKey(authorization.token);
    }
    return this.mcp.oauthEnabled ? this.verifyAccessToken(authorization, request) : null;
  }

  protected async verifyAccessToken(
    authorization: AccessTokenAuthorization,
    request: AccessRequest,
  ): Promise<AccessGrant | null> {
    let claims: Awaited<ReturnType<typeof verifyJwsAccessToken>>;
    try {
      claims = await verifyJwsAccessToken(authorization.token, {
        jwksFetch: async () => this.pluginApi.getJwks(),
        verifyOptions: { audience: this.mcp.resource, issuer: this.issuer },
      });
    } catch {
      return null;
    }
    const ctx = await this.auth.$context;
    const proof = request.headers.dpop;
    try {
      await enforceDpopBinding({
        payload: claims,
        authorization,
        proofJwt: typeof proof === "string" ? proof : undefined,
        method: request.method,
        url: request.url,
        replayStore: createDpopReplayStore(ctx.internalAdapter),
      });
    } catch (error) {
      if (isDpopBindingError(error)) {
        return null;
      }
      throw error;
    }
    const grant = grantFromClaims(claims);
    if (!grant) {
      return null;
    }
    const consent = await ctx.adapter.findOne<{ scopes: string[] }>({
      model: "oauthConsent",
      where: [
        { field: "clientId", value: grant.clientId },
        { field: "userId", value: grant.userId },
        { field: "referenceId", value: grant.orgId },
      ],
    });
    return consent
      ? { ...grant, scopes: grant.scopes.filter((scope) => consent.scopes.includes(scope)) }
      : null;
  }

  protected async verifyApiKey(key: string): Promise<AccessGrant | null> {
    const result = await this.pluginApi.verifyApiKey({ body: { key } });
    if (!result.valid || !result.key) {
      return null;
    }
    const orgId = orgIdFromMetadata(result.key.metadata);
    if (!orgId) {
      return null;
    }
    return {
      userId: result.key.referenceId,
      orgId,
      scopes: permissionsToScopes(result.key.permissions),
      clientId: `api-key:${result.key.id}`,
    };
  }

  protected async sessionUserId(headers: HeaderBag): Promise<string> {
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(headers) });
    if (!session) {
      throw new OrganizationRuleError("No session");
    }
    return session.user.id;
  }

  async listConnectedApps(headers: HeaderBag, orgId: string): Promise<ConnectedApp[]> {
    const userId = await this.sessionUserId(headers);
    if (!this.mcp.oauthEnabled) {
      return [];
    }
    const ctx = await this.auth.$context;
    const consents = await ctx.adapter.findMany<{
      clientId: string;
      scopes: string[];
      createdAt: Date | null;
    }>({
      model: "oauthConsent",
      where: [
        { field: "userId", value: userId },
        { field: "referenceId", value: orgId },
      ],
    });
    return Promise.all(
      consents.map(async (consent) => {
        const client = await ctx.adapter.findOne<{ name: string | null; icon: string | null }>({
          model: "oauthClient",
          where: [{ field: "clientId", value: consent.clientId }],
        });
        return {
          clientId: consent.clientId,
          name: client?.name ?? consent.clientId,
          iconUrl: client?.icon ?? null,
          scopes: consent.scopes,
          connectedAt: consent.createdAt ?? new Date(0),
        };
      }),
    );
  }

  async revokeConnectedApp(headers: HeaderBag, orgId: string, clientId: string): Promise<void> {
    const userId = await this.sessionUserId(headers);
    if (!this.mcp.oauthEnabled) {
      return;
    }
    const ctx = await this.auth.$context;
    const where = [
      { field: "clientId", value: clientId },
      { field: "userId", value: userId },
      { field: "referenceId", value: orgId },
    ];
    await ctx.adapter.deleteMany({ model: "oauthAccessToken", where });
    await ctx.adapter.deleteMany({ model: "oauthRefreshToken", where });
    await ctx.adapter.deleteMany({ model: "oauthConsent", where });
  }

  async listApiKeys(headers: HeaderBag, orgId: string): Promise<ApiKeySummary[]> {
    const res = await this.pluginApi.listApiKeys({ headers: fromNodeHeaders(headers) });
    return res.apiKeys
      .filter((key) => orgIdFromMetadata(key.metadata) === orgId)
      .map((key) => ({
        id: key.id,
        name: key.name ?? null,
        start: key.start ?? null,
        scopes: permissionsToScopes(key.permissions),
        createdAt: new Date(key.createdAt),
        lastUsedAt: key.lastRequest ? new Date(key.lastRequest) : null,
      }));
  }

  async createApiKey(input: NewApiKey): Promise<CreatedApiKey> {
    const created = await this.pluginApi.createApiKey({
      body: {
        name: input.name,
        userId: input.authUserId,
        metadata: { organizationId: input.orgId },
        permissions: scopesToPermissions(input.scopes),
      },
    });
    return {
      id: created.id,
      name: created.name ?? null,
      start: created.start ?? null,
      scopes: permissionsToScopes(created.permissions),
      createdAt: new Date(created.createdAt),
      lastUsedAt: null,
      key: created.key,
    };
  }

  async deleteApiKey(headers: HeaderBag, orgId: string, keyId: string): Promise<void> {
    const owned = await this.listApiKeys(headers, orgId);
    if (!owned.some((key) => key.id === keyId)) {
      throw new OrganizationRuleError("That API key does not exist");
    }
    await this.pluginApi.deleteApiKey({ body: { keyId }, headers: fromNodeHeaders(headers) });
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
