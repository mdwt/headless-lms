import { describe, expect, it, vi } from "vitest";
import { createDb } from "./client.js";

describe("createDb", () => {
  it("logs a pooled connection that fails while idle instead of crashing the process", async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() };
    const db = createDb("postgres://localhost:1/none", logger);
    expect(() =>
      db.$client.emit("error", new Error("terminating connection due to administrator command")),
    ).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith("database connection lost", {
      error: "terminating connection due to administrator command",
    });
    await db.$client.end();
  });

  it("sizes the pool and its timeouts from the options, and keeps pg's defaults otherwise", async () => {
    const tuned = createDb("postgres://localhost:1/none", undefined, {
      max: 25,
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 2_000,
    });
    expect(tuned.$client.options).toMatchObject({
      max: 25,
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 2_000,
    });
    const plain = createDb("postgres://localhost:1/none");
    expect(plain.$client.options.max).toBe(10);
    await Promise.all([tuned.$client.end(), plain.$client.end()]);
  });
});
