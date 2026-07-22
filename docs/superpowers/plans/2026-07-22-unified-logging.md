# Unified Structured Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One pino-backed log stream for the whole server, injected as a proper leveled `Logger` port into every service, repository, and adapter, with a meaningful info/warn/error/debug baseline.

**Architecture:** The `Logger` port (`debug`/`info`/`warn`/`error`/`child`) lives in `core/shared/ports.ts`; a `PinoLogger` adapter in `adapters/logging/` wraps one root pino instance that the container creates and Fastify reuses via `loggerInstance`. The container hands every component a child logger bound with `{ name: "<name>" }`. Constructor params default to `noopLogger` so existing tests stay valid; the container always passes a real child.

**Tech Stack:** TypeScript (strict, ESM, `.js` import suffixes), pino, Fastify 5, vitest.

## Global Constraints

- Node 22, ESM, strict TypeScript; relative imports end in `.js`.
- Spec: `docs/superpowers/specs/2026-07-22-unified-logging-design.md`.
- Never add AI-attribution trailers to commits (repo rule; overrides defaults).
- Run tests from repo root: `pnpm vitest run <path>` (or `pnpm --filter @headless-lms/server test`).
- After import-boundary-touching tasks run `pnpm lint`; after each task `pnpm --filter @headless-lms/server typecheck` (script name: `typecheck`).
- Errors are logged in meta under the `err` key.
- Child bindings are a single `name` key (e.g. `{ name: "content" }`).

---

### Task 1: Logger port + core test fakes

**Files:**
- Modify: `packages/server/src/core/shared/ports.ts:59-62` (Logger interface)
- Create: `packages/server/src/core/shared/logger.ts`
- Test: `packages/server/src/core/shared/logger.test.ts`
- Modify: `packages/server/src/composition/container.ts:216-219` (shim must satisfy new interface)
- Modify: `packages/server/src/adapters/events/outbox-relay.test.ts` (fakeLogger must satisfy new interface)

