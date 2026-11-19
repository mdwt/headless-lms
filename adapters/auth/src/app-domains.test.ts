import { describe, expect, it } from "vitest";
import { betterAuth } from "better-auth";
import { getSchema } from "better-auth/db";
import { memoryAdapter } from "better-auth/adapters/memory";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { BetterAuth, buildAuthOptions } from "./better-auth.js";
import type { CreateAuthOptions, RequestDomains } from "./types.js";

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
  const asked: Record<"reset" | "changed" | "magicLink" | "session", string[][]> = {
    reset: [],
    changed: [],
    magicLink: [],
    session: [],
  };
  const sessions: { refuse: boolean; activeOrganizationId: string | null } = {
    refuse: false,
    activeOrganizationId: null,
  };
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
      sendResetPassword: async ({ url }: { url: string }, from: RequestDomains) => {
        resets.push(url);
        asked.reset.push(from.domains);
      },
      onPasswordReset: async (_data: unknown, from: RequestDomains) => {
        asked.changed.push(from.domains);
      },
      sendMagicLink: async ({ url }: { url: string }, from: RequestDomains) => {
        magicLinks.push(url);
        asked.magicLink.push(from.domains);
      },
      beforeCreateSession: async (session: Record<string, unknown>, from: RequestDomains) => {
        asked.session.push(from.domains);
        if (sessions.refuse) {
          return false;
        }
        return sessions.activeOrganizationId
          ? { data: { ...session, activeOrganizationId: sessions.activeOrganizationId } }
          : undefined;
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

  const atApi = (link: string, headers: Record<string, string> = {}) => {
    const url = new URL(link);
    return new Request(`${API}${url.pathname}${url.search}`, {
      redirect: "manual",
      headers: { "sec-fetch-site": "none", "sec-fetch-mode": "navigate", ...headers },
    });
  };
  const adapter = new BetterAuth(
    {
      db: {} as NodePgDatabase,
      baseUrl: API,
      logger: logger as unknown as CreateAuthOptions["logger"],
      mcp: { oauthEnabled: false },
      cookieDomain: opts.cookieDomain,
    } as unknown as CreateAuthOptions,
    auth as unknown as ConstructorParameters<typeof BetterAuth>[1],
  );

  return {
    auth,
    adapter,
    hosts,
    resets,
    magicLinks,
    asked,
    sessions,
    post,
    signUp,
    signIn,
    settled,
    atApi,
  };
}

describe("sign-in from an app's domain", () => {
  it("is accepted from the domain of an organization's app and from a listed origin", async () => {
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

  it("follows a change of domains on the next request", async () => {
    const w = world();
    await w.signUp("sarah@example.com");
    w.hosts.set("https://club.acme.test", ["sarah@example.com"]);
    w.hosts.delete(ACME);
    expect((await w.signIn("sarah@example.com", "https://club.acme.test")).status).toBe(200);
    expect((await w.signIn("sarah@example.com", ACME)).status).toBe(403);
  });

  it("is refused from an app's domain when no domains are wired", async () => {
    const w = world({ orgHosts: false });
    await w.signUp("sarah@example.com");
    expect((await w.signIn("sarah@example.com", ACME)).status).toBe(403);
  });
});

describe("the session of a sign-in", () => {
  it("is decided with the domain the sign-in was asked from", async () => {
    const w = world();
    await w.signUp("sarah@example.com");
    w.asked.session.length = 0;
    await w.signIn("sarah@example.com", ACME);
    await w.signIn("sarah@example.com", ADMIN);
    expect(w.asked.session).toEqual([[ACME], [ADMIN]]);
  });

  it("is for the organization the hook names", async () => {
    const w = world();
    await w.signUp("sarah@example.com");
    w.sessions.activeOrganizationId = "org_acme";
    const res = await w.signIn("sarah@example.com", ACME);
    const cookie = res.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    const session = await w.auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.session.activeOrganizationId).toBe("org_acme");
  });

  it("is refused with a 401 and no cookie when the hook refuses it", async () => {
    const w = world();
    await w.signUp("james@example.com");
    w.sessions.refuse = true;
    const res = await w.signIn("james@example.com", ACME);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "FAILED_TO_CREATE_SESSION" });
    expect(res.headers.getSetCookie().some((cookie) => cookie.includes("session_token"))).toBe(
      false,
    );
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

  describe("with a cookie domain set", () => {
    const INSIDE = "https://acme.platform.test";
    const signInThrough = (w: ReturnType<typeof world>, origin: string) =>
      w.adapter.handler(
        new Request(`${API}/api/auth/sign-in/email`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            "sec-fetch-site": "same-origin",
            "sec-fetch-mode": "cors",
            "sec-fetch-dest": "empty",
          },
          body: JSON.stringify({ email: "sarah@example.com", password: PASSWORD }),
        }),
      );

    it("is host-only for an app on a domain outside it, and shared for one inside it", async () => {
      const w = world({ cookieDomain: ".platform.test" });
      w.hosts.set(INSIDE, ["sarah@example.com"]);
      await w.signUp("sarah@example.com");

      const outside = await signInThrough(w, ACME);
      expect(outside.status).toBe(200);
      expect(await outside.json()).toMatchObject({ user: { email: "sarah@example.com" } });
      const hostOnly = outside.headers.getSetCookie();
      expect(hostOnly.some((cookie) => cookie.includes("session_token"))).toBe(true);
      for (const cookie of hostOnly) {
        expect(cookie).not.toMatch(/domain=/i);
        expect(cookie).toMatch(/httponly/i);
        expect(cookie).toMatch(/path=\//i);
      }

      for (const origin of [INSIDE, ADMIN]) {
        const shared = (await signInThrough(w, origin)).headers.getSetCookie();
        expect(shared.length).toBeGreaterThan(0);
        for (const cookie of shared) {
          expect(cookie).toMatch(/domain=\.platform\.test/i);
        }
      }
    });

    it("goes by the return address of a link, not by where the click came from", async () => {
      const w = world({ cookieDomain: ".platform.test" });
      await w.signUp("sarah@example.com");
      const webmail = { referer: "https://mail.example.org/inbox" };

      await w.post("/sign-in/magic-link", ACME, {
        email: "sarah@example.com",
        callbackURL: `${ACME}/`,
      });
      const outside = await w.adapter.handler(w.atApi(w.magicLinks[0]!, webmail));
      expect(outside.status).toBe(302);
      for (const cookie of outside.headers.getSetCookie()) {
        expect(cookie).not.toMatch(/domain=/i);
      }

      await w.post("/sign-in/magic-link", ADMIN, {
        email: "sarah@example.com",
        callbackURL: `${ADMIN}/`,
      });
      const inside = await w.adapter.handler(w.atApi(w.magicLinks[1]!, webmail));
      expect(inside.headers.getSetCookie().length).toBeGreaterThan(0);
      for (const cookie of inside.headers.getSetCookie()) {
        expect(cookie).toMatch(/domain=\.platform\.test/i);
      }
    });
  });
});

