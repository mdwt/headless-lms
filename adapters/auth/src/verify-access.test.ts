import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { betterAuth } from "better-auth";
import { getSchema } from "better-auth/db";
import { memoryAdapter } from "better-auth/adapters/memory";
import { deriveDpopAth, deriveDpopJkt } from "better-auth/oauth2";
import { signJWT } from "better-auth/plugins";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { type Auth, BetterAuth, buildAuthOptions } from "./better-auth.js";
import type { CreateAuthOptions } from "./types.js";

const RESOURCE = "http://localhost:8100/mcp";
const ISSUER = "http://localhost:8100/api/auth";
const noop = async () => undefined;
const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => logger,
};
const options: CreateAuthOptions = {
  db: {} as NodePgDatabase,
  baseUrl: "http://localhost:8100",
  secret: "a".repeat(32),
  trustedOrigins: [],
  logger: logger as unknown as CreateAuthOptions["logger"],
  hooks: { beforeUserCreate: noop } as unknown as CreateAuthOptions["hooks"],
  mcp: {
    oauthEnabled: true,
    resource: RESOURCE,
    loginPage: "http://localhost:8101/login",
    consentPage: "http://localhost:8101/oauth/consent",
    orgPickerPage: "http://localhost:8101/onboarding/select-organization",
  },
};

type ServerApiKeys = {
  createApiKey(input: { body: { name: string; userId: string } }): Promise<{ key: string }>;
};

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

async function dpopKey() {
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const { kty, crv, x, y } = await crypto.subtle.exportKey("jwk", keys.publicKey);
  const jwk = { kty: kty!, crv: crv!, x: x!, y: y! };
  const proof = async (accessToken: string, claims: Record<string, unknown> = {}) => {
    const header = { typ: "dpop+jwt", alg: "ES256", jwk };
    const payload = {
      jti: randomUUID(),
      htm: "POST",
      htu: RESOURCE,
      iat: Math.floor(Date.now() / 1000),
      ath: await deriveDpopAth(accessToken),
      ...claims,
    };
    const input = `${b64(header)}.${b64(payload)}`;
    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      keys.privateKey,
      Buffer.from(input),
    );
    return `${input}.${Buffer.from(signature).toString("base64url")}`;
  };
  return { jkt: await deriveDpopJkt(jwk), proof };
}