**Interfaces:**
- Produces: `Logger` port with `debug/info/warn/error(msg: string, meta?: Record<string, unknown>): void` and `child(bindings: Record<string, unknown>): Logger`; `noopLogger: Logger`; `createCapturingLogger(): { logger: Logger; entries: CapturedLog[] }` with `CapturedLog = { level: "debug" | "info" | "warn" | "error"; msg: string; meta: Record<string, unknown> }` (child bindings merged into each entry's meta). All later tasks import these.

- [ ] **Step 1: Write the failing test**

`packages/server/src/core/shared/logger.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/server/src/core/shared/logger.test.ts`
Expected: FAIL — cannot find module `./logger.js`.

- [ ] **Step 3: Implement**

Replace the `Logger` interface in `packages/server/src/core/shared/ports.ts` (currently lines 59-62):

```ts
export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  /** A logger whose every entry carries `bindings` (call-site meta wins on key clash). */
  child(bindings: Record<string, unknown>): Logger;
}
```

Create `packages/server/src/core/shared/logger.ts`:

```ts
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
    const record = (level: CapturedLog["level"]) => (msg: string, meta?: Record<string, unknown>) => {
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
```

Fix the two now-non-conforming `Logger` literals:

In `packages/server/src/composition/container.ts`, replace lines 216-219 (the `relayLogger` shim — deleted for good in Task 3, this keeps the interim state compiling):

```ts
  const relayLogger: Logger = {
    debug: (msg, meta) => console.debug(msg, meta ?? {}),
    info: (msg, meta) => console.log(msg, meta ?? {}),
    warn: (msg, meta) => console.warn(msg, meta ?? {}),
    error: (msg, meta) => console.error(msg, meta ?? {}),
    child: () => relayLogger,
  };
```

In `packages/server/src/adapters/events/outbox-relay.test.ts`, find the `fakeLogger` helper (used at lines 51, 66, 80, …) and extend it the same way — add `debug`, `warn` (recording or no-op, matching its existing style) and `child: () => <itself>` so it satisfies the new interface. Example shape if the current fake records calls into arrays:

```ts
function fakeLogger() {
  const calls: { level: string; msg: string; meta?: Record<string, unknown> }[] = [];
  const logger: Logger = {
    debug: (msg, meta) => void calls.push({ level: "debug", msg, meta }),
    info: (msg, meta) => void calls.push({ level: "info", msg, meta }),
    warn: (msg, meta) => void calls.push({ level: "warn", msg, meta }),
    error: (msg, meta) => void calls.push({ level: "error", msg, meta }),
    child: () => logger,
  };
  return Object.assign(logger, { calls });
}
```

Adapt to the fake's actual current shape — keep whatever assertions the relay tests make on it working.

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm vitest run packages/server/src/core/shared/logger.test.ts packages/server/src/adapters/events/outbox-relay.test.ts`
Expected: PASS.
Run: `pnpm --filter @headless-lms/server typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/core/shared/ports.ts packages/server/src/core/shared/logger.ts packages/server/src/core/shared/logger.test.ts packages/server/src/composition/container.ts packages/server/src/adapters/events/outbox-relay.test.ts
git commit -m "feat(core): leveled contextual Logger port with noop + capturing fakes"
```

---

### Task 2: Pino adapter

**Files:**
- Modify: `packages/server/package.json` (add `pino` dependency)
- Create: `packages/server/src/adapters/logging/index.ts`
- Test: `packages/server/src/adapters/logging/index.test.ts`

**Interfaces:**
- Consumes: `Logger` from `core/shared/ports.js` (Task 1).
- Produces: `type LogLevel = "debug" | "info" | "warn" | "error"`; `class PinoLogger implements Logger` (constructor takes a pino instance); `createRootLogger(level: LogLevel, destination?: DestinationStream): { instance: PinoInstance; logger: Logger }` where `PinoInstance` is pino's `Logger` type. Task 3 wires `instance` into Fastify and `logger` into the container.

- [ ] **Step 1: Add pino as a direct dependency**

Run: `pnpm --filter @headless-lms/server add pino`
Expected: `pino` appears in `packages/server/package.json` dependencies (it is already in the tree transitively via Fastify).

- [ ] **Step 2: Write the failing test**

`packages/server/src/adapters/logging/index.test.ts`:

```ts
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
    expect(out.lines()[0]?.domain).toBe("content");
  });

  it("serializes Error under the err key", () => {
    const out = collector();
    const { logger } = createRootLogger("info", out.stream);
    logger.error("boom", { err: new Error("kapow") });
    const err = out.lines()[0]?.err as { type: string; message: string; stack?: string };
    expect(err.message).toBe("kapow");
    expect(err.stack).toContain("kapow");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run packages/server/src/adapters/logging/index.test.ts`
Expected: FAIL — cannot find module `./index.js`.

- [ ] **Step 4: Implement**

`packages/server/src/adapters/logging/index.ts`:

```ts
// Logging adapter — implements the core Logger port over pino. One root
// instance per process: the container creates it, Fastify reuses it via
// `loggerInstance`, and every component gets a child bound with { name }.
import { pino, type DestinationStream, type Logger as PinoInstance } from "pino";
import type { Logger } from "../../core/shared/ports.js";

export type { PinoInstance };

export type LogLevel = "debug" | "info" | "warn" | "error";

export class PinoLogger implements Logger {
  constructor(private readonly instance: PinoInstance) {}

  debug(msg: string, meta?: Record<string, unknown>): void {
    this.instance.debug(meta ?? {}, msg);
  }
  info(msg: string, meta?: Record<string, unknown>): void {
    this.instance.info(meta ?? {}, msg);
  }
  warn(msg: string, meta?: Record<string, unknown>): void {
    this.instance.warn(meta ?? {}, msg);
  }
  error(msg: string, meta?: Record<string, unknown>): void {
    this.instance.error(meta ?? {}, msg);
  }
  child(bindings: Record<string, unknown>): Logger {
    return new PinoLogger(this.instance.child(bindings));
  }
}

/** The process-wide root: JSON lines, Error serialization under `err`.
 *  `destination` exists for tests; omitted → stdout. */
export function createRootLogger(
  level: LogLevel,
  destination?: DestinationStream,
): { instance: PinoInstance; logger: Logger } {
  const instance = pino(
    { level, serializers: { err: pino.stdSerializers.err } },
    destination,
  );
  return { instance, logger: new PinoLogger(instance) };
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm vitest run packages/server/src/adapters/logging/index.test.ts`
Expected: PASS (4 tests).
Run: `pnpm --filter @headless-lms/server typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/server/package.json pnpm-lock.yaml packages/server/src/adapters/logging/
git commit -m "feat(adapters): pino-backed PinoLogger + createRootLogger"
```

---

### Task 3: Logging config + one shared stream (container, Fastify, MCP, apps/api)

**Files:**
- Modify: `packages/server/src/composition/container.ts` (Config, defaults/resolve, root logger, Container fields, relay child, delete shim)
- Modify: `packages/server/src/http/server.ts:18` (`loggerInstance`)
- Modify: `packages/server/src/http/mcp/route.ts:57` (`request.log.error`)
- Modify: `packages/server/src/index.ts:19-24` (export `LoggingConfig`)
- Modify: `apps/api/src/config.ts` (LOG_LEVEL)
- Test: `packages/server/src/composition/container.test.ts`

**Interfaces:**
- Consumes: `createRootLogger`, `LogLevel`, `PinoInstance` from `adapters/logging/index.js` (Task 2).
- Produces: `Config.logging?: LoggingConfig` with `LoggingConfig = { level?: LogLevel }`; `LOGGING_DEFAULTS`; `resolveLoggingConfig(config?: LoggingConfig): Required<LoggingConfig>`; `Container.logger: Logger` and `Container.loggerInstance: PinoInstance`. Tasks 4-10 use `container`-local `logger` for children.

- [ ] **Step 1: Write the failing test**

Append to `packages/server/src/composition/container.test.ts`:

```ts
import { LOGGING_DEFAULTS, resolveLoggingConfig } from "./container.js";

describe("resolveLoggingConfig", () => {
  it("defaults to info", () => {
    expect(resolveLoggingConfig()).toEqual({ level: "info" });
    expect(resolveLoggingConfig()).toEqual(LOGGING_DEFAULTS);
  });

  it("takes an explicit level", () => {
    expect(resolveLoggingConfig({ level: "debug" }).level).toBe("debug");
  });

  it("ignores explicit undefined (default wins)", () => {
    expect(resolveLoggingConfig({ level: undefined }).level).toBe("info");
  });
});
```

(Merge the import with the existing `./container.js` import at the top of the file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/server/src/composition/container.test.ts`
Expected: FAIL — `LOGGING_DEFAULTS`/`resolveLoggingConfig` not exported.

- [ ] **Step 3: Implement container changes**

In `packages/server/src/composition/container.ts`:

Add import (top, with the other adapter imports):

```ts
import {
  createRootLogger,
  type LogLevel,
  type PinoInstance,
} from "../adapters/logging/index.js";
```

Add to `Config` (after the `outbox?: OutboxConfig;` field):

```ts
  /** Log level for the process-wide logger (HTTP + domain + relay). Default "info". */
  logging?: LoggingConfig;
```

Below the outbox config block, add:

```ts
/** Logging tuning. Optional; resolved against LOGGING_DEFAULTS. */
export interface LoggingConfig {
  /** Minimum level emitted. Default "info". */
  level?: LogLevel;
}

export const LOGGING_DEFAULTS: Required<LoggingConfig> = { level: "info" };

export function resolveLoggingConfig(config: LoggingConfig = {}): Required<LoggingConfig> {
  return { level: config.level ?? LOGGING_DEFAULTS.level };
}
```

Add to the `Container` interface (after `outboxRelay: OutboxRelay;`):

```ts
  /** Root logger port — components receive children bound with { name }. */
  logger: Logger;
  /** The raw pino root; buildServer hands it to Fastify so HTTP shares the stream. */
  loggerInstance: PinoInstance;
```

At the very top of `buildContainer` (before `const db = ...`):

```ts
  const { instance: loggerInstance, logger } = createRootLogger(
    resolveLoggingConfig(config.logging).level,
  );
```

Delete the `relayLogger` shim (lines 216-219 as amended by Task 1) and change the relay construction to:

```ts
  const outboxRelay = new PollingOutboxRelay(
    new DrizzleOutboxStore(db),
    eventBus,
    outboxConfig,
    logger.child({ name: "outbox" }),
  );
```

Add `logger, loggerInstance,` to the returned object.

- [ ] **Step 4: One stream for Fastify + MCP**

`packages/server/src/http/server.ts:18` becomes:

```ts
  const app = Fastify({ loggerInstance: container.loggerInstance });
```

`packages/server/src/http/mcp/route.ts:57` — replace

```ts
        console.error("[mcp] unexpected error:", err);
```

with

```ts
        request.log.error({ err }, "mcp unexpected error");
```

- [ ] **Step 5: Export the config type + map LOG_LEVEL in apps/api**

`packages/server/src/index.ts` — extend the composition type export block:

```ts
export type {
  Config as ContainerConfig,
  Container,
  AdapterOverrides,
  BuildContainerOptions,
  LoggingConfig,
} from "./composition/container.js";
```

`apps/api/src/config.ts` — inside `loadContainerConfig`'s returned object, after the `outbox` field, add:

```ts
    logging: {
      level: parseLogLevel(),
    },
```

and add above `loadContainerConfig`:

```ts
const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
type LogLevel = (typeof LOG_LEVELS)[number];

/** LOG_LEVEL env → logging.level; unset → server default ("info"). */
function parseLogLevel(): LogLevel | undefined {
  const raw = process.env.LOG_LEVEL;
  if (!raw) return undefined;
  if (!(LOG_LEVELS as readonly string[]).includes(raw)) {
    throw new Error(`invalid LOG_LEVEL "${raw}" (expected one of ${LOG_LEVELS.join(", ")})`);
  }
  return raw as LogLevel;
}
```

- [ ] **Step 6: Run tests, typecheck, lint**

Run: `pnpm vitest run packages/server/src/composition/container.test.ts`
Expected: PASS.
Run: `pnpm --filter @headless-lms/server typecheck && pnpm --filter @headless-lms/api typecheck && pnpm lint`
Expected: clean. (If the api workspace filter name differs, use `pnpm typecheck` at the root.)

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/composition/container.ts packages/server/src/composition/container.test.ts packages/server/src/http/server.ts packages/server/src/http/mcp/route.ts packages/server/src/index.ts apps/api/src/config.ts
git commit -m "feat(composition): one pino stream — logging config, container root logger, Fastify loggerInstance"
```

---

### Task 4: Content service logging

**Files:**
- Modify: `packages/server/src/core/content/service.ts`
- Modify: `packages/server/src/composition/container.ts` (content wiring)
- Test: `packages/server/src/core/content/service.test.ts`

**Interfaces:**
- Consumes: `Logger` port, `noopLogger`, `createCapturingLogger` (Task 1).
- Produces: `ContentServiceImpl` constructor gains 4th param `logger: Logger = noopLogger`.

- [ ] **Step 1: Write the failing test**

Append to `packages/server/src/core/content/service.test.ts` (reuse the file's existing `repo`/`structure`/`uow` fixtures — see its line 63 helper — passing the capturing logger as the 4th constructor arg):

```ts
import { createCapturingLogger } from "../shared/logger.js";

describe("logging", () => {
  it("logs course create/update/delete at info with ids", async () => {
    const { logger, entries } = createCapturingLogger();
    const svc = makeService({ logger }); // adapt to the file's fixture helper: new ContentServiceImpl(repo, structure, uow, logger)
    const course = await svc.create("org-1", { title: "Intro" } as CreateCourseInput);
    await svc.update("org-1", course.id, { title: "Intro 2" } as UpdateCourseInput);
    await svc.remove("org-1", course.id);
    expect(entries.filter((e) => e.level === "info").map((e) => e.msg)).toEqual([
      "course created",
      "course updated",
      "course deleted",
    ]);
    expect(entries[0]?.meta).toMatchObject({ orgId: "org-1", courseId: course.id });
  });
});
```

Adapt construction and input literals to the fixtures already in that file (it has working `CreateCourseInput` values); the assertion payload is the contract.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/server/src/core/content/service.test.ts`
Expected: FAIL — constructor takes 3 args / no log entries.

- [ ] **Step 3: Implement**

In `packages/server/src/core/content/service.ts`:

```ts
import type { Logger } from "../shared/ports.js";
import { noopLogger } from "../shared/logger.js";
```

Constructor:

```ts
  constructor(
    private readonly repo: ContentRepository,
    private readonly structureRepo: CourseRepository,
    private readonly uow: ContentUnitOfWork,
    private readonly logger: Logger = noopLogger,
  ) {}
```

Mutations log after the transaction commits (i.e. after `uow.run` resolves):

```ts
  async create(orgId: string, input: CreateCourseInput): Promise<Course> {
    const course = await this.uow.run(async ({ courses, outbox }) => {
      const created = await courses.create(orgId, input, slugify(input.title));
      await outbox.append([{ type: "course.created", orgId, course: created }]);
      return created;
    });
    this.logger.info("course created", { orgId, courseId: course.id });
    return course;
  }

  async update(orgId: string, id: string, patch: UpdateCourseInput): Promise<Course | null> {
    const course = await this.uow.run(async ({ courses, outbox }) => {
      const updated = await courses.update(orgId, id, patch);
      if (!updated) return null;
      await outbox.append([{ type: "course.updated", orgId, course: updated }]);
      return updated;
    });
    if (course) this.logger.info("course updated", { orgId, courseId: id });
    return course;
  }

  async remove(orgId: string, id: string): Promise<boolean> {
    const deleted = await this.uow.run(async ({ courses, outbox }) => {
      const course = await courses.findById(orgId, id);
      if (!course) return false;
      const ok = await courses.delete(orgId, id);
      if (ok) await outbox.append([{ type: "course.deleted", orgId, course }]);
      return ok;
    });
    if (deleted) this.logger.info("course deleted", { orgId, courseId: id });
    return deleted;
  }
```

Structure mutations — `info` for create/update/delete/save, `debug` for reorders:

```ts
  async reorderModules(orgId: string, courseId: string, orderedIds: string[]): Promise<Module[]> {
    const modules = await this.structureRepo.reorderModules(orgId, courseId, orderedIds);
    this.logger.debug("modules reordered", { orgId, courseId });
    return modules;
  }
  async createModule(orgId: string, courseId: string, title: string): Promise<Module[]> {
    const modules = await this.structureRepo.createModule(orgId, courseId, title);
    this.logger.info("module created", { orgId, courseId });
    return modules;
  }
  async updateModule(orgId: string, courseId: string, moduleId: string, title: string): Promise<Module[]> {
    const modules = await this.structureRepo.updateModule(orgId, courseId, moduleId, title);
    this.logger.info("module updated", { orgId, courseId, moduleId });
    return modules;
  }
  async deleteModule(orgId: string, courseId: string, moduleId: string): Promise<Module[]> {
    const modules = await this.structureRepo.deleteModule(orgId, courseId, moduleId);
    this.logger.info("module deleted", { orgId, courseId, moduleId });
    return modules;
  }
  async reorderActivities(orgId: string, courseId: string, moduleId: string, orderedIds: string[]): Promise<Module[]> {
    const modules = await this.structureRepo.reorderActivities(orgId, courseId, moduleId, orderedIds);
    this.logger.debug("activities reordered", { orgId, courseId, moduleId });
    return modules;
  }
  async saveActivity(orgId: string, courseId: string, moduleId: string, input: SaveActivityInput, activityId?: string): Promise<Module[]> {
    const modules = await this.structureRepo.saveActivity(orgId, courseId, moduleId, input, activityId);
    this.logger.info("activity saved", { orgId, courseId, moduleId, activityId: activityId ?? null });
    return modules;
  }
  async deleteActivity(orgId: string, courseId: string, moduleId: string, activityId: string): Promise<Module[]> {
    const modules = await this.structureRepo.deleteActivity(orgId, courseId, moduleId, activityId);
    this.logger.info("activity deleted", { orgId, courseId, moduleId, activityId });
    return modules;
  }
```

(`list`, `get`, `listForCourse` stay untouched — reads don't log.)

In `packages/server/src/composition/container.ts`, above the content block add a hoisted child and pass it:

```ts
  const contentLogger = logger.child({ name: "content" });
  ...
  const content = new ContentServiceImpl(
    new DrizzleContentRepository(db),
    new DrizzleContentStructureRepository(db),
    contentUow,
    contentLogger,
  );
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm vitest run packages/server/src/core/content/service.test.ts`
Expected: PASS (existing tests unaffected — logger defaults to noop).
Run: `pnpm --filter @headless-lms/server typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/core/content/service.ts packages/server/src/core/content/service.test.ts packages/server/src/composition/container.ts
git commit -m "feat(content): inject logger; info on course/module/activity mutations"
```

---

### Task 5: Entitlements service logging

**Files:**
- Modify: `packages/server/src/core/entitlements/service.ts`
- Modify: `packages/server/src/composition/container.ts` (entitlements wiring)
- Test: `packages/server/src/core/entitlements/service.test.ts`

**Interfaces:**
- Produces: `EntitlementsServiceImpl` constructor gains 3rd param `logger: Logger = noopLogger`.

- [ ] **Step 1: Write the failing test**

Append to `packages/server/src/core/entitlements/service.test.ts` (the file builds `new EntitlementsServiceImpl(repo, uow)` at line 46 — pass the capturing logger as 3rd arg, reusing its repo/uow fixtures):

```ts
import { createCapturingLogger } from "../shared/logger.js";

it("logs grant and status changes at info", async () => {
  const { logger, entries } = createCapturingLogger();
  const svc = new EntitlementsServiceImpl(repo, uow, logger); // adapt to the file's fixture names
  const enrollment = await svc.grant("org-1", { studentId: "s1", courseId: "c1", expiresAt: null });
  await svc.setStatus("org-1", enrollment.id, "revoked");
  expect(entries.map((e) => [e.level, e.msg])).toEqual([
    ["info", "enrollment granted"],
    ["info", "enrollment status changed"],
  ]);
  expect(entries[0]?.meta).toMatchObject({
    orgId: "org-1",
    enrollmentId: enrollment.id,
    studentId: "s1",
    courseId: "c1",
  });
  expect(entries[1]?.meta).toMatchObject({ orgId: "org-1", enrollmentId: enrollment.id, status: "revoked" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/server/src/core/entitlements/service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`packages/server/src/core/entitlements/service.ts`:

```ts
import type { Logger } from "../shared/ports.js";
import { noopLogger } from "../shared/logger.js";
```

```ts
  constructor(
    /** Read-only access (list) — runs outside any transaction. */
    private readonly repo: EntitlementsRepository,
    /** Atomic write scope: tx-bound repo + outbox appender. */
    private readonly uow: EntitlementsUnitOfWork,
    private readonly logger: Logger = noopLogger,
  ) {}

  async grant(orgId: string, input: GrantEnrollmentInput): Promise<Enrollment> {
    const enrollment = await this.uow.run(async ({ entitlements, outbox }) => {
      const created = await entitlements.insert(orgId, input);
      await outbox.append([{ type: "enrollment.created", orgId, enrollment: created }]);
      return created;
    });
    this.logger.info("enrollment granted", {
      orgId,
      enrollmentId: enrollment.id,
      studentId: enrollment.studentId,
      courseId: enrollment.courseId,
    });
    return enrollment;
  }

  async setStatus(orgId: string, id: string, status: "active" | "revoked"): Promise<Enrollment | null> {
    const enrollment = await this.uow.run(async ({ entitlements, outbox }) => {
      const updated = await entitlements.setStatus(orgId, id, status);
      if (!updated) return null;
      await outbox.append([
        status === "revoked"
          ? { type: "enrollment.deleted", orgId, enrollment: updated }
          : { type: "enrollment.updated", orgId, enrollment: updated },
      ]);
      return updated;
    });
    if (enrollment) this.logger.info("enrollment status changed", { orgId, enrollmentId: id, status });
    return enrollment;
  }
```

Container wiring:

```ts
  const entitlementsLogger = logger.child({ name: "entitlements" });
  ...
  const entitlements = new EntitlementsServiceImpl(
    new DrizzleEntitlementsRepository(db),
    entitlementsUow,
    entitlementsLogger,
  );
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm vitest run packages/server/src/core/entitlements/service.test.ts && pnpm --filter @headless-lms/server typecheck`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/core/entitlements/service.ts packages/server/src/core/entitlements/service.test.ts packages/server/src/composition/container.ts
git commit -m "feat(entitlements): inject logger; info on grant and status changes"
```

---

### Task 6: Integrations service + loader logging

**Files:**
- Modify: `packages/server/src/core/integrations/service.ts`
- Modify: `packages/server/src/composition/integrations.ts` (loader)
- Modify: `packages/server/src/composition/container.ts` (integrations wiring + loader arg)
- Test: `packages/server/src/core/integrations/service.test.ts`

**Interfaces:**
- Produces: `IntegrationsServiceImpl` constructor gains 5th param `logger: Logger = noopLogger`; `loadIntegrations(dir?: string, logger?: Logger)` (2nd param defaults `noopLogger`).

- [ ] **Step 1: Write the failing test**

Append to `packages/server/src/core/integrations/service.test.ts` (the file builds the service at line 87: `new IntegrationsServiceImpl(registry, repo, uow, () => "2026-01-02T00:00:00Z")` — reuse its fixtures, add the logger as 5th arg):

```ts
import { createCapturingLogger } from "../shared/logger.js";

it("logs the connection lifecycle at info and rejections at warn", async () => {
  const { logger, entries } = createCapturingLogger();
  const svc = new IntegrationsServiceImpl(registry, repo, uow, () => "2026-01-02T00:00:00Z", logger); // adapt fixture names
  const connection = await svc.connect("org-1", { integrationId: "slack", config: {}, secrets: { token: "t" } });
  await svc.disconnect("org-1", connection.id);
  await expect(svc.connect("org-1", { integrationId: "nope", secrets: {} })).rejects.toThrow();
  expect(entries.map((e) => [e.level, e.msg])).toEqual([
    ["info", "integration connected"],
    ["info", "integration disconnected"],
    ["warn", "unknown integration rejected"],
  ]);
  expect(entries[0]?.meta).toMatchObject({ orgId: "org-1", integrationId: "slack", connectionId: connection.id });
});
```

Adapt the connect input and registry fixture to what the file already uses (its existing tests exercise connect with a registered integration id — mirror those literals).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/server/src/core/integrations/service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the service**

`packages/server/src/core/integrations/service.ts`:

```ts
import type { Logger } from "../shared/ports.js";
import { noopLogger } from "../shared/logger.js";
```

```ts
  constructor(
    private readonly registry: IntegrationsRegistry,
    /** Read-only access (find/list) — runs outside any transaction. */
    private readonly repo: ConnectionsRepository,
    /** Atomic write scope: tx-bound connections repo + credential store + outbox. */
    private readonly uow: IntegrationsUnitOfWork,
    private readonly now: () => string,
    private readonly logger: Logger = noopLogger,
  ) {}
```

`validate` gains warn-before-throw:

```ts
  private validate(integrationId: string, config: Record<string, unknown>): void {
    const integration = this.registry.get(integrationId);
    if (!integration) {
      this.logger.warn("unknown integration rejected", { integrationId });
      throw new UnknownIntegrationError(integrationId);
    }
    const result = integration.validateConfig(config);
    if (!result.ok) {
      this.logger.warn("invalid integration config rejected", { integrationId, errors: result.errors });
      throw new InvalidConfigError(integrationId, result.errors);
    }
  }
```

`connect`: warn before the `AlreadyConnectedError` throw, info after the uow:

```ts
    if (existing) {
      this.logger.warn("duplicate connection rejected", { orgId, integrationId: input.integrationId });
      throw new AlreadyConnectedError(input.integrationId);
    }
    const connection = await this.uow.run(async ({ connections, credentials, outbox }) => {
      // ... existing body unchanged ...
    });
    this.logger.info("integration connected", {
      orgId,
      integrationId: connection.integrationId,
      connectionId: connection.id,
    });
    return connection;
```

`reconnect` — after its uow resolves (inside the non-null path):

```ts
    this.logger.info("integration credentials rotated", { orgId, connectionId: id, integrationId: connection.integrationId });
```

`configure` — after its uow resolves:

```ts
    this.logger.info("integration configured", { orgId, connectionId: id, integrationId: connection.integrationId });
```

`disconnect` — after its uow resolves, before returning `deleted`:

```ts
    this.logger.info("integration disconnected", { orgId, connectionId: id, integrationId: connection.integrationId });
```

(In each case restructure `return this.uow.run(...)` into `const result = await this.uow.run(...); this.logger.info(...); return result;` — matching the pattern from Tasks 4-5.)

- [ ] **Step 4: Implement the loader**

`packages/server/src/composition/integrations.ts`:

```ts
import type { Logger } from "../core/shared/ports.js";
import { noopLogger } from "../core/shared/logger.js";
```

```ts
export async function loadIntegrations(
  dir?: string,
  logger: Logger = noopLogger,
): Promise<IntegrationsRegistry> {
  if (!dir) {
    logger.debug("no plugins directory configured — zero integrations");
    return createIntegrationsRegistry([]);
  }
```

In the ENOENT branch, before `return`:

```ts
    logger.debug("plugins directory missing — zero integrations", { dir });
```

After the loop, before `return createIntegrationsRegistry(integrations);`:

```ts
  logger.info("integrations loaded", {
    count: integrations.length,
    ids: integrations.map((integration) => integration.id),
  });
```

Container wiring:

```ts
  const integrationsLogger = logger.child({ name: "integrations" });
  const integrationsRegistry = await loadIntegrations(options?.pluginsDir, integrationsLogger);
  ...
  const integrations = new IntegrationsServiceImpl(
    integrationsRegistry,
    new DrizzleConnectionsRepository(db),
    integrationsUow,
    () => new Date().toISOString(),
    integrationsLogger,
  );
```

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm vitest run packages/server/src/core/integrations/service.test.ts && pnpm --filter @headless-lms/server typecheck && pnpm lint`
Expected: PASS / clean (lint matters here — composition imports core/shared/logger.js).

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/core/integrations/service.ts packages/server/src/core/integrations/service.test.ts packages/server/src/composition/integrations.ts packages/server/src/composition/container.ts
git commit -m "feat(integrations): inject logger; lifecycle info, rejection warns, loader summary"
```

---

### Task 7: Organizations service logging

**Files:**
- Modify: `packages/server/src/core/organizations/service.ts`
- Modify: `packages/server/src/composition/container.ts` (organizations wiring)
- Test: `packages/server/src/core/organizations/service.test.ts`

**Interfaces:**
- Produces: `OrganizationServiceImpl` constructor gains 4th param `logger: Logger = noopLogger`.

- [ ] **Step 1: Write the failing test**

Append to `packages/server/src/core/organizations/service.test.ts` (its tests build `new OrganizationServiceImpl(repo, stubMembersRepo, stubOrgAdmin)` — add the logger as 4th arg, reusing the file's repo fixtures):

```ts
import { createCapturingLogger } from "../shared/logger.js";

it("logs the org mirror write and member rule rejections", async () => {
  const { logger, entries } = createCapturingLogger();
  const svc = new OrganizationServiceImpl(repo, stubMembersRepo, stubOrgAdmin, logger); // adapt fixture names
  const org = await svc.createOrg({ externalId: "ext-1", name: "Acme", slug: "acme", ownerId: "u1" }); // mirror the file's existing createOrg input literal
  await svc.createOrg({ externalId: "ext-1", name: "Acme", slug: "acme", ownerId: "u1" }); // idempotent re-run: no second log
  const infos = entries.filter((e) => e.level === "info" && e.msg === "organization mirrored");
  expect(infos).toHaveLength(1);
  expect(infos[0]?.meta).toMatchObject({ orgId: org.id, externalId: "ext-1" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/server/src/core/organizations/service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`packages/server/src/core/organizations/service.ts` — imports + constructor param as in prior tasks (`logger: Logger = noopLogger`, 4th position).

Log lines:

- `createOrg` — only on the insert path:
  ```ts
    const created = await this.repo.create(input);
    this.logger.info("organization mirrored", { orgId: created.id, externalId: input.externalId });
    return created;
  ```
- `createOrganization` — before `return org;`: `this.logger.info("organization created", { orgId: org.id, slug: org.slug });`
- `updateOrganization` — before `return org;`: `this.logger.info("organization updated", { orgId: org.id });`
- `addMembership` — `const membership = await this.repo.insertMembership(org.id, input); this.logger.info("membership added", { orgId: org.id }); return membership;`
- `removeMembership` — after the delete: `this.logger.info("membership removed", { externalId });`
- `recordInvitation` — `const invitation = await this.repo.insertInvitation(org.id, input); this.logger.info("invitation recorded", { orgId: org.id }); return invitation;`
- `acceptInvitation` — after the status write: `this.logger.info("invitation accepted", { authInvitationId: input.authInvitationId });`
- `assignCourse` — `const assignment = await this.repo.insertCourseAssignment(org.id, input); this.logger.info("course assigned", { orgId: org.id, courseId: input.courseId }); return assignment;`
- `unassignCourse` — after the delete: `this.logger.info("course unassigned", { orgId: org.id, courseId: input.courseId });`
- `inviteMember` — warn before the duplicate throw (`this.logger.warn("invite rejected: already a member or invited", { orgId: ctx.orgId });`), info before the return (`this.logger.info("member invited", { orgId: ctx.orgId, memberId: created.id });`)
- `updateMemberRole` — warn before each `OrganizationRuleError` throw (`"role change rejected: owner role immutable"` / `"role change rejected: not an active member"`, meta `{ orgId: ctx.orgId, memberId: id }`), info on success: `this.logger.info("member role updated", { orgId: ctx.orgId, memberId: id, role });`
- `removeMember` — warn before the owner throw (`"member removal rejected: owner cannot be removed"`, meta `{ orgId: ctx.orgId, memberId: id }`), info before `return true;`: `this.logger.info("member removed", { orgId: ctx.orgId, memberId: id });`

Do NOT log emails — org/member ids only.

Container wiring:

```ts
  const organizations = new OrganizationServiceImpl(
    new DrizzleOrganizationsRepository(db),
    new DrizzleMembersRepository(db),
    orgAdminProvider,
    logger.child({ name: "organizations" }),
  );
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm vitest run packages/server/src/core/organizations/service.test.ts && pnpm --filter @headless-lms/server typecheck`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/core/organizations/service.ts packages/server/src/core/organizations/service.test.ts packages/server/src/composition/container.ts
git commit -m "feat(organizations): inject logger; mirror/member mutations info, rule rejections warn"
```

---

### Task 8: Identity service logging

**Files:**
- Modify: `packages/server/src/core/identity/service.ts`
- Modify: `packages/server/src/composition/container.ts` (identity wiring)
- Test: `packages/server/src/core/identity/service.test.ts`

**Interfaces:**
- Produces: `IdentityServiceImpl` constructor gains 2nd param `logger: Logger = noopLogger`.

- [ ] **Step 1: Write the failing test**

Append to `packages/server/src/core/identity/service.test.ts` (existing tests build `new IdentityServiceImpl(repo)` — reuse the file's repo fixture and input literals):

```ts
import { createCapturingLogger } from "../shared/logger.js";

it("logs registrations at info only when a row is inserted", async () => {
  const { logger, entries } = createCapturingLogger();
  const svc = new IdentityServiceImpl(repo, logger); // adapt fixture name
  const user = await svc.registerUser({ externalId: "auth-1", email: "a@b.c", name: "A" }); // mirror the file's RegisterUserInput literal
  await svc.registerUser({ externalId: "auth-1", email: "a@b.c", name: "A" }); // idempotent → no second log
  expect(entries).toEqual([
    { level: "info", msg: "user registered", meta: { userId: user.id, externalId: "auth-1" } },
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/server/src/core/identity/service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`packages/server/src/core/identity/service.ts`:

```ts
import type { Logger } from "../shared/ports.js";
import { noopLogger } from "../shared/logger.js";

export class IdentityServiceImpl implements IdentityService {
  constructor(
    private readonly repo: IdentityRepository,
    private readonly logger: Logger = noopLogger,
  ) {}

  async registerUser(input: RegisterUserInput): Promise<User> {
    const existing = await this.repo.findUserByExternalId(input.externalId);
    if (existing) return existing;
    const user = await this.repo.insertUser(input);
    this.logger.info("user registered", { userId: user.id, externalId: input.externalId });
    return user;
  }

  async registerStudent(input: RegisterStudentInput): Promise<Student> {
    const existing = await this.repo.findStudentByExternalId(input.orgId, input.externalId);
    if (existing) return existing;
    const student = await this.repo.insertStudent(input);
    this.logger.info("student registered", { orgId: input.orgId, studentId: student.id });
    return student;
  }
  // reads unchanged
```

Container wiring:

```ts
  const identity = new IdentityServiceImpl(
    new DrizzleIdentityRepository(db),
    logger.child({ name: "identity" }),
  );
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm vitest run packages/server/src/core/identity/service.test.ts && pnpm --filter @headless-lms/server typecheck`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/core/identity/service.ts packages/server/src/core/identity/service.test.ts packages/server/src/composition/container.ts
git commit -m "feat(identity): inject logger; info on user/student registration inserts"
```

---

### Task 9: Progress + assets service logging

**Files:**
- Modify: `packages/server/src/core/progress/service.ts`
- Modify: `packages/server/src/core/assets/service.ts`
- Modify: `packages/server/src/composition/container.ts` (both wirings)
- Test: `packages/server/src/core/progress/service.test.ts`, `packages/server/src/core/assets/service.test.ts`

**Interfaces:**
- Produces: `ProgressServiceImpl` gains 3rd param, `AssetsServiceImpl` gains 4th param — both `logger: Logger = noopLogger`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/server/src/core/progress/service.test.ts` (reuse its repo fixture and target literals):

```ts
import { createCapturingLogger } from "../shared/logger.js";

it("logs start once, completion at info, position at debug", async () => {
  const { logger, entries } = createCapturingLogger();
  const svc = new ProgressServiceImpl(repo, () => "2026-01-01T00:00:00Z", logger); // adapt fixture name
  const target = { studentId: "s1", targetType: "activity", targetId: "a1" } as const; // mirror the file's ProgressTarget literal
  await svc.recordStart("org-1", target);
  await svc.recordStart("org-1", target); // idempotent → no second start log
  await svc.recordPosition("org-1", { ...target, position: { t: 5 } }); // mirror the file's RecordPositionInput
  await svc.recordCompletion("org-1", target);
  expect(entries.map((e) => [e.level, e.msg])).toEqual([
    ["info", "progress started"],
    ["debug", "position recorded"],
    ["info", "progress completed"],
  ]);
  expect(entries[0]?.meta).toMatchObject({ orgId: "org-1", studentId: "s1", targetType: "activity", targetId: "a1" });
});
```

Append to `packages/server/src/core/assets/service.test.ts` (reuse its storage/repo fixtures):

```ts
import { createCapturingLogger } from "../shared/logger.js";

it("logs upload request, confirm, and removal", async () => {
  const { logger, entries } = createCapturingLogger();
  const svc = new AssetsServiceImpl(storage, repo, () => "2026-01-01T00:00:00Z", logger); // adapt fixture names
  const ticket = await svc.requestUpload("org-1", { kind: "video", filename: "a.mp4", contentType: "video/mp4", uploadedBy: "u1" }); // mirror the file's input literal
  await svc.confirm("org-1", ticket.asset.id);
  await svc.remove("org-1", ticket.asset.id);
  expect(entries.filter((e) => e.level === "info").map((e) => e.msg)).toEqual([
    "asset upload requested",
    "asset confirmed",
    "asset removed",
  ]);
});
```

(If the file's storage fixture returns `null` from `stat`, the middle entry will instead be the `debug` "asset not yet uploaded" — adjust the fixture so `stat` returns a size, mirroring however the existing confirm test arranges it.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/server/src/core/progress/service.test.ts packages/server/src/core/assets/service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement progress**

`packages/server/src/core/progress/service.ts` — imports + `private readonly logger: Logger = noopLogger` (3rd param).

```ts
  async recordStart(orgId: string, target: ProgressTarget): Promise<ProgressRecord> {
    const existing = await this.repo.findByTarget(orgId, target);
    if (existing) return existing;
    const record = await this.repo.insert(orgId, { /* existing literal unchanged */ });
    this.logger.info("progress started", {
      orgId,
      studentId: target.studentId,
      targetType: target.targetType,
      targetId: target.targetId,
    });
    return record;
  }
```

`recordPosition` — after the successful update: `this.logger.debug("position recorded", { orgId, recordId: record.id });`
`recordCompletion` — after the successful update: `this.logger.info("progress completed", { orgId, recordId: record.id });`

- [ ] **Step 4: Implement assets**

`packages/server/src/core/assets/service.ts` — imports + `private readonly logger: Logger = noopLogger` (4th param).

- `requestUpload` — before `return`: `this.logger.info("asset upload requested", { orgId, assetId: id, kind: input.kind });`
- `confirm` — in the `!stat` branch before returning: `this.logger.debug("asset not yet uploaded", { orgId, assetId: id });`; on the ready path: `const updated = await this.repo.update(id, {...}); this.logger.info("asset confirmed", { orgId, assetId: id }); return updated;`
- `remove` — before `return this.repo.delete(id);`: restructure to `const deleted = await this.repo.delete(id); this.logger.info("asset removed", { orgId, assetId: id }); return deleted;`

Container wiring:

```ts
  const progress = new ProgressServiceImpl(
    new DrizzleProgressRepository(db),
    () => new Date().toISOString(),
    logger.child({ name: "progress" }),
  );
  const assets = new AssetsServiceImpl(
    storage,
    new DrizzleAssetsRepository(db),
    () => new Date().toISOString(),
    logger.child({ name: "assets" }),
  );
```

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm vitest run packages/server/src/core/progress/service.test.ts packages/server/src/core/assets/service.test.ts && pnpm --filter @headless-lms/server typecheck`
Expected: PASS / clean.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/core/progress/service.ts packages/server/src/core/progress/service.test.ts packages/server/src/core/assets/service.ts packages/server/src/core/assets/service.test.ts packages/server/src/composition/container.ts
git commit -m "feat(progress,assets): inject logger; lifecycle info, position/pending debug"
```

---

### Task 10: Outbox relay baseline + reporting, repositories, email/storage injection

**Files:**
- Modify: `packages/server/src/adapters/events/outbox-relay.ts` (dispatch info, parked warn, batch debug)
- Modify: `packages/server/src/reporting/students/service.ts`, `packages/server/src/reporting/dashboard/service.ts`, `packages/server/src/reporting/learn/service.ts`
- Modify: all repositories in `packages/server/src/adapters/db/repositories/`: `assets.ts`, `content.ts`, `credentials.ts`, `dashboard.ts`, `entitlements.ts`, `identity.ts`, `integrations.ts`, `learn.ts`, `members.ts`, `organizations.ts`, `outbox.ts` (appender + store), `progress.ts`, `structure.ts`, `students.ts`
- Modify: `packages/server/src/adapters/email/index.ts`, `packages/server/src/adapters/storage/index.ts`
- Modify: `packages/server/src/composition/container.ts` (pass children everywhere)
- Test: `packages/server/src/adapters/events/outbox-relay.test.ts`

**Interfaces:**
- Consumes: `OUTBOX_MAX_ATTEMPTS` from `adapters/db/repositories/outbox.js` (existing, value 10).
- Produces: every repository constructor gains a final `logger: Logger = noopLogger` param; `EmailAdapter` and `MinioStorageAdapter` likewise.

- [ ] **Step 1: Write the failing relay tests**

Append to `packages/server/src/adapters/events/outbox-relay.test.ts` (reuse its store/bus/CONFIG fixtures and fakeLogger from Task 1):

```ts
it("logs each successful dispatch at info", async () => {
  // arrange one message in the store fixture, run a tick (mirror the existing happy-path test's setup)
  // then:
  expect(logger.calls.some((c) => c.level === "info" && c.msg === "outbox event dispatched")).toBe(true);
});

it("warns when a failure exhausts the retry budget", async () => {
  // arrange a message with attempts = 9 (OUTBOX_MAX_ATTEMPTS - 1) whose publish throws
  // (mirror the existing dispatch-failure test's setup), then:
  expect(logger.calls.some((c) => c.level === "warn" && c.msg === "outbox event parked")).toBe(true);
});
```

Flesh both out against the file's existing fixtures — it already has tests that dispatch a batch and simulate a failing publish; copy their arrangement, only the assertions above are new contract.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/server/src/adapters/events/outbox-relay.test.ts`
Expected: the two new tests FAIL.

- [ ] **Step 3: Implement the relay baseline**

`packages/server/src/adapters/events/outbox-relay.ts`:

```ts
import { OUTBOX_MAX_ATTEMPTS } from "../db/repositories/outbox.js";
```

In `tick()` after `fetched = batch.length;`:

```ts
      if (fetched > 0) this.logger.debug("outbox batch fetched", { count: fetched });
```

In `dispatch()` success path, after `markProcessed`:

```ts
      this.logger.info("outbox event dispatched", { id: message.id, type: message.payload.type });
```

In the failure path, replace the existing `this.logger.error(...)` call with:

```ts
      const attempt = message.attempts + 1;
      const parked = attempt >= OUTBOX_MAX_ATTEMPTS;
      const meta = {
        id: message.id,
        type: message.payload.type,
        attempt,
        nextAttemptAt: nextAttemptAt.toISOString(),
        error,
      };
      if (parked) this.logger.warn("outbox event parked", meta);
      else this.logger.error("outbox dispatch failed", meta);
```

- [ ] **Step 4: Dormant injection sweep**

For each reporting service, repository, and the email/storage adapters, append a final constructor param `private readonly logger: Logger = noopLogger` with the imports:

- In `reporting/*` and `core` files: `import type { Logger } from "../shared/ports.js";` — for reporting it is `import type { Logger } from "../../core/shared/ports.js"; import { noopLogger } from "../../core/shared/logger.js";`
- In `adapters/*` files: `import type { Logger } from "../../core/shared/ports.js"; import { noopLogger } from "../../core/shared/logger.js";` (repositories: `../../../core/...`? No — repositories live at `adapters/db/repositories/`, so `../../../core/shared/ports.js`. Match each file's existing core import paths — e.g. `repositories/outbox.ts` already imports from `../../../core/shared/ports.js`; copy its prefix.)

Patterns (repeat per class):

```ts
// repositories, e.g. content.ts
  constructor(
    private readonly db: DbExecutor,
    private readonly logger: Logger = noopLogger,
  ) {}
```

```ts
// reporting service, e.g. students/service.ts
  constructor(
    private readonly repo: StudentsReportRepository,
    private readonly logger: Logger = noopLogger,
  ) {}
```

`EmailAdapter` gets a param AND a call site (its send is a stub that throws):

```ts
export class EmailAdapter implements EmailSender {
  constructor(private readonly logger: Logger = noopLogger) {}

  async send(_message: EmailMessage): Promise<void> {
    // TODO: wire a real transport (Resend/SES/Postmark).
    this.logger.error("email send failed: no transport configured");
    throw new Error("not implemented");
  }
}
```

`MinioStorageAdapter` — append after the config param:

```ts
  constructor(config: MinioStorageConfig, private readonly logger: Logger = noopLogger) {
```

- [ ] **Step 5: Container passes children everywhere**

In `packages/server/src/composition/container.ts`, using the hoisted per-domain children from Tasks 4-9 plus new ones:

```ts
  const outboxLogger = logger.child({ name: "outbox" });
  const reportingLogger = logger.child({ name: "reporting" });
  const identityLogger = logger.child({ name: "identity" });
  const organizationsLogger = logger.child({ name: "organizations" });
  const progressLogger = logger.child({ name: "progress" });
  const assetsLogger = logger.child({ name: "assets" });
```

(Convert the inline `logger.child(...)` args from Tasks 7-9 to these consts so each domain has exactly one child.) Then:

- `new EmailAdapter()` → `new EmailAdapter(logger.child({ name: "email" }))` (only when constructing the default — the override branch stays as is)
- `new MinioStorageAdapter(config.storage)` → `new MinioStorageAdapter(config.storage, logger.child({ name: "storage" }))`
- Every `new Drizzle*Repository(db)` / `(tx)` gains its domain's child as the final arg, including inside the three UoW factories, e.g.:

```ts
  const contentUow = new DrizzleUnitOfWork(db, (tx) => ({
    courses: new DrizzleContentRepository(tx, contentLogger),
    outbox: new DrizzleOutboxAppender(tx, outboxLogger),
  }));
```

- `new DrizzleOutboxStore(db)` → `new DrizzleOutboxStore(db, outboxLogger)`; the relay keeps `outboxLogger`.
- `new DrizzleCredentialStore(db, config.credentialStoreKey)` → append `integrationsLogger`; same inside the integrations UoW factory.
- Reporting: all three repos + services get `reportingLogger`.

- [ ] **Step 6: Run full suite, typecheck, lint**

Run: `pnpm --filter @headless-lms/server test && pnpm typecheck && pnpm lint`
Expected: all PASS / clean.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src
git commit -m "feat(server): logger injected everywhere — relay baseline, reporting, repositories, email/storage"
```

---

### Task 11: Full verification + smoke

- [ ] **Step 1: Full workspace test run**

Run: `pnpm test`
Expected: all workspaces PASS.

- [ ] **Step 2: Typecheck + lint the whole repo**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 3: Boot smoke (only if the dev database is up)**

Run: `pnpm --filter api dev` briefly (or skip if the DB is down) and confirm startup logs are single-stream pino JSON (Fastify banner lines and any relay/domain lines share the format), then Ctrl-C. If the DB isn't available, note it and rely on the suite.

- [ ] **Step 4: Commit any stragglers**

```bash
git status --short   # expect empty; commit leftovers if any with an appropriate message
```
