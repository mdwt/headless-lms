// Test/default implementations of the Logger port. The real pino-backed
// implementation lives in adapters/logging; these exist so constructors can
// default to a silent logger and tests can assert on emitted entries.
import type { Logger } from "./ports.js";

/** Discards everything. The default for constructors the container overrides. */
export const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => noopLogger,
};

export interface CapturedLog {
  level: "debug" | "info" | "warn" | "error";
  msg: string;
  meta: Record<string, unknown>;
}

/** In-memory logger for tests: every entry (from the root or any child) lands
 *  in `entries`, with child bindings merged into meta. */
export function createCapturingLogger(): { logger: Logger; entries: CapturedLog[] } {
  const entries: CapturedLog[] = [];
  const make = (bindings: Record<string, unknown>): Logger => {
    const record =
      (level: CapturedLog["level"]) => (msg: string, meta?: Record<string, unknown>) => {
        entries.push({ level, msg, meta: { ...bindings, ...meta } });
      };
    return {
      debug: record("debug"),
      info: record("info"),
      warn: record("warn"),
      error: record("error"),
      child: (more) => make({ ...bindings, ...more }),
    };
  };
  return { logger: make({}), entries };
}
