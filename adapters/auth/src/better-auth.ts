import type {
  AccessGrant,
  AccessRequest,
  AccessTokenVerifier,
  ActiveSession,
  ConnectedApp,
  HeaderBag,
  Logger,
  NewOrganizationInput,
  SessionVerifier,
} from "@headless-lms/core/types";
import type { IncomingHttpHeaders } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import {
  APIError,
  betterAuth,
  type BetterAuthOptions,
  type BetterAuthPlugin,
  type GenericEndpointContext,
} from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import type { AppDomains, CreateAuthOptions } from "./types.js";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import * as authSchema from "@headless-lms/adapter-db/schema/better-auth";
import { prefixId } from "@headless-lms/core/shared/id";
import { ConflictError, NotFoundError } from "@headless-lms/core/shared/errors";
import { jwt, magicLink, organization } from "better-auth/plugins";
import { getOrgAdapter } from "better-auth/plugins/organization";
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
import { getIP } from "@better-auth/core/utils/ip";
import { and, count, eq, sql } from "drizzle-orm";
import { ac, OWNER_MEMBERSHIP, PARTICIPANT_MEMBERSHIP, roles } from "./access.js";
import {
  accessTokenAuthorization,
  consentOrgId,
  grantFromClaims,
  isCompactJws,
  needsOrgChoice,
  orgIdFromMetadata,
  roleFromMetadata,
} from "./access-grant.js";
import { withLoopbackNativeDefault } from "./client-registration.js";
import {
  ALL_PERMISSIONS,
  type Accounts,
  type ApiKeys,
  type AuthHeaders,
  type AuthOrganization,
  type NewApiKey,
  type OrgAdmin,
  OrganizationRuleError,
  type PlatformAccount,
  type StoredApiKey,
  type UpdateOrganizationInput,
} from "@headless-lms/core/organizations";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  ORG_CLAIM,
  type SessionAdmin,
} from "@headless-lms/core/identity";

const JWT_ALG = "EdDSA";

export const API_KEY_PREFIX = "hlms_";
const API_KEY_NAME_MAX = 80;
const DAY_SECONDS = 24 * 60 * 60;

const OPEN_ORG_ENDPOINTS = new Set([
  "/organization/set-active",
  "/organization/list",
  "/organization/get-active-member",
]);

const CORE_API_KEY_ENDPOINTS = new Set([
  "/api-key/get",
  "/api-key/list",
  "/api-key/update",
  "/api-key/delete",
]);

const OAUTH_CLIENT_WRITES = new Set([
  "/oauth2/create-client",
  "/oauth2/update-client",
  "/oauth2/delete-client",
]);

const CALLBACK_PARAMS = ["callbackURL", "errorCallbackURL", "newUserCallbackURL"];

function webOrigin(value: string | null): string | null {
  if (!value || !URL.canParse(value)) {
    return null;
  }
  const url = new URL(value);
  const web = url.protocol === "https:" || url.protocol === "http:";
  return web && !url.hostname.includes("*") ? url.origin : null;
}

function callbackOrigins(url: string): string[] {
  if (!URL.canParse(url)) {
    return [];
  }
  const { searchParams } = new URL(url);
  return CALLBACK_PARAMS.map((name) => webOrigin(searchParams.get(name))).filter(
    (origin): origin is string => origin !== null,
  );
}

function pageOrigin(headers: Headers): string | null {
  return webOrigin(headers.get("origin")) ?? webOrigin(headers.get("referer"));
}

function returnOrigin(link: string): string | null {
  return URL.canParse(link) ? webOrigin(new URL(link).searchParams.get("callbackURL")) : null;
}

function requestDomains(headers: Headers, url?: string): string[] {
  const page = pageOrigin(headers);
  return [...new Set([...(url ? callbackOrigins(url) : []), ...(page ? [page] : [])])];
}

function sessionDomains(ctx: GenericEndpointContext | null): string[] {
  const headers = ctx?.request?.headers ?? ctx?.headers;
  return headers ? requestDomains(headers, ctx?.request?.url) : [];
}

function within(origin: string, cookieDomain: string): boolean {
  const host = new URL(origin).hostname.toLowerCase();
  const parent = cookieDomain.replace(/^\./, "").toLowerCase();
  return host === parent || host.endsWith(`.${parent}`);
}

