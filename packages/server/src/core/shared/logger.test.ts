import { describe, it, expect } from "vitest";
import { noopLogger, createCapturingLogger } from "./logger.js";

describe("noopLogger", () => {
  it("swallows every level and returns itself from child()", () => {
    expect(() => {
      noopLogger.debug("d");
      noopLogger.info("i", { a: 1 });
      noopLogger.warn("w");
      noopLogger.error("e", { err: new Error("x") });
    }).not.toThrow();
    expect(noopLogger.child({ name: "content" })).toBe(noopLogger);
  });
});

describe("createCapturingLogger", () => {
  it("records level, message, and meta", () => {
    const { logger, entries } = createCapturingLogger();
    logger.info("course created", { courseId: "c1" });
    logger.warn("odd");
    expect(entries).toEqual([
      { level: "info", msg: "course created", meta: { courseId: "c1" } },
      { level: "warn", msg: "odd", meta: {} },
    ]);
  });

  it("merges child bindings into meta, call-site meta winning", () => {
    const { logger, entries } = createCapturingLogger();
    const child = logger.child({ name: "content" });
    child.debug("x", { n: 1 });
    child.child({ name: "override", deep: true }).error("y", { deep: false });
    expect(entries).toEqual([
      { level: "debug", msg: "x", meta: { name: "content", n: 1 } },
      { level: "error", msg: "y", meta: { name: "override", deep: false } },
    ]);
  });
});
