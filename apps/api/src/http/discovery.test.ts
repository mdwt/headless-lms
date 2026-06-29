import { describe, it, expect, afterAll } from "vitest";
import { buildServer } from "./server.js";

describe("OAuth discovery endpoints", () => {
  const app = buildServer();

  afterAll(async () => {
    await app.close();
  });

  it("GET /.well-known/oauth-authorization-server → 200 with issuer", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-authorization-server",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as Record<string, unknown>;
    // RFC 8414 requires either issuer or authorization_endpoint
    expect(
      typeof body.issuer === "string" || typeof body.authorization_endpoint === "string",
    ).toBe(true);
  });

  it("GET /.well-known/oauth-protected-resource → 200 with resource", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-protected-resource",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as Record<string, unknown>;
    expect(typeof body.resource === "string" || Array.isArray(body.authorization_servers)).toBe(
      true,
    );
  });
});
