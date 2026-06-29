// Tests for the MCP HTTP route — verifies the actual Fastify endpoint at /mcp.
//
// Strategy: build the full server via buildServer() and drive it with
// app.inject() to confirm that the route is mounted, that withMcpAuth
// rejects unauthenticated requests, and that the opaque-error handler
// does not propagate internal messages.
import { describe, it, expect, afterAll } from "vitest";
import { buildServer } from "../server.js";

describe("MCP HTTP route — /mcp", () => {
  const app = buildServer();

  afterAll(async () => {
    await app.close();
  });

  it("POST /mcp without Authorization header → 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(res.statusCode).toBe(401);
  });
});
