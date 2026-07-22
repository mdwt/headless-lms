import { describe, it, expect } from "vitest";
import { ResendEmailAdapter } from "./index.js";

/** Fake fetch capturing the request and returning a canned response. */
function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), { status });
  };
  return { calls, fetchFn };
}

describe("ResendEmailAdapter", () => {
  it("POSTs the message to the Resend emails endpoint with bearer auth", async () => {
    const { calls, fetchFn } = fakeFetch(200, { id: "email_123" });
    const adapter = new ResendEmailAdapter(
      { apiKey: "re_test_key", from: "LMS <noreply@example.com>" },
      undefined,
      fetchFn,
    );

    await adapter.send({ to: "student@example.com", subject: "Welcome", text: "Hi there" });

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe("https://api.resend.com/emails");
    expect(call?.init.method).toBe("POST");
    expect(new Headers(call?.init.headers).get("authorization")).toBe("Bearer re_test_key");
    expect(new Headers(call?.init.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(call?.init.body))).toEqual({
      from: "LMS <noreply@example.com>",
      to: "student@example.com",
      subject: "Welcome",
      text: "Hi there",
    });
  });

  it("throws on a non-2xx response, surfacing the API error message", async () => {
    const { fetchFn } = fakeFetch(422, { message: "Invalid `from` field" });
    const adapter = new ResendEmailAdapter(
      { apiKey: "re_test_key", from: "bad-from" },
      undefined,
      fetchFn,
    );

    await expect(
      adapter.send({ to: "student@example.com", subject: "Welcome", text: "Hi" }),
    ).rejects.toThrow(/422.*Invalid `from` field/);
  });

  it("throws a status-only error when the error body is not JSON", async () => {
    const fetchFn = async () => new Response("upstream gateway error", { status: 502 });
    const adapter = new ResendEmailAdapter(
      { apiKey: "re_test_key", from: "a@b.c" },
      undefined,
      fetchFn,
    );

    await expect(
      adapter.send({ to: "student@example.com", subject: "Welcome", text: "Hi" }),
    ).rejects.toThrow(/502/);
  });

  it("includes html in the payload when the message has it", async () => {
    const { calls, fetchFn } = fakeFetch(200, { id: "email_123" });
    const adapter = new ResendEmailAdapter(
      { apiKey: "re_test_key", from: "a@b.c" },
      undefined,
      fetchFn,
    );

    await adapter.send({ to: "s@e.com", subject: "Hi", text: "plain", html: "<p>rich</p>" });

    expect(JSON.parse(String(calls[0]?.init.body)).html).toBe("<p>rich</p>");
  });

  it("omits the html key when the message has none", async () => {
    const { calls, fetchFn } = fakeFetch(200, { id: "email_123" });
    const adapter = new ResendEmailAdapter(
      { apiKey: "re_test_key", from: "a@b.c" },
      undefined,
      fetchFn,
    );

    await adapter.send({ to: "s@e.com", subject: "Hi", text: "plain" });

    expect("html" in JSON.parse(String(calls[0]?.init.body))).toBe(false);
  });
});