async function setup(verifierOptions: CreateAuthOptions = options) {
  const authOptions = buildAuthOptions(options);
  const tables = Object.fromEntries(
    Object.keys(getSchema(authOptions)).map((model) => [model, []]),
  );
  const auth = betterAuth({
    ...authOptions,
    database: memoryAdapter(tables),
    telemetry: { enabled: false },
  });
  const ctx = await auth.$context;
  const reserved = new Set<string>();
  ctx.internalAdapter.reserveVerificationValue = async ({ identifier }: { identifier: string }) => {
    if (reserved.has(identifier)) {
      return false;
    }
    reserved.add(identifier);
    return true;
  };
  await ctx.adapter.create({
    model: "oauthConsent",
    data: {
      clientId: "client_1",
      userId: "usr_1",
      referenceId: "org_1",
      scopes: ["courses:read", "courses:write"],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  const verifier = new BetterAuth(verifierOptions, auth as unknown as Auth);
  const token = (claims: Record<string, unknown> = {}) =>
    signJWT({ context: ctx } as unknown as Parameters<typeof signJWT>[0], {
      payload: {
        sub: "usr_1",
        client_id: "client_1",
        org_id: "org_1",
        scope: "courses:read courses:write",
        iss: ISSUER,
        aud: RESOURCE,
        ...claims,
      },
    });
  const verify = (authorization: string, proof?: string) =>
    verifier.verifyAccess({
      method: "POST",
      url: RESOURCE,
      headers: { authorization, ...(proof ? { dpop: proof } : {}) },
    });
  const verifyKey = (key: string) =>
    verifier.verifyAccess({ method: "POST", url: RESOURCE, headers: { "x-api-key": key } });
  return { auth, verifier, token, verify, verifyKey };
}

const grant = {
  userId: "usr_1",
  orgId: "org_1",
  clientId: "client_1",
  scopes: ["courses:read", "courses:write"],
};

describe("verifyAccess", () => {
  it("accepts a bearer token without a key binding", async () => {
    const { token, verify } = await setup();
    expect(await verify(`Bearer ${await token()}`)).toEqual(grant);
  });

  it("drops scopes the person has since unticked", async () => {
    const { auth, token, verify } = await setup();
    const ctx = await auth.$context;
    await ctx.adapter.update({
      model: "oauthConsent",
      where: [{ field: "clientId", value: "client_1" }],
      update: { scopes: ["courses:read"] },
    });
    expect(await verify(`Bearer ${await token()}`)).toEqual({ ...grant, scopes: ["courses:read"] });
  });

  it("refuses to move an api key to another organization", async () => {
    const { auth } = await setup();
    const api = auth.api as unknown as { updateApiKey(input: unknown): Promise<unknown> };
    await expect(
      api.updateApiKey({ body: { keyId: "key_1", metadata: { organizationId: "org_2" } } }),
    ).rejects.toMatchObject({ status: "FORBIDDEN" });
  });

  it("refuses a client request to create an api key", async () => {
    const { auth } = await setup();
    const api = auth.api as unknown as { createApiKey(input: unknown): Promise<unknown> };
    await expect(
      api.createApiKey({
        body: { name: "x", metadata: { organizationId: "org_2" } },
        headers: new Headers(),
      }),
    ).rejects.toMatchObject({ status: "FORBIDDEN" });
  });

  it("keeps only catalogue scopes from the token's scope claim", async () => {
    const { token, verify } = await setup();
    expect(await verify(`Bearer ${await token({ scope: "courses:read offline_access" })}`)).toEqual(
      { ...grant, scopes: ["courses:read"] },
    );
  });

  it("rejects a correctly signed token minted for another audience", async () => {
    const { token, verify } = await setup();
    expect(
      await verify(`Bearer ${await token({ aud: "http://localhost:8100/other" })}`),
    ).toBeNull();
  });

  it("rejects a correctly signed token from another issuer", async () => {
    const { token, verify } = await setup();
    expect(
      await verify(`Bearer ${await token({ iss: "http://localhost:9000/api/auth" })}`),
    ).toBeNull();
  });

  it("accepts a DPoP-bound token with a valid proof", async () => {
    const { token, verify } = await setup();
    const key = await dpopKey();
    const accessToken = await token({ cnf: { jkt: key.jkt } });
    expect(await verify(`DPoP ${accessToken}`, await key.proof(accessToken))).toEqual(grant);
  });

  it("rejects a proof made for another method or URL", async () => {
    const { token, verify } = await setup();
    const key = await dpopKey();
    const accessToken = await token({ cnf: { jkt: key.jkt } });
    expect(
      await verify(`DPoP ${accessToken}`, await key.proof(accessToken, { htm: "GET" })),
    ).toBeNull();
    expect(
      await verify(
        `DPoP ${accessToken}`,
        await key.proof(accessToken, { htu: "http://internal:3000/mcp" }),
      ),
    ).toBeNull();
  });

  it("rejects a replayed proof", async () => {
    const { token, verify } = await setup();
    const key = await dpopKey();
    const accessToken = await token({ cnf: { jkt: key.jkt } });
    const proof = await key.proof(accessToken);
    expect(await verify(`DPoP ${accessToken}`, proof)).toEqual(grant);
    expect(await verify(`DPoP ${accessToken}`, proof)).toBeNull();
  });

  it("rejects a DPoP-bound token without a proof", async () => {
    const { token, verify } = await setup();
    const key = await dpopKey();
    expect(await verify(`DPoP ${await token({ cnf: { jkt: key.jkt } })}`)).toBeNull();
  });

  it("rejects a proof signed by a key the token is not bound to", async () => {
    const { token, verify } = await setup();
    const bound = await dpopKey();
    const other = await dpopKey();
    const accessToken = await token({ cnf: { jkt: bound.jkt } });
    expect(await verify(`DPoP ${accessToken}`, await other.proof(accessToken))).toBeNull();
  });

  it("rejects a DPoP-bound token sent as a bearer token", async () => {
    const { token, verify } = await setup();
    const key = await dpopKey();
    const accessToken = await token({ cnf: { jkt: key.jkt } });
    expect(await verify(`Bearer ${accessToken}`)).toBeNull();
    expect(await verify(`Bearer ${accessToken}`, await key.proof(accessToken))).toBeNull();
  });

  it("rejects every access token when mcp oauth is off", async () => {
    const { token, verify } = await setup({
      ...options,
      mcp: { ...options.mcp, oauthEnabled: false },
    });
    expect(await verify(`Bearer ${await token()}`)).toBeNull();
  });

  it("still requires a live consent for a DPoP-bound token", async () => {
    const { token, verify } = await setup();
    const key = await dpopKey();
    const accessToken = await token({ cnf: { jkt: key.jkt }, client_id: "client_2" });
    expect(await verify(`DPoP ${accessToken}`, await key.proof(accessToken))).toBeNull();
  });
});

describe("api keys", () => {
  it("verifies a key to a grant holding exactly the scopes it was created with", async () => {
    const { verifier, verifyKey } = await setup();
    const created = await verifier.createApiKey({
      authUserId: "usr_1",
      orgId: "org_1",
      name: "CI",
      scopes: ["courses:read"],
    });
    expect(created.scopes).toEqual(["courses:read"]);
    expect(await verifyKey(created.key)).toEqual({
      userId: "usr_1",
      orgId: "org_1",
      scopes: ["courses:read"],
      clientId: `api-key:${created.id}`,
    });
  });

  it("refuses a key created without an organization", async () => {
    const { auth, verifyKey } = await setup();
    const created = await (auth.api as unknown as ServerApiKeys).createApiKey({
      body: { name: "bare", userId: "usr_1" },
    });
    expect(await verifyKey(created.key)).toBeNull();
  });
});
