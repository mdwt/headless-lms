import { describe, expect, it } from "vitest";

import { forwardToApi } from "./forward";

const API = "http://api.internal:8000";

type Seen = {
  url: string;
  method: string;
  headers: Headers;
  body: string | null;
  redirect: string;
};

function api(answer: (seen: Seen) => Response) {
  const calls: Seen[] = [];
  const send = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = init?.body ? await new Response(init.body as ReadableStream).text() : null;
    const seen: Seen = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body,
      redirect: init?.redirect ?? "follow",
    };
    calls.push(seen);
    return answer(seen);
  }) as typeof fetch;
  return { calls, send };
}

const visitor = { host: "learn.acme.com", "x-forwarded-proto": "https" };

describe("forwardToApi", () => {
  it("sends the same path and query to the API, with the cookie and the visitor's IP address", async () => {
    const { calls, send } = api(() => Response.json({ ok: true }));
    const res = await forwardToApi(
      new Request("https://learn.acme.com/api/member/courses?page=2", {
        headers: { ...visitor, cookie: "session=1", "x-forwarded-for": "203.0.113.7" },
      }),
      API,
      send,
    );
    expect(await res.json()).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${API}/api/member/courses?page=2`);
    expect(calls[0]!.headers.get("cookie")).toBe("session=1");
    expect(calls[0]!.headers.get("x-forwarded-for")).toBe("203.0.113.7");
    expect(calls[0]!.headers.has("host")).toBe(false);
  });

  it("names its own domain as the Origin of a read that carries none", async () => {
    const { calls, send } = api(() => Response.json({}));
    await forwardToApi(
      new Request("https://learn.acme.com/api/app", { headers: visitor }),
      API,
      send,
    );
    expect(calls[0]!.headers.get("origin")).toBe("https://learn.acme.com");
  });

  it("passes the Origin the browser sent, and never adds one to a write", async () => {
    const { calls, send } = api(() => Response.json({}));
    const body = JSON.stringify({ email: "sarah@example.com", password: "secret" });
    await forwardToApi(
      new Request("https://learn.acme.com/api/auth/sign-in/email", {
        method: "POST",
        headers: { ...visitor, origin: "https://evil.example", "content-type": "application/json" },
        body,
      }),
      API,
      send,
    );
    await forwardToApi(
      new Request("https://learn.acme.com/api/auth/sign-in/email", {
        method: "POST",
        headers: { ...visitor, "content-type": "application/json" },
        body,
      }),
      API,
      send,
    );
    await forwardToApi(
      new Request("https://learn.acme.com/api/app", {
        headers: { ...visitor, origin: "https://other.example" },
      }),
      API,
      send,
    );
    expect(calls[0]!.headers.get("origin")).toBe("https://evil.example");
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.body).toBe(body);
    expect(calls[0]!.headers.get("content-type")).toBe("application/json");
    expect(calls[1]!.headers.has("origin")).toBe(false);
    expect(calls[2]!.headers.get("origin")).toBe("https://other.example");
  });

  it("returns a redirect as it is, with every cookie the API set", async () => {
    const { calls, send } = api(() => {
      const headers = new Headers({ location: "https://learn.acme.com/" });
      headers.append("set-cookie", "session_token=abc; Path=/; HttpOnly");
      headers.append("set-cookie", "session_data=def; Path=/; HttpOnly");
      return new Response(null, { status: 302, headers });
    });
    const res = await forwardToApi(
      new Request("https://learn.acme.com/api/auth/magic-link/verify?token=t", {
        headers: visitor,
      }),
      API,
      send,
    );
    expect(calls[0]!.redirect).toBe("manual");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://learn.acme.com/");
    expect(res.headers.getSetCookie()).toEqual([
      "session_token=abc; Path=/; HttpOnly",
      "session_data=def; Path=/; HttpOnly",
    ]);
  });

  it("returns the API's status and body for a refusal, and drops the encoding it already undid", async () => {
    const { send } = api(
      () =>
        new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: {
            "content-type": "application/json",
            "content-encoding": "gzip",
            "content-length": "999",
          },
        }),
    );
    const res = await forwardToApi(
      new Request("https://learn.acme.com/api/member/org", { headers: visitor }),
      API,
      send,
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.has("content-encoding")).toBe(false);
    expect(res.headers.has("content-length")).toBe(false);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("returns an empty answer without a body", async () => {
    const { send } = api(() => new Response(null, { status: 204 }));
    const res = await forwardToApi(
      new Request("https://learn.acme.com/api/member/x", { method: "DELETE", headers: visitor }),
      API,
      send,
    );
    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
  });

  it("answers 502 when the API does not answer", async () => {
    const send = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const res = await forwardToApi(
      new Request("https://learn.acme.com/api/app", { headers: visitor }),
      API,
      send,
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: "bad_gateway" });
  });
});
