import { describe, it, expect } from "vitest";
import { createRootLogger } from "./index.js";

/** Collect pino's JSON output lines synchronously. */
function collector() {
  const chunks: string[] = [];
  return {
    stream: { write: (chunk: string) => void chunks.push(chunk) },
    lines: () =>
      chunks
        .join("")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

describe("createRootLogger / PinoLogger", () => {
  it("writes structured JSON with the message and meta", () => {
    const out = collector();
    const { logger } = createRootLogger("info", out.stream);
    logger.info("course created", { courseId: "c1" });
    const [line] = out.lines();
    expect(line?.msg).toBe("course created");
    expect(line?.courseId).toBe("c1");
  });

  it("filters below the configured level", () => {
    const out = collector();
    const { logger } = createRootLogger("warn", out.stream);
    logger.debug("nope");
    logger.info("nope");
    logger.warn("yep");
    logger.error("yep");
    expect(out.lines().map((l) => l.msg)).toEqual(["yep", "yep"]);
  });

  it("child bindings appear on every entry from the child", () => {
    const out = collector();
    const { logger } = createRootLogger("debug", out.stream);
    logger.child({ name: "content" }).debug("x");
    expect(out.lines()[0]?.name).toBe("content");
  });

  it("serializes Error under the err key", () => {
    const out = collector();
    const { logger } = createRootLogger("info", out.stream);
    logger.error("boom", { err: new Error("kapow") });
    const err = out.lines()[0]?.err as { type: string; message: string; stack?: string };
    expect(err.message).toBe("kapow");
    expect(err.stack).toContain("kapow");
  });

  it("logs a request by its route pattern, never the raw path", () => {
    const out = collector();
    const { instance } = createRootLogger("info", out.stream);
    instance.info(
      {
        req: {
          method: "GET",
          url: "/api/organizations/invites/secret-token?x=1",
          ip: "127.0.0.1",
          routeOptions: { url: "/api/organizations/invites/:token" },
        },
      },
      "incoming request",
    );
    const [line] = out.lines();
    expect(JSON.stringify(line)).not.toContain("secret-token");
    expect(line?.req).toEqual({
      method: "GET",
      route: "/api/organizations/invites/:token",
      remoteAddress: "127.0.0.1",
    });
  });
});
