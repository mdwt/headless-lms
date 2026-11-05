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
});