describe("a password reset link to an app's domain", () => {
  const reset = (w: ReturnType<typeof world>, email: string, origin: string, host: string) =>
    w.post("/request-password-reset", origin, { email, redirectTo: `${host}/reset-password` });

  it("is sent to a person of that organization, written at the app's domain, and lands there with the token", async () => {
    const w = world();
    await w.signUp("sarah@example.com");
    expect((await reset(w, "sarah@example.com", ACME, ACME)).status).toBe(200);
    await w.settled();
    expect(w.resets).toHaveLength(1);
    expect(w.resets[0]).toMatch(
      new RegExp(`^${ACME}/api/auth/reset-password/[^/?]+\\?callbackURL=`),
    );
    expect(w.asked.reset).toEqual([[ACME]]);

    const res = await w.auth.handler(w.atApi(w.resets[0]!));
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!);
    expect(location.origin).toBe(ACME);
    expect(location.searchParams.get("token")).toBeTruthy();
  });

  it("names the domain of the page the new password was set on", async () => {
    const w = world();
    await w.signUp("sarah@example.com");
    await reset(w, "sarah@example.com", ACME, ACME);
    await w.settled();
    const opened = await w.auth.handler(w.atApi(w.resets[0]!));
    const token = new URL(opened.headers.get("location")!).searchParams.get("token");
    const changed = await w.post("/reset-password", ACME, {
      newPassword: "a new long password",
      token,
    });
    expect(changed.status).toBe(200);
    await w.settled();
    expect(w.asked.changed).toEqual([[ACME]]);
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

  it("is sent to anyone for a listed origin, and stays at the API's address", async () => {
    const w = world();
    await w.signUp("sarah@example.com");
    expect((await reset(w, "sarah@example.com", ADMIN, ADMIN)).status).toBe(200);
    await w.settled();
    expect(w.resets).toHaveLength(1);
    expect(w.resets[0]).toMatch(new RegExp(`^${API}/api/auth/reset-password/`));
    expect(w.asked.reset).toEqual([[ADMIN]]);
  });
});

describe("a sign-in link to an app's domain", () => {
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

  it("is written at the app's domain under /api, and names that domain", async () => {
    const w = world();
    await w.signUp("sarah@example.com");
    await link(w, "sarah@example.com", ACME);
    expect(w.magicLinks[0]).toMatch(new RegExp(`^${ACME}/api/auth/magic-link/verify\\?token=`));
    expect(w.asked.magicLink).toEqual([[ACME]]);
  });

  it("stays at the API's address for a listed origin", async () => {
    const w = world();
    await w.signUp("sarah@example.com");
    await link(w, "sarah@example.com", ADMIN);
    expect(w.magicLinks[0]).toMatch(new RegExp(`^${API}/api/auth/magic-link/verify\\?token=`));
    expect(w.asked.magicLink).toEqual([[ADMIN]]);
  });

  it("signs the person in when opened, with a session decided by the domain it returns to", async () => {
    const w = world();
    await w.signUp("sarah@example.com");
    await link(w, "sarah@example.com", ACME);
    w.asked.session.length = 0;
    w.sessions.activeOrganizationId = "org_acme";

    const res = await w.auth.handler(w.atApi(w.magicLinks[0]!));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${ACME}/home`);
    expect(w.asked.session).toEqual([[ACME]]);
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((cookie) => cookie.includes("session_token"))).toBe(true);
    for (const cookie of cookies) {
      expect(cookie).not.toMatch(/domain=/i);
    }
  });

  it("is decided by the domain it returns to, whatever page the click came from", async () => {
    const w = world();
    await w.signUp("sarah@example.com");
    await link(w, "sarah@example.com", ACME);
    w.asked.session.length = 0;
    await w.auth.handler(w.atApi(w.magicLinks[0]!, { referer: `${OTHER}/courses` }));
    expect(w.asked.session).toEqual([[ACME, OTHER]]);
  });

  it("signs nobody in when the session is refused", async () => {
    const w = world();
    await w.signUp("sarah@example.com");
    await link(w, "sarah@example.com", ACME);
    w.sessions.refuse = true;
    const res = await w.auth.handler(w.atApi(w.magicLinks[0]!));
    expect(res.status).toBe(302);
    expect(res.headers.getSetCookie().some((cookie) => cookie.includes("session_token"))).toBe(
      false,
    );
    const location = new URL(res.headers.get("location")!);
    expect(location.origin).toBe(ACME);
    expect(location.searchParams.get("error")).toBeTruthy();
  });
});
