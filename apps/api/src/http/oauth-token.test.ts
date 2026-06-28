import { describe, it, expect, afterAll } from "vitest";
import { buildServer } from "./server.js";

describe("OAuth token endpoint — form-encoded body", () => {
  const app = buildServer();

  afterAll(async () => {
    await app.close();
  });

  it("POST /api/auth/oauth2/token with form body is NOT a 415", async () => {
    // Regression for Critical 1: Fastify must not reject form-encoded bodies
    // before they reach the Better Auth handler. The request will fail auth
    // (invalid code/client) but must return an OAuth error (400/401), not 415.
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/oauth2/token",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "grant_type=authorization_code&code=invalid&client_id=nope",
    });

    // Primary assertion: the form parser + bridge must not produce a 415.
    // Better Auth may return 400, 401, or 404 depending on plugin routing,
    // but a 415 means Fastify rejected the body before it reached the handler.
    expect(res.statusCode).not.toBe(415);
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
    // If Better Auth returned a JSON body, verify it's OAuth-shaped.
    const parsed: unknown = JSON.parse(res.body || "null");
    if (parsed !== null && typeof parsed === "object") {
      const body = parsed as Record<string, unknown>;
      expect(typeof body.error === "string" || typeof body.message === "string").toBe(true);
    }
  });
});
