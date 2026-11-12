import { describe, expect, it } from "vitest";
import { betterAuth } from "better-auth";
import { getSchema } from "better-auth/db";
import { memoryAdapter } from "better-auth/adapters/memory";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { buildAuthOptions } from "./better-auth.js";
import type { CreateAuthOptions } from "./types.js";

const API = "https://api.platform.test";
const ADMIN = "https://admin.platform.test";
const ACME = "https://learn.acme.test";
const OTHER = "https://learn.other.test";
const STRANGER = "https://stranger.test";
const PASSWORD = "correct horse battery";

const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => logger,
};

function world(opts: Pick<CreateAuthOptions, "cookieDomain"> & { orgHosts?: boolean } = {}) {
  const hosts = new Map<string, string[]>([
    [ACME, ["sarah@example.com"]],
    [OTHER, ["james@example.com"]],
  ]);
  const resets: string[] = [];
  const magicLinks: string[] = [];
  const options = buildAuthOptions({
    db: {} as NodePgDatabase,
    baseUrl: API,
    secret: "a".repeat(32),
    trustedOrigins: [ADMIN],
    ...(opts.orgHosts !== false && {
      orgHosts: {
        has: async (origin) => hosts.has(origin),
        hasFor: async (email, origin) => hosts.get(origin)?.includes(email) ?? false,
      },
    }),
    logger: logger as unknown as CreateAuthOptions["logger"],
    hooks: {
      beforeUserCreate: async () => undefined,
      sendResetPassword: async ({ url }: { url: string }) => {
        resets.push(url);
      },
      onPasswordReset: async () => undefined,
      sendMagicLink: async ({ url }: { url: string }) => {
        magicLinks.push(url);
      },
    } as unknown as CreateAuthOptions["hooks"],
    mcp: {
      oauthEnabled: false,
      resource: `${API}/mcp`,
      loginPage: `${ADMIN}/login`,
      consentPage: `${ADMIN}/oauth/consent`,
      orgPickerPage: `${ADMIN}/onboarding/select-organization`,
    },
    cookieDomain: opts.cookieDomain,
    secureCookies: true,
  });
  const tables = Object.fromEntries(Object.keys(getSchema(options)).map((model) => [model, []]));
  const auth = betterAuth({
    ...options,
    advanced: { ...options.advanced, disableOriginCheck: false, disableCSRFCheck: false },
    database: memoryAdapter(tables),
    rateLimit: { enabled: false },
    telemetry: { enabled: false },
  });

  function post(path: string, origin: string, body: unknown): Promise<Response> {
    return auth.handler(
      new Request(`${API}/api/auth${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin,
          "sec-fetch-site": "same-origin",
          "sec-fetch-mode": "cors",
          "sec-fetch-dest": "empty",
        },
        body: JSON.stringify(body),
      }),
    );
  }

  const signUp = (email: string, origin = ADMIN) =>
    post("/sign-up/email", origin, { email, password: PASSWORD, name: "Sarah Lee" });
  const signIn = (email: string, origin: string) =>
    post("/sign-in/email", origin, { email, password: PASSWORD });

  async function settled(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  return { auth, hosts, resets, magicLinks, post, signUp, signIn, settled };
}

describe("sign-in from an organization's host", () => {
  it("is accepted from a host of an organization and from a listed origin", async () => {
    const w = world();
    await w.signUp("sarah@example.com");
    expect((await w.signIn("sarah@example.com", ACME)).status).toBe(200);
    expect((await w.signIn("sarah@example.com", ADMIN)).status).toBe(200);
  });

  it("is refused from any other origin", async () => {
    const w = world();
    await w.signUp("sarah@example.com");
    expect((await w.signIn("sarah@example.com", STRANGER)).status).toBe(403);
    expect((await w.signIn("sarah@example.com", `${ACME}.stranger.test`)).status).toBe(403);
  });

  it("follows a change of hosts on the next request", async () => {
    const w = world();
    await w.signUp("sarah@example.com");
    w.hosts.set("https://club.acme.test", ["sarah@example.com"]);
    w.hosts.delete(ACME);
    expect((await w.signIn("sarah@example.com", "https://club.acme.test")).status).toBe(200);
    expect((await w.signIn("sarah@example.com", ACME)).status).toBe(403);
  });

  it("is refused from an organization's host when no hosts are wired", async () => {
    const w = world({ orgHosts: false });
    await w.signUp("sarah@example.com");
    expect((await w.signIn("sarah@example.com", ACME)).status).toBe(403);
  });
});

describe("the session cookie", () => {
  it("is host-only when no cookie domain is set", async () => {
    const w = world();
    await w.signUp("sarah@example.com");
    const cookies = (await w.signIn("sarah@example.com", ACME)).headers.getSetCookie();
    expect(cookies.some((cookie) => cookie.includes("session_token"))).toBe(true);
    for (const cookie of cookies) {
      expect(cookie).not.toMatch(/domain=/i);
      expect(cookie).toMatch(/httponly/i);
      expect(cookie).toMatch(/secure/i);
      expect(cookie).toMatch(/samesite=lax/i);
    }
  });

  it("carries the cookie domain when one is set", async () => {
    const w = world({ cookieDomain: ".platform.test" });
    await w.signUp("sarah@example.com");
    const cookies = (await w.signIn("sarah@example.com", ADMIN)).headers.getSetCookie();
    expect(cookies.length).toBeGreaterThan(0);
    for (const cookie of cookies) {
      expect(cookie).toMatch(/domain=\.platform\.test/i);
    }
  });
});

describe("a password reset link to an organization's host", () => {
  const reset = (w: ReturnType<typeof world>, email: string, origin: string, host: string) =>
    w.post("/request-password-reset", origin, { email, redirectTo: `${host}/reset-password` });

  it("is sent to a person of that organization and lands on the host with the token", async () => {
    const w = world();
    await w.signUp("sarah@example.com");
    expect((await reset(w, "sarah@example.com", ACME, ACME)).status).toBe(200);
    await w.settled();
    expect(w.resets).toHaveLength(1);

    const res = await w.auth.handler(new Request(w.resets[0]!, { redirect: "manual" }));
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!);
    expect(location.origin).toBe(ACME);
    expect(location.searchParams.get("token")).toBeTruthy();
  });

  it("is not sent when the host belongs to an organization the person is not in", async () => {
    const w = world();
    await w.signUp("sarah@example.com");
    expect((await reset(w, "sarah@example.com", OTHER, OTHER)).status).toBe(200);
    expect((await reset(w, "sarah@example.com", ACME, OTHER)).status).toBe(403);
    await w.settled();
    expect(w.resets).toHaveLength(0);
  });

  it("is refused for a host of no organization", async () => {
    const w = world();
    await w.signUp("sarah@example.com");
    expect((await reset(w, "sarah@example.com", ACME, STRANGER)).status).toBe(403);
    await w.settled();
    expect(w.resets).toHaveLength(0);
  });

  it("is sent to anyone for a listed origin", async () => {
    const w = world();
    await w.signUp("sarah@example.com");
    expect((await reset(w, "sarah@example.com", ADMIN, ADMIN)).status).toBe(200);
    await w.settled();
    expect(w.resets).toHaveLength(1);
  });
});

describe("a magic link to an organization's host", () => {
  const link = (w: ReturnType<typeof world>, email: string, host: string) =>
    w.post("/sign-in/magic-link", host, { email, callbackURL: `${host}/home` });

  it("is sent only to a person of that organization", async () => {
    const w = world();
    await w.signUp("sarah@example.com");
    await link(w, "sarah@example.com", OTHER);
    expect(w.magicLinks).toHaveLength(0);
    await link(w, "sarah@example.com", ACME);
    expect(w.magicLinks).toHaveLength(1);
  });
});