function hostOnlyCookies(response: Response): Response {
  const cookies = response.headers.getSetCookie();
  if (cookies.length === 0) {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.delete("set-cookie");
  for (const cookie of cookies) {
    headers.append("set-cookie", cookie.replace(/;\s*domain=[^;]*/i, ""));
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

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
      scopes: [...ALL_PERMISSIONS, "offline_access"],
      clientRegistrationDefaultScopes: [...ALL_PERMISSIONS, "offline_access"],
      accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      postLogin: {
        page: opts.mcp.orgPickerPage,
        shouldRedirect: ({ session, user }) =>
          needsOrgChoice(activeOrgOf(session), () => memberOrgIds(opts.db, user.id)),
        consentReferenceId: async ({ session, user }) => {
          const orgId = await consentOrgId(activeOrgOf(session), () =>
            memberOrgIds(opts.db, user.id),
          );
          if (!orgId) {
            throw new APIError("FORBIDDEN", {
              message: "Choose an organization you are a member of",
            });
          }
          return orgId;
        },
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

  const appDomains = opts.appDomains;
  const appDomainsOf = async (request: Request | undefined): Promise<string[]> => {
    if (!appDomains || !request) {
      return [];
    }
    const trusted: string[] = [];
    for (const origin of requestDomains(request.headers, request.url)) {
      if (!opts.trustedOrigins.includes(origin) && (await appDomains.has(origin))) {
        trusted.push(origin);
      }
    }
    return trusted;
  };
  const written = async (
    email: string,
    link: string,
  ): Promise<{ url: string; domains: string[] } | null> => {
    const returnTo = returnOrigin(link);
    const domains = returnTo ? [returnTo] : [];
    if (!appDomains) {
      return { url: link, domains };
    }
    const decided = await appDomains.linkDomain(email, returnTo, callbackOrigins(link));
    if (decided.refused) {
      return null;
    }
    if (!decided.domain) {
      return { url: link, domains };
    }
    const { pathname, search } = new URL(link);
    return { url: `${decided.domain}${pathname}${search}`, domains };
  };

  return {
    baseURL: opts.baseUrl,
    secret: opts.secret,
    trustedOrigins: appDomains
      ? async (request?: Request) => [...opts.trustedOrigins, ...(await appDomainsOf(request))]
      : opts.trustedOrigins,
    logger: {
      log: (level, message, ...args) => {
        const [first] = args;
        opts.logger[level](
          message,
          first instanceof Error ? { err: first } : args.length > 0 ? { details: args } : undefined,
        );
      },
    },
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
      ipAddress: {
        ...(opts.trustedProxies?.length && { trustedProxies: opts.trustedProxies }),
        ...(opts.ipAddressHeaders?.length && { ipAddressHeaders: opts.ipAddressHeaders }),
      },
      database: {
        // Prefixed, KSUID-bodied ids for every better-auth table (usr_, org_, …).
        generateId: () => prefixId("id"),
      },
      // Cross-subdomain shared session cookie for admin/api/web on one parent
      // domain (e.g. `.example.com` in prod). Without a domain the cookie is
      // host-only: set for whichever host served the request.
      crossSubDomainCookies: opts.cookieDomain
        ? { enabled: true, domain: opts.cookieDomain }
        : { enabled: false },
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
      sendResetPassword: detached("sendResetPassword", async (data) => {
        const link = await written(data.user.email, data.url);
        if (link) {
          await sendResetPassword({ ...data, url: link.url }, { domains: link.domains });
        }
      }),
      onPasswordReset: detached("onPasswordReset", async (data, request?: Request) => {
        const page = request ? pageOrigin(request.headers) : null;
        await onPasswordReset(data, { domains: page ? [page] : [] });
      }),
      revokeSessionsOnPasswordReset: true,
    },
    plugins: [
      magicLink({
        disableSignUp: true,
        sendMagicLink: async (data) => {
          const link = await written(data.email, data.url);
          if (link) {
            await sendMagicLink({ ...data, url: link.url }, { domains: link.domains });
          }
        },
      }),
      organization({
        ac,
        roles,
        creatorRole: OWNER_MEMBERSHIP,
        membershipLimit: Number.MAX_SAFE_INTEGER,
        organizationHooks: opts.hooks,
      }),
      jwt({
        disableSettingJwtHeader: true,
        jwks: { keyPairConfig: { alg: JWT_ALG } },
      }) as BetterAuthPlugin,
      ...(opts.mcp.oauthEnabled ? mcpOAuthPlugins(opts) : []),
      apiKey({
        enableMetadata: true,
        defaultPrefix: API_KEY_PREFIX,
        maximumNameLength: API_KEY_NAME_MAX,
        rateLimit: { enabled: false },
      }) as BetterAuthPlugin,
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/api-key/create" && (ctx.request || ctx.headers)) {
          throw new APIError("FORBIDDEN", { message: "API keys are created through the LMS" });
        }
        if (
          ctx.request &&
          ctx.path.startsWith("/organization/") &&
          !OPEN_ORG_ENDPOINTS.has(ctx.path)
        ) {
          throw new APIError("FORBIDDEN", { message: "Organizations are managed through the LMS" });
        }
        if (ctx.request && CORE_API_KEY_ENDPOINTS.has(ctx.path)) {
          throw new APIError("FORBIDDEN", { message: "API keys are managed through the LMS" });
        }
        if (OAUTH_CLIENT_WRITES.has(ctx.path) && (ctx.request || ctx.headers)) {
          throw new APIError("FORBIDDEN", {
            message: "Apps register themselves when they connect",
          });
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
          before: beforeCreateSession
            ? (session, ctx) => beforeCreateSession(session, { domains: sessionDomains(ctx) })
            : undefined,
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

type ApiKeyRow = {
  id: string;
  name: string | null;
  start: string | null;
  referenceId: string;
  metadata: unknown;
  createdAt: Date | string;
  lastRequest: Date | string | null;
  expiresAt: Date | string | null;
};

type PluginApi = {
  getJwks(): Promise<JSONWebKeySet>;
  verifyApiKey(input: {
    body: { key: string };
  }): Promise<{ valid: boolean; key: ApiKeyRow | null }>;
  createApiKey(input: {
    body: {
      name: string;
      userId: string;
      metadata: Record<string, unknown>;
      expiresIn?: number;
    };
  }): Promise<ApiKeyRow & { key: string }>;
};

function toStored(key: ApiKeyRow): StoredApiKey {
  return {
    id: key.id,
    name: key.name ?? null,
    start: key.start ?? null,
    roleKey: roleFromMetadata(key.metadata),
    createdAt: new Date(key.createdAt),
    lastUsedAt: key.lastRequest ? new Date(key.lastRequest) : null,
    expiresAt: key.expiresAt ? new Date(key.expiresAt) : null,
  };
}

function apiKeyHeader(headers: HeaderBag): string | null {
  const header = headers["x-api-key"];
  if (typeof header === "string" && header.length > 0) {
    return header;
  }
  const authorization = accessTokenAuthorization(headers.authorization);
  if (authorization?.scheme === "Bearer" && !isCompactJws(authorization.token)) {
    return authorization.token;
  }
  return null;
}

export class BetterAuth
  implements SessionVerifier, OrgAdmin, SessionAdmin, AccessTokenVerifier, ApiKeys, Accounts
{
  protected auth: Auth;
  protected db: CreateAuthOptions["db"];
  protected logger: Logger;
  protected mcp: CreateAuthOptions["mcp"];
  protected issuer: string;
  protected cookieDomain: string | undefined;
  protected appDomains: AppDomains | undefined;
  protected jwksCacheKey = {};

  constructor(opts: CreateAuthOptions, auth?: Auth) {
    this.auth = auth ?? createAuth(opts);
    this.db = opts.db;
    this.logger = opts.logger;
    this.mcp = opts.mcp;
    this.issuer = `${opts.baseUrl.replace(/\/+$/, "")}/api/auth`;
    this.cookieDomain = opts.cookieDomain;
    this.appDomains = opts.appDomains;
  }

  protected get pluginApi(): PluginApi {
    return this.auth.api as unknown as PluginApi;
  }

  async handler(request: Request): Promise<Response> {
    const response = await this.auth.handler(request);
    if (response.headers.getSetCookie().length === 0) {
      return response;
    }
    return (await this.outsideCookieDomain(request)) ? hostOnlyCookies(response) : response;
  }

  private async outsideCookieDomain(request: Request): Promise<boolean> {
    if (!this.cookieDomain || !this.appDomains) {
      return false;
    }
    try {
      for (const domain of requestDomains(request.headers, request.url)) {
        if (within(domain, this.cookieDomain)) {
          return false;
        }
        if (await this.appDomains.has(domain)) {
          return true;
        }
      }
    } catch (err) {
      this.logger.error("could not tell whether the request is from an app's domain", { err });
    }
    return false;
  }

  clientIp(headers: IncomingHttpHeaders): string | null {
    return getIP(fromNodeHeaders(headers), this.auth.options);
  }

  async authorizationServerMetadata(request: Request): Promise<Response> {
    return oauthProviderAuthServerMetadata(
      this.auth as unknown as Parameters<typeof oauthProviderAuthServerMetadata>[0],
    )(request);
  }

  async verifyAccess(request: AccessRequest): Promise<AccessGrant | null> {
    const key = apiKeyHeader(request.headers);
    if (key) {
      return this.grantForKey(key);
    }
    const authorization = accessTokenAuthorization(request.headers.authorization);
    if (!authorization) {
      return null;
    }
    return this.mcp.oauthEnabled ? this.verifyAccessToken(authorization, request) : null;
  }

  async verifyApiKey(headers: HeaderBag): Promise<AccessGrant | null> {
    const key = apiKeyHeader(headers);
    return key ? this.grantForKey(key) : null;
  }

  protected async verifyAccessToken(
    authorization: AccessTokenAuthorization,
    request: AccessRequest,
  ): Promise<AccessGrant | null> {
    let claims: Awaited<ReturnType<typeof verifyJwsAccessToken>>;
    try {
      claims = await verifyJwsAccessToken(authorization.token, {
        jwksFetch: async () => this.pluginApi.getJwks(),
        jwksCacheKey: this.jwksCacheKey,
        verifyOptions: {
          audience: this.mcp.resource,
          issuer: this.issuer,
          algorithms: [JWT_ALG],
        },
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
    if (!consent || !("scopes" in grant.limit)) {
      return null;
    }
    return {
      ...grant,
      limit: { scopes: grant.limit.scopes.filter((scope) => consent.scopes.includes(scope)) },
    };
  }

  protected async grantForKey(key: string): Promise<AccessGrant | null> {
    const result = await this.pluginApi.verifyApiKey({ body: { key } });
    if (!result.valid || !result.key) {
      return null;
    }
    const orgId = orgIdFromMetadata(result.key.metadata);
    const roleKey = roleFromMetadata(result.key.metadata);
    if (!orgId || !roleKey) {
      return null;
    }
    return {
      userId: result.key.referenceId,
      orgId,
      clientId: `api-key:${result.key.id}`,
      limit: { roleKey },
    };
  }

  protected async ownKeys(orgId: string, userExternalId: string): Promise<ApiKeyRow[]> {
    const ctx = await this.auth.$context;
    const keys = await ctx.adapter.findMany<ApiKeyRow>({
      model: "apikey",
      where: [{ field: "referenceId", value: userExternalId }],
    });
    return keys.filter((key) => orgIdFromMetadata(key.metadata) === orgId);
  }

  async list(orgId: string, userExternalId: string): Promise<StoredApiKey[]> {
    return (await this.ownKeys(orgId, userExternalId)).map(toStored);
  }

  async create(
    orgId: string,
    userExternalId: string,
    input: NewApiKey,
  ): Promise<StoredApiKey & { key: string }> {
    const created = await this.pluginApi.createApiKey({
      body: {
        name: input.name,
        userId: userExternalId,
        metadata: { organizationId: orgId, role: input.roleKey },
        ...(input.expiresInDays !== undefined && {
          expiresIn: input.expiresInDays * DAY_SECONDS,
        }),
      },
    });
    return { ...toStored(created), key: created.key };
  }

  async countWithRole(orgId: string, roleKey: string): Promise<number> {
    const metadata = sql`${authSchema.apikey.metadata}::jsonb`;
    const [row] = await this.db
      .select({ value: count() })
      .from(authSchema.apikey)
      .where(
        and(
          sql`${metadata} ->> 'organizationId' = ${orgId}`,
          sql`${metadata} ->> 'role' = ${roleKey}`,
        ),
      );
    return row?.value ?? 0;
  }

  async createAccount(input: PlatformAccount): Promise<{ externalId: string }> {
    const ctx = await this.auth.$context;
    const user = await ctx.internalAdapter.createUser(
      { email: input.email, name: input.name, emailVerified: true },
      { method: "admin" },
    );
    return { externalId: user.id };
  }

  async revoke(orgId: string, userExternalId: string, keyId: string): Promise<void> {
    const owned = await this.ownKeys(orgId, userExternalId);
    if (!owned.some((key) => key.id === keyId)) {
      throw new NotFoundError("API key", keyId);
    }
    const ctx = await this.auth.$context;
    await ctx.adapter.delete({ model: "apikey", where: [{ field: "id", value: keyId }] });
  }

  async listConnectedApps(orgId: string, userExternalId: string): Promise<ConnectedApp[]> {
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
        { field: "userId", value: userExternalId },
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

  async revokeConnectedApp(orgId: string, userExternalId: string, clientId: string): Promise<void> {
    if (!this.mcp.oauthEnabled) {
      return;
    }
    const ctx = await this.auth.$context;
    const where = [
      { field: "clientId", value: clientId },
      { field: "userId", value: userExternalId },
      { field: "referenceId", value: orgId },
    ];
    await ctx.adapter.deleteMany({ model: "oauthAccessToken", where });
    await ctx.adapter.deleteMany({ model: "oauthRefreshToken", where });
    await ctx.adapter.deleteMany({ model: "oauthConsent", where });
  }

  async revokeAllFor(orgId: string, userExternalId: string): Promise<void> {
    const ctx = await this.auth.$context;
    const keys = await this.ownKeys(orgId, userExternalId);
    for (const key of keys) {
      await ctx.adapter.delete({ model: "apikey", where: [{ field: "id", value: key.id }] });
    }
    if (this.mcp.oauthEnabled) {
      const where = [
        { field: "userId", value: userExternalId },
        { field: "referenceId", value: orgId },
      ];
      await ctx.adapter.deleteMany({ model: "oauthAccessToken", where });
      await ctx.adapter.deleteMany({ model: "oauthRefreshToken", where });
      await ctx.adapter.deleteMany({ model: "oauthConsent", where });
    }
    this.logger.info("access revoked for person", {
      orgId,
      userExternalId,
      apiKeys: keys.length,
    });
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
        activeOrganizationId: res.session.activeOrganizationId ?? null,
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

  async createOrganizationFor(
    ownerExternalId: string,
    input: NewOrganizationInput,
  ): Promise<AuthOrganization> {
    let org: Awaited<ReturnType<Auth["api"]["createOrganization"]>>;
    try {
      org = await this.auth.api.createOrganization({
        body: { name: input.name, slug: input.slug, userId: ownerExternalId },
      });
    } catch (err) {
      if (err instanceof APIError && err.body?.code === "ORGANIZATION_ALREADY_EXISTS") {
        throw new ConflictError("That slug is already in use");
      }
      throw err;
    }
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
  protected async orgAdapter() {
    const context = await this.auth.$context;
    return getOrgAdapter(context as unknown as Parameters<typeof getOrgAdapter>[0], {});
  }

  async updateOrganization(externalId: string, input: UpdateOrganizationInput): Promise<void> {
    const data = {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.slug !== undefined && { slug: input.slug }),
    };
    if (Object.keys(data).length === 0) {
      return;
    }
    const adapter = await this.orgAdapter();
    const updated = await adapter.updateOrganization(externalId, data);
    if (!updated) {
      throw new NotFoundError("Organization", externalId);
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
  async grantMembership(orgExternalId: string, userExternalId: string): Promise<void> {
    const adapter = await this.orgAdapter();
    const existing = await adapter.findMemberByOrgId({
      userId: userExternalId,
      organizationId: orgExternalId,
    });
    if (existing) {
      return;
    }
    await adapter.createMember({
      organizationId: orgExternalId,
      userId: userExternalId,
      role: PARTICIPANT_MEMBERSHIP,
    });
  }

  async setMembershipOwner(
    orgExternalId: string,
    userExternalId: string,
    owner: boolean,
  ): Promise<void> {
    const adapter = await this.orgAdapter();
    const role = owner ? OWNER_MEMBERSHIP : PARTICIPANT_MEMBERSHIP;
    const existing = await adapter.findMemberByOrgId({
      userId: userExternalId,
      organizationId: orgExternalId,
    });
    if (!existing) {
      await adapter.createMember({ organizationId: orgExternalId, userId: userExternalId, role });
      return;
    }
    if (existing.role !== role) {
      await adapter.updateMember(existing.id, role);
    }
  }

  async removeMembership(orgExternalId: string, userExternalId: string): Promise<void> {
    const adapter = await this.orgAdapter();
    const existing = await adapter.findMemberByOrgId({
      userId: userExternalId,
      organizationId: orgExternalId,
    });
    if (!existing) {
      return;
    }
    await adapter.deleteMember({
      memberId: existing.id,
      organizationId: orgExternalId,
      userId: userExternalId,
    });
  }
}
