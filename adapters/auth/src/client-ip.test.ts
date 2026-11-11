import { describe, expect, it } from "vitest";
import { betterAuth } from "better-auth";
import { getSchema } from "better-auth/db";
import { memoryAdapter } from "better-auth/adapters/memory";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { buildAuthOptions } from "./better-auth.js";
import type { CreateAuthOptions } from "./types.js";

const noop = async () => undefined;
const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => logger,
};

function memoryAuth(ip: Pick<CreateAuthOptions, "trustedProxies" | "ipAddressHeaders">) {
  const options = buildAuthOptions({
    db: {} as NodePgDatabase,
    baseUrl: "http://localhost:8100",
    secret: "a".repeat(32),
    trustedOrigins: [],
    logger: logger as unknown as CreateAuthOptions["logger"],
    hooks: { beforeUserCreate: noop } as unknown as CreateAuthOptions["hooks"],
    mcp: {
      oauthEnabled: false,
      resource: "http://localhost:8100/mcp",
      loginPage: "http://localhost:8101/login",
      consentPage: "http://localhost:8101/oauth/consent",
      orgPickerPage: "http://localhost:8101/onboarding/select-organization",
    },
    ...ip,
  });
  const tables = Object.fromEntries(Object.keys(getSchema(options)).map((model) => [model, []]));
  return betterAuth({
    ...options,
    database: memoryAdapter(tables),
    rateLimit: { enabled: true, storage: "memory" },
    telemetry: { enabled: false },
  });
}

type Auth = ReturnType<typeof memoryAuth>;

async function signIn(auth: Auth, headers: Record<string, string>): Promise<number> {
  const res = await auth.handler(
    new Request("http://localhost:8100/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ email: "sarah@example.com", password: "not-her-password" }),
    }),
  );
  return res.status;
}

async function untilLimited(auth: Auth, headers: Record<string, string>): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt++) {
    if ((await signIn(auth, headers)) === 429) {
      return;
    }
  }
  throw new Error("the sign-in limit was never reached");
}

const CDN = "198.51.100.20";
const sarah = { "x-forwarded-for": `203.0.113.7, ${CDN}` };
const james = { "x-forwarded-for": `203.0.113.8, ${CDN}` };

describe("sign-in rate limit behind proxies", () => {
  it("is shared by everyone when the proxies are not named", async () => {
    const auth = memoryAuth({});
    await untilLimited(auth, sarah);
    expect(await signIn(auth, james)).toBe(429);
  });

  it("counts each client separately once the proxies are named", async () => {
    const auth = memoryAuth({ trustedProxies: ["198.51.100.0/24"] });
    await untilLimited(auth, sarah);
    expect(await signIn(auth, sarah)).toBe(429);
    expect(await signIn(auth, james)).not.toBe(429);
  });

  it("reads the client from a named header", async () => {
    const auth = memoryAuth({ ipAddressHeaders: ["x-client-ip"] });
    await untilLimited(auth, { ...sarah, "x-client-ip": "203.0.113.7" });
    expect(await signIn(auth, { ...james, "x-client-ip": "203.0.113.8" })).not.toBe(429);
  });

  it("ignores an address the client put in front of the chain", async () => {
    const auth = memoryAuth({ trustedProxies: ["198.51.100.0/24"] });
    await untilLimited(auth, sarah);
    expect(await signIn(auth, { "x-forwarded-for": `192.0.2.99, 203.0.113.7, ${CDN}` })).toBe(429);
  });
});
