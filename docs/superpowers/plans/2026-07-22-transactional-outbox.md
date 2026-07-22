# Transactional Outbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> Executes the spec `docs/superpowers/specs/2026-07-22-transactional-outbox-design.md` (analysis: `docs/architecture/2026-07-22-outbox-analysis.md`). All design decisions are locked there. Work happens in the worktree `/…/.claude/worktrees/outbox-pattern` on branch `feat--swappable-content`.

**Goal:** Every domain event is appended to an `outbox` row in the same DB transaction as the domain write (no dual write), and a same-process polling relay dispatches outbox rows to the in-process `EventBus` at-least-once — after this vertical the only `EventBus.publish` caller is the relay.

**Architecture:** A generic `UnitOfWork<Scope>` port in `core/shared/ports.ts` gives each service's mutating use case a scope of tx-bound repos plus an `OutboxAppender`; the Drizzle adapter implements it as `db.transaction(tx => fn(makeScope(tx)))`. `DomainEvent` gains `id`/`occurredAt`, stamped by the appender. A `PollingOutboxRelay` (setTimeout chain, skip-past-failures, capped exponential backoff, park at `maxAttempts`, retention sweep) reads via `OutboxStore` and fans out through the unchanged `InMemoryEventBus`. Integrations' credential+connection writes fold into the same transaction, closing the existing orphan-credential window.

**Tech Stack:** TypeScript (strict, ESM, `.js` relative imports), Fastify 5, drizzle-orm 0.45 / drizzle-kit (baseline-regen migrations), vitest 2 (`vi.useFakeTimers`), pnpm workspaces.

## Global Constraints

- **Import boundaries (ESLint-enforced, `.eslintrc.cjs`):** `core/` may not import `adapters/`, `composition/`, `http/`, `reporting/`, or `drizzle-orm`. The new ports are pure TS in `core/shared/ports.ts`; adapters implement them. Adapters may import core ports (and `core/shared/id.js` — existing schema-file precedent).
- **Relative imports end in `.js`** (ESM, `verbatimModuleSyntax`).
- **Type ownership:** `DomainEvent` and `NewDomainEvent` are declared in `@headless-lms/types` (`packages/types/src/shared.ts`); `core/shared/ports.ts` re-exports, never re-declares.
- **Commands:** per-workspace `pnpm --filter @headless-lms/server <script>`; single test file `pnpm --filter @headless-lms/server exec vitest run <path-relative-to-package>`. If `packages/types/dist` (or utils/api-contract dist) is missing, build it first: `pnpm --filter @headless-lms/types build` (vitest resolves workspace deps through `dist/`; `tsc` uses source via `tsconfig.base.json` paths).
- **The relay must NOT autostart on `app.ready()`** — `apps/api/scripts/gen-openapi.ts` boots the real container with `app.ready()` during `pnpm gen:sdk`. Start is explicit in `apps/api/src/main.ts` after `listen`.
- **Spec defaults:** pollIntervalMs 1000, batchSize 100, maxAttempts 10, backoffBaseMs 1000, backoffMaxMs 60000, retentionDays 7, cleanupIntervalMs 3600000, enabled true. Backoff = `min(backoffBaseMs * 2^attempts, backoffMaxMs)`. `outbox.org_id` nullable. Dead-letter = log-only parked rows.
- **Migrations:** baseline regen, never incremental — regenerate `drizzle/0000_baseline.sql` (Task 10).
- **Commits:** one per task, SHORT descriptive message, **NO** `Co-Authored-By`/`Claude-Session`/"Generated with" trailers of any kind (repo rule, overrides defaults).
- **Before Task 1:** confirm the baseline is green: `pnpm --filter @headless-lms/server test` → all suites pass.

## Typecheck red window (expected and bounded)

Vitest does not typecheck, so every task's test gate stays runnable throughout. `pnpm --filter @headless-lms/server typecheck` however is **red from Task 1 through Task 6** and goes green at **Task 7**:

- After Task 1: exactly 6 errors — the old event-literal sites, `src/core/entitlements/service.ts` (~lines 25, 37) and `src/core/integrations/service.ts` (~lines 61, 80, 100, 117), each `TS2739 … missing the following properties from type '<Event>': id, occurredAt`.
- Tasks 2–4 must add **no new** typecheck errors (each task's gate re-runs `tsc --noEmit` and compares against that known list).
- Task 5 clears the entitlements errors but introduces a container arity error (`TS2554 Expected 2 arguments…` at `composition/container.ts:120`); Task 6 does the same for integrations (`container.ts:141`).
- Task 7 (container rewiring) closes the window: full `typecheck`, `test`, `lint` all green — that is Task 7's gate.

## File structure

| File | Role |
|---|---|
| `packages/types/src/shared.ts` (modify) | `DomainEvent` gains `id`/`occurredAt`; new `NewDomainEvent<E>` producer shape |
| `packages/server/src/core/shared/id.ts` (modify) | `ID_PREFIXES.event = "evt"` |
| `packages/server/src/core/shared/ports.ts` (modify) | `OutboxAppender`, `UnitOfWork<Scope>`, `OutboxMessage`, `OutboxStore`, `OutboxRelay` |
| `packages/server/src/core/entitlements/ports.ts` (modify) | `EntitlementsTxScope`, `EntitlementsUnitOfWork` |
| `packages/server/src/core/integrations/ports.ts` (modify) | `IntegrationsTxScope`, `IntegrationsUnitOfWork` |
| `packages/server/src/adapters/db/schema/outbox.ts` (create) | `outbox` table + partial unpublished index |
| `packages/server/src/adapters/db/index.ts` (modify) | shared `Tx` + `DbExecutor` types |
| `packages/server/src/adapters/db/repositories/outbox.ts` (create) | `stampEvent`, `DrizzleOutboxAppender`, `DrizzleOutboxStore` |
| `packages/server/src/adapters/db/unit-of-work.ts` (create) | `DrizzleUnitOfWork<Scope>` |
| `packages/server/src/adapters/events/outbox-relay.ts` (create) | `PollingOutboxRelay`, `PollingOutboxRelayConfig` |
| `packages/server/src/core/{entitlements,integrations}/service.ts` (modify) | UoW-based mutations, no `EventBus` |
| `packages/server/src/composition/container.ts` (modify) | UoW wiring, outbox store + relay, `outboxRelay` on `Container`, `OutboxConfig` + defaults |
| `packages/server/src/http/server.ts` (modify) | `onClose` → `outboxRelay.stop()` |
| `apps/api/src/config.ts`, `apps/api/src/main.ts` (modify) | env mapping; explicit `start()` after listen |

---

### Task 1: Event envelope — `DomainEvent.id`/`occurredAt` + `genId("event")`

**Files:**
- Modify: `packages/types/src/shared.ts`
- Modify: `packages/server/src/core/shared/id.ts` (ID_PREFIXES)
- Test: `packages/server/src/core/shared/id.test.ts`

**Interfaces:**
- Produces: `DomainEvent { readonly type: string; readonly id: string; readonly occurredAt: string }`; `NewDomainEvent<E extends DomainEvent = DomainEvent> = Omit<E, "id" | "occurredAt">`; `genId("event")` → `evt_<ksuid>`. Every later task builds on these exact names.

- [ ] **Step 1: Write the failing test** — append inside the `describe("genId", …)` block of `packages/server/src/core/shared/id.test.ts`:

```ts
  it("generates outbox event ids with the evt prefix", () => {
    expect(genId("event").startsWith("evt_")).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @headless-lms/server exec vitest run src/core/shared/id.test.ts`
Expected: FAIL — `expected false to be true` (unknown prefix yields `undefined_…`).

- [ ] **Step 3: Implement** — in `packages/server/src/core/shared/id.ts`, add one entry to `ID_PREFIXES` (after `connection: "con",`):

```ts
  connection: "con",
  event: "evt",
} as const;
```

Replace the whole body of `packages/types/src/shared.ts` with:

```ts
// Cross-context shapes shared by every bounded context.

/**
 * Base shape of every domain event on the platform. `id` and `occurredAt` are
 * stamped by the transactional OutboxAppender at append time — producers
 * construct events WITHOUT them (see NewDomainEvent); consumers key
 * idempotency on `id`.
 */
export interface DomainEvent {
  readonly type: string;
  /** Stable event identity (genId("event")) — the consumer idempotency key. */
  readonly id: string;
  /** ISO-8601 timestamp, stamped when the event is appended to the outbox. */
  readonly occurredAt: string;
}

/** A domain event as a producer constructs it — before the appender stamps it. */
export type NewDomainEvent<E extends DomainEvent = DomainEvent> = Omit<E, "id" | "occurredAt">;

/** One page of a paginated listing. */
export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}
```

- [ ] **Step 4: Run tests + rebuild types dist**

Run: `pnpm --filter @headless-lms/types typecheck && pnpm --filter @headless-lms/types build && pnpm --filter @headless-lms/server exec vitest run src/core/shared/id.test.ts`
Expected: types typecheck+build succeed; id tests PASS (6 tests).

Then record the red window: `pnpm --filter @headless-lms/server typecheck` → exactly the 6 `TS2739 … missing … id, occurredAt` errors in `core/entitlements/service.ts` and `core/integrations/service.ts`. Anything else is a mistake in this task.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/shared.ts packages/server/src/core/shared/id.ts packages/server/src/core/shared/id.test.ts
git commit -m "feat(types): domain event envelope (id, occurredAt) + evt id prefix"
```

---

### Task 2: Outbox ports in `core/shared/ports.ts` + per-context tx scopes

**Files:**
- Modify: `packages/server/src/core/shared/ports.ts`
- Modify: `packages/server/src/core/entitlements/ports.ts`
- Modify: `packages/server/src/core/integrations/ports.ts`

**Interfaces:**
- Consumes: `DomainEvent`, `NewDomainEvent` from Task 1.
- Produces (exact — all later tasks depend on these): `OutboxAppender.append<E extends NewDomainEvent>(events: E[]): Promise<void>`; `UnitOfWork<Scope>.run<T>(fn: (scope: Scope & { outbox: OutboxAppender }) => Promise<T>): Promise<T>`; `OutboxMessage { id: string; eventId: string; type: string; payload: DomainEvent; attempts: number }`; `OutboxStore { fetchBatch(limit): Promise<OutboxMessage[]>; markPublished(id): Promise<void>; markFailed(id, error, nextAttemptAt): Promise<void>; deletePublishedBefore(cutoff): Promise<number> }`; `OutboxRelay { start(): void; stop(): Promise<void> }`; `EntitlementsTxScope { entitlements: EntitlementsRepository }` / `EntitlementsUnitOfWork`; `IntegrationsTxScope { connections: ConnectionsRepository; credentials: CredentialStore }` / `IntegrationsUnitOfWork`.

Type-only task: the gate is `tsc --noEmit` introducing no new errors (vitest can't see pure types).

- [ ] **Step 1: Add the ports** — in `packages/server/src/core/shared/ports.ts`, change the first import/re-export lines to:

```ts
import type { DomainEvent, NewDomainEvent } from "@headless-lms/types";

export type { DomainEvent, NewDomainEvent };
```

and insert after the `EventBus` interface:

```ts
// --- Transactional outbox ----------------------------------------------------
// Producer side: services append events inside a UnitOfWork — the append and
// the domain write commit in ONE transaction. Relay side: the poller drains
// committed rows and publishes them to the EventBus (the ONLY publish caller
// after this migration). Core never calls the relay-side ports — they live
// here like EmailSender/ObjectStorage, consumed by adapters + composition.

/** Appends domain events to the transactional outbox. Inside a UnitOfWork
 *  scope the append shares the scope's transaction — the event becomes
 *  visible to the relay only when the surrounding write commits. Stamps
 *  `id` (genId("event")) and `occurredAt` on each event. */
export interface OutboxAppender {
  append<E extends NewDomainEvent>(events: E[]): Promise<void>;
}

/** Runs a callback atomically: every port in the scope (tx-bound context
 *  repos + the outbox appender) executes in one database transaction; a
 *  thrown error rolls all of it back. */
export interface UnitOfWork<Scope> {
  run<T>(fn: (scope: Scope & { outbox: OutboxAppender }) => Promise<T>): Promise<T>;
}

/** An outbox row as the relay consumes it. */
export interface OutboxMessage {
  /** Outbox position (bigserial as string) — the relay's ordering key. */
  id: string;
  /** Stable event identity (idempotency key for consumers). */
  eventId: string;
  type: string;
  /** The full self-contained DomainEvent, as stamped at append time. */
  payload: DomainEvent;
  /** Dispatch attempts so far. */
  attempts: number;
}

export interface OutboxStore {
  /** Due, unpublished, unparked messages in commit order; claims them for this reader. */
  fetchBatch(limit: number): Promise<OutboxMessage[]>;
  markPublished(id: string): Promise<void>;
  markFailed(id: string, error: string, nextAttemptAt: Date): Promise<void>;
  /** Retention sweep: delete published rows older than the cutoff. Returns the count. */
  deletePublishedBefore(cutoff: Date): Promise<number>;
}

/** The relay mechanism — how committed outbox rows become dispatched events.
 *  Swappable: same-process poller today; LISTEN/NOTIFY or an external worker
 *  later, without touching producers or subscribers. */
export interface OutboxRelay {
  start(): void;
  /** Graceful: resolves after the in-flight batch finishes. Safe if never started. */
  stop(): Promise<void>;
}
```

- [ ] **Step 2: Entitlements tx scope** — in `packages/server/src/core/entitlements/ports.ts`, add below the existing imports:

```ts
import type { UnitOfWork } from "../shared/ports.js";
```

and append at the end of the file:

```ts
/** Tx-scoped port bundle for this context's mutating use cases: the repo the
 *  UnitOfWork binds to its transaction (plus the outbox, added by the UoW). */
export interface EntitlementsTxScope {
  entitlements: EntitlementsRepository;
}

export type EntitlementsUnitOfWork = UnitOfWork<EntitlementsTxScope>;
```

- [ ] **Step 3: Integrations tx scope** — in `packages/server/src/core/integrations/ports.ts`, add below the existing imports:

```ts
import type { CredentialStore, UnitOfWork } from "../shared/ports.js";
```

and append at the end of the file:

```ts
/** Tx-scoped port bundle for this context's mutating use cases. Folding the
 *  credential store in makes credential + connection writes + outbox append
 *  one transaction (closes the historical orphan-credential window). */
export interface IntegrationsTxScope {
  connections: ConnectionsRepository;
  credentials: CredentialStore;
}

export type IntegrationsUnitOfWork = UnitOfWork<IntegrationsTxScope>;
```

- [ ] **Step 4: Verify no new errors**

Run: `pnpm --filter @headless-lms/server exec tsc -p tsconfig.json --noEmit`
Expected: exactly the same 6 known errors from Task 1 (entitlements/integrations `service.ts`), nothing new.
Run: `pnpm --filter @headless-lms/server test`
Expected: full suite PASS (runtime untouched).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/core/shared/ports.ts packages/server/src/core/entitlements/ports.ts packages/server/src/core/integrations/ports.ts
git commit -m "feat(core): outbox + unit-of-work ports and per-context tx scopes"
```

---

### Task 3: Outbox schema + shared `DbExecutor` (widen Drizzle repos)

**Files:**
- Create: `packages/server/src/adapters/db/schema/outbox.ts`
- Test: `packages/server/src/adapters/db/schema/outbox.test.ts`
- Modify: `packages/server/src/adapters/db/schema/index.ts` (barrel)
- Modify: `packages/server/src/adapters/db/index.ts` (`Tx`, `DbExecutor`)
- Modify: `packages/server/src/adapters/db/repositories/entitlements.ts`, `integrations.ts`, `credentials.ts` (constructor widening), `structure.ts` (promote its local `Tx`)

**Interfaces:**
- Consumes: `genId` (Task 1's `event` prefix for `event_id` default).
- Produces: `outbox` pgTable (columns `id` bigserial-bigint PK, `event_id` text notNull unique `$defaultFn(genId("event"))`, `type` text notNull, `org_id` text nullable, `payload` jsonb notNull, `occurred_at` timestamp notNull defaultNow, `published_at` timestamp, `attempts` integer notNull default 0, `next_attempt_at` timestamp notNull defaultNow, `last_error` text; partial index `outbox_unpublished_idx` on `(next_attempt_at, id) WHERE published_at IS NULL`); `export type Tx`, `export type DbExecutor = NodePgDatabase | Tx` from `adapters/db/index.js`; the three repos' constructors accept `DbExecutor`.

- [ ] **Step 1: Write the failing schema test** — create `packages/server/src/adapters/db/schema/outbox.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { outbox } from "./outbox.js";

describe("outbox schema", () => {
  const config = getTableConfig(outbox);

  it("is the outbox table with the polling columns", () => {
    expect(config.name).toBe("outbox");
    expect(config.columns.map((c) => c.name).sort()).toEqual([
      "attempts",
      "event_id",
      "id",
      "last_error",
      "next_attempt_at",
      "occurred_at",
      "org_id",
      "payload",
      "published_at",
      "type",
    ]);
  });

  it("keeps org_id nullable (platform-level events)", () => {
    const orgId = config.columns.find((c) => c.name === "org_id");
    expect(orgId?.notNull).toBe(false);
  });

  it("declares the partial unpublished index", () => {
    expect(config.indexes).toHaveLength(1);
    expect(config.indexes[0]?.config.name).toBe("outbox_unpublished_idx");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @headless-lms/server exec vitest run src/adapters/db/schema/outbox.test.ts`
Expected: FAIL — `Cannot find module './outbox.js'`.

- [ ] **Step 3: Create the schema** — `packages/server/src/adapters/db/schema/outbox.ts`:

```ts
// Transactional outbox. Infrastructure, not a domain table — the org-scoped
// composite (org_id, id) PK convention deliberately does not apply: a
// monotonic bigserial PK is the relay's commit-order polling key. org_id is
// nullable (platform-level events may exist) and kept for filtering/debugging.
// Rows are appended by DrizzleOutboxAppender inside the SAME transaction as
// the domain write, and drained by the relay via DrizzleOutboxStore.
import { bigserial, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { genId } from "../../../core/shared/id.js";

export const outbox = pgTable(
  "outbox",
  {
    /** Monotonic position — the relay's ordering and paging key. */
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    /** Stable event identity for consumer-side idempotency/dedup. */
    eventId: text("event_id")
      .notNull()
      .unique()
      .$defaultFn(() => genId("event")),
    /** DomainEvent.type, e.g. "enrollment.created". */
    type: text("type").notNull(),
    /** The org the event belongs to; null for platform-level events. */
    orgId: text("org_id"),
    /** The full DomainEvent, JSON-serialised — self-contained snapshot. */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    /** When the producing transaction wrote the row. */
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
    /** Set once the relay has dispatched to all subscribers. NULL = pending. */
    publishedAt: timestamp("published_at"),
    /** Dispatch attempts so far. attempts >= maxAttempts ⇒ parked (dead letter, log-only). */
    attempts: integer("attempts").notNull().default(0),
    /** Earliest next dispatch (backoff schedule). */
    nextAttemptAt: timestamp("next_attempt_at").notNull().defaultNow(),
    /** Message of the most recent dispatch failure. */
    lastError: text("last_error"),
  },
  (t) => ({
    // Partial index: the poll query's exact shape. Stays tiny — only
    // unpublished rows live in it; published rows fall out on update.
    unpublishedIdx: index("outbox_unpublished_idx")
      .on(t.nextAttemptAt, t.id)
      .where(sql`${t.publishedAt} is null`),
  }),
);
```

Add to `packages/server/src/adapters/db/schema/index.ts` (after the `integrations.js` line):

```ts
export * from "./outbox.js";
```

- [ ] **Step 4: Run schema test to verify it passes**

Run: `pnpm --filter @headless-lms/server exec vitest run src/adapters/db/schema/outbox.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Promote `Tx` → shared `DbExecutor`** — in `packages/server/src/adapters/db/index.ts`, add after the existing imports (this needs `import { drizzle } from …` to be joined by a type import):

```ts
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

/** Transaction executor — the same query surface as the root db.
 *  (Promoted from the structure.ts repository's local alias.) */
export type Tx = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];

/** What a Drizzle repository executes against: the root db OR a transaction
 *  handle — tx-bound repo instances are how DrizzleUnitOfWork guarantees no
 *  statement escapes the transaction. */
export type DbExecutor = NodePgDatabase | Tx;
```

Widen the three write-path repos (mechanical — no query code changes):

`packages/server/src/adapters/db/repositories/entitlements.ts` — replace
`import type { NodePgDatabase } from "drizzle-orm/node-postgres";` with
`import type { DbExecutor } from "../index.js";` and change the constructor to
`constructor(private readonly db: DbExecutor) {}`.

`packages/server/src/adapters/db/repositories/integrations.ts` — same two changes (`DbExecutor` import, `constructor(private readonly db: DbExecutor) {}`).

`packages/server/src/adapters/db/repositories/credentials.ts` — replace the `NodePgDatabase` import with `import type { DbExecutor } from "../index.js";` and change the first constructor parameter to `private readonly db: DbExecutor,`.

`packages/server/src/adapters/db/repositories/structure.ts` — delete the local alias lines:

```ts
/** Transaction executor — the same query surface as the root db. */
type Tx = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];
```

and instead extend its `../index.js`-adjacent imports with `import type { Tx } from "../index.js";` (its constructor stays `NodePgDatabase` — it opens its own transactions).

- [ ] **Step 6: Verify**

Run: `pnpm --filter @headless-lms/server test`
Expected: full suite PASS.
Run: `pnpm --filter @headless-lms/server exec tsc -p tsconfig.json --noEmit`
Expected: only the 6 known Task-1 errors (the widening itself is verified clean — the `NodePgDatabase | Tx` union supports select/insert/update/delete/returning; probed against drizzle-orm 0.45.2 during planning).

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/adapters/db
git commit -m "feat(db): outbox table + shared DbExecutor for tx-bound repositories"
```

---

### Task 4: `DrizzleOutboxAppender` / `DrizzleOutboxStore` / `DrizzleUnitOfWork`

**Files:**
- Create: `packages/server/src/adapters/db/repositories/outbox.ts`
- Create: `packages/server/src/adapters/db/unit-of-work.ts`
- Test: `packages/server/src/adapters/db/repositories/outbox.test.ts`
- Test: `packages/server/src/adapters/db/unit-of-work.test.ts`

**Interfaces:**
- Consumes: `outbox` table, `Tx`/`DbExecutor` (Task 3); `OutboxAppender`, `OutboxStore`, `OutboxMessage`, `UnitOfWork`, `NewDomainEvent`, `DomainEvent` (Task 2); `genId` (Task 1).
- Produces: `stampEvent<E extends NewDomainEvent>(event: E, at?: Date): E & { id: string; occurredAt: string }`; `class DrizzleOutboxAppender implements OutboxAppender` (ctor `(tx: DbExecutor)`); `class DrizzleOutboxStore implements OutboxStore` (ctor `(db: NodePgDatabase, maxAttempts: number)`); `class DrizzleUnitOfWork<Scope> implements UnitOfWork<Scope>` (ctor `(db: NodePgDatabase, makeScope: (tx: Tx) => Scope)`). Tasks 7/9 construct exactly these.

- [ ] **Step 1: Write the failing appender tests** — create `packages/server/src/adapters/db/repositories/outbox.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { DrizzleOutboxAppender, stampEvent } from "./outbox.js";
import type { DbExecutor } from "../index.js";
import type { NewDomainEvent } from "../../../core/shared/ports.js";

describe("stampEvent", () => {
  it("stamps a fresh evt_ id and the append time as ISO occurredAt", () => {
    const at = new Date("2026-07-22T12:00:00.000Z");
    const stamped = stampEvent({ type: "enrollment.created", orgId: "org-1" }, at);
    expect(stamped.id).toMatch(/^evt_[0-9A-Za-z]{27}$/);
    expect(stamped.occurredAt).toBe("2026-07-22T12:00:00.000Z");
    expect(stamped.type).toBe("enrollment.created");
    expect(stamped.orgId).toBe("org-1");
  });

  it("stamps a unique id per call", () => {
    expect(stampEvent({ type: "t" }).id).not.toBe(stampEvent({ type: "t" }).id);
  });
});

function fakeTx() {
  const values = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values }));
  return { tx: { insert } as unknown as DbExecutor, insert, values };
}

describe("DrizzleOutboxAppender", () => {
  it("inserts one stamped row per event, mirroring type/orgId and eventId=payload.id", async () => {
    const { tx, values } = fakeTx();
    const events = [
      { type: "enrollment.created", orgId: "org-1" } as NewDomainEvent,
      { type: "connection.removed", orgId: "org-2" } as NewDomainEvent,
    ];
    await new DrizzleOutboxAppender(tx).append(events);
    const rows = values.mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ type: "enrollment.created", orgId: "org-1" });
    expect(rows[1]).toMatchObject({ type: "connection.removed", orgId: "org-2" });
    const payload = rows[0]!["payload"] as { id: string; occurredAt: string; orgId: string };
    expect(payload.id).toMatch(/^evt_/);
    expect(payload.orgId).toBe("org-1");
    expect(rows[0]!["eventId"]).toBe(payload.id);
    expect(rows[0]!["occurredAt"]).toEqual(new Date(payload.occurredAt));
  });

  it("defaults orgId to null for platform-level events", async () => {
    const { tx, values } = fakeTx();
    await new DrizzleOutboxAppender(tx).append([{ type: "platform.ping" }]);
    const rows = values.mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(rows[0]!["orgId"]).toBeNull();
  });

  it("is a no-op for an empty event list", async () => {
    const { tx, insert } = fakeTx();
    await new DrizzleOutboxAppender(tx).append([]);
    expect(insert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @headless-lms/server exec vitest run src/adapters/db/repositories/outbox.test.ts`
Expected: FAIL — `Cannot find module './outbox.js'`.

- [ ] **Step 3: Implement appender + store** — create `packages/server/src/adapters/db/repositories/outbox.ts`:

```ts
// outbox — Drizzle appender + store (implement the core outbox ports).
//
// DrizzleOutboxAppender is constructed with the TRANSACTION executor of a
// DrizzleUnitOfWork scope — the same-transaction guarantee lives here: the
// appended row commits (or rolls back) with the domain write.
// DrizzleOutboxStore is constructed with the root db and serves the relay:
// batch fetch (FOR UPDATE SKIP LOCKED in its own short tx), publish/failure
// bookkeeping, and the retention sweep.
import { and, asc, eq, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type {
  DomainEvent,
  NewDomainEvent,
  OutboxAppender,
  OutboxMessage,
  OutboxStore,
} from "../../../core/shared/ports.js";
import { genId } from "../../../core/shared/id.js";
import type { DbExecutor } from "../index.js";
import { outbox } from "../schema/outbox.js";

/** Stamp `id` + `occurredAt` onto a producer-constructed event. Pure; exported for tests. */
export function stampEvent<E extends NewDomainEvent>(
  event: E,
  at: Date = new Date(),
): E & { id: string; occurredAt: string } {
  return { ...event, id: genId("event"), occurredAt: at.toISOString() };
}

export class DrizzleOutboxAppender implements OutboxAppender {
  constructor(private readonly tx: DbExecutor) {}

  async append<E extends NewDomainEvent>(events: E[]): Promise<void> {
    if (events.length === 0) return;
    const rows = events.map((event) => {
      const stamped = stampEvent(event);
      const record = stamped as Record<string, unknown>;
      return {
        eventId: stamped.id,
        type: stamped.type,
        orgId: typeof record["orgId"] === "string" ? (record["orgId"] as string) : null,
        payload: stamped as unknown as Record<string, unknown>,
        occurredAt: new Date(stamped.occurredAt),
      };
    });
    await this.tx.insert(outbox).values(rows);
  }
}

export class DrizzleOutboxStore implements OutboxStore {
  constructor(
    private readonly db: NodePgDatabase,
    /** Rows with attempts >= maxAttempts are parked: excluded from fetchBatch, kept for inspection. */
    private readonly maxAttempts: number,
  ) {}

  async fetchBatch(limit: number): Promise<OutboxMessage[]> {
    // Own short transaction: FOR UPDATE SKIP LOCKED lets a second process
    // claim disjoint rows if the deployment ever scales out.
    const rows = await this.db.transaction((tx) =>
      tx
        .select()
        .from(outbox)
        .where(
          and(
            isNull(outbox.publishedAt),
            lte(outbox.nextAttemptAt, new Date()),
            lt(outbox.attempts, this.maxAttempts),
          ),
        )
        .orderBy(asc(outbox.id))
        .limit(limit)
        .for("update", { skipLocked: true }),
    );
    return rows.map((row) => ({
      id: String(row.id),
      eventId: row.eventId,
      type: row.type,
      payload: row.payload as unknown as DomainEvent,
      attempts: row.attempts,
    }));
  }

  async markPublished(id: string): Promise<void> {
    await this.db
      .update(outbox)
      .set({ publishedAt: new Date() })
      .where(eq(outbox.id, BigInt(id)));
  }

  async markFailed(id: string, error: string, nextAttemptAt: Date): Promise<void> {
    await this.db
      .update(outbox)
      .set({ attempts: sql`${outbox.attempts} + 1`, lastError: error, nextAttemptAt })
      .where(eq(outbox.id, BigInt(id)));
  }

  async deletePublishedBefore(cutoff: Date): Promise<number> {
    const deleted = await this.db
      .delete(outbox)
      .where(and(isNotNull(outbox.publishedAt), lt(outbox.publishedAt, cutoff)))
      .returning({ id: outbox.id });
    return deleted.length;
  }
}
```

- [ ] **Step 4: Run appender tests to verify pass**

Run: `pnpm --filter @headless-lms/server exec vitest run src/adapters/db/repositories/outbox.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Write the failing UnitOfWork tests** — create `packages/server/src/adapters/db/unit-of-work.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { DrizzleUnitOfWork } from "./unit-of-work.js";
import { DrizzleOutboxAppender } from "./repositories/outbox.js";
import type { Tx } from "./index.js";

function fakeDb() {
  const values = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values }));
  const tx = { insert } as unknown as Tx;
  const transaction = vi.fn(async <T>(fn: (t: Tx) => Promise<T>) => fn(tx));
  return { db: { transaction } as unknown as NodePgDatabase, tx, transaction, insert };
}

describe("DrizzleUnitOfWork", () => {
  it("runs the callback inside db.transaction with the tx-bound scope + outbox appender", async () => {
    const { db, tx, transaction } = fakeDb();
    const makeScope = vi.fn((executor: Tx) => ({ marker: executor }));
    const uow = new DrizzleUnitOfWork(db, makeScope);
    const result = await uow.run(async (scope) => {
      expect(scope.marker).toBe(tx);
      expect(scope.outbox).toBeInstanceOf(DrizzleOutboxAppender);
      return "done";
    });
    expect(result).toBe("done");
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(makeScope).toHaveBeenCalledWith(tx);
  });

  it("appends through the SAME transaction executor as the scope", async () => {
    const { db, insert } = fakeDb();
    const uow = new DrizzleUnitOfWork(db, () => ({}));
    await uow.run(async ({ outbox }) => {
      await outbox.append([{ type: "test.event" }]);
    });
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("propagates a thrown error out of run (drizzle rolls the tx back)", async () => {
    const { db } = fakeDb();
    const uow = new DrizzleUnitOfWork(db, () => ({}));
    await expect(
      uow.run(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `pnpm --filter @headless-lms/server exec vitest run src/adapters/db/unit-of-work.test.ts`
Expected: FAIL — `Cannot find module './unit-of-work.js'`.

- [ ] **Step 7: Implement the unit of work** — create `packages/server/src/adapters/db/unit-of-work.ts`:

```ts
// Drizzle unit of work (implements the core UnitOfWork port). One generic
// implementation, parameterised per context by a makeScope(tx) factory that
// constructs TX-BOUND repository instances — repos are stateless wrappers
// over the executor, so per-transaction construction is negligible and is
// exactly how the scope guarantees no statement escapes the transaction.
// A DrizzleOutboxAppender on the same tx completes the scope: the domain
// write and the outbox append commit (or roll back) together.
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { OutboxAppender, UnitOfWork } from "../../core/shared/ports.js";
import type { Tx } from "./index.js";
import { DrizzleOutboxAppender } from "./repositories/outbox.js";

export class DrizzleUnitOfWork<Scope> implements UnitOfWork<Scope> {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly makeScope: (tx: Tx) => Scope,
  ) {}

  run<T>(fn: (scope: Scope & { outbox: OutboxAppender }) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) =>
      fn({ ...this.makeScope(tx), outbox: new DrizzleOutboxAppender(tx) }),
    );
  }
}
```

- [ ] **Step 8: Run to verify pass**

Run: `pnpm --filter @headless-lms/server exec vitest run src/adapters/db/unit-of-work.test.ts src/adapters/db/repositories/outbox.test.ts`
Expected: PASS (8 tests). Also `pnpm --filter @headless-lms/server exec tsc -p tsconfig.json --noEmit` → only the 6 known errors.

- [ ] **Step 9: Commit**

```bash
git add packages/server/src/adapters/db/repositories/outbox.ts packages/server/src/adapters/db/repositories/outbox.test.ts packages/server/src/adapters/db/unit-of-work.ts packages/server/src/adapters/db/unit-of-work.test.ts
git commit -m "feat(db): drizzle outbox appender/store and generic unit of work"
```

---

### Task 5: Migrate the entitlements service to the UnitOfWork

**Files:**
- Modify: `packages/server/src/core/entitlements/service.ts`
- Test (rewrite): `packages/server/src/core/entitlements/service.test.ts`

**Interfaces:**
- Consumes: `EntitlementsUnitOfWork`/`EntitlementsTxScope` (Task 2).
- Produces: `EntitlementsServiceImpl` constructor is now `(repo: EntitlementsRepository, uow: EntitlementsUnitOfWork)` — Task 7 wires exactly this. Grant/setStatus append `enrollment.created` / `enrollment.deleted` / `enrollment.updated` inside `uow.run`.

- [ ] **Step 1: Rewrite the test file to the target API (this is the failing test)** — replace the whole of `packages/server/src/core/entitlements/service.test.ts` with:

```ts
import { describe, it, expect, vi } from "vitest";
import { EntitlementsServiceImpl } from "./service.js";
import type { EntitlementsRepository, EntitlementsUnitOfWork } from "./ports.js";
import type { Entitlement } from "./model.js";
import type { NewDomainEvent, OutboxAppender } from "../shared/ports.js";

const SAMPLE: Entitlement = {
  id: "e1",
  studentId: "s1",
  firstName: "Bob",
  lastName: "Smith",
  studentEmail: "bob@example.com",
  courseId: "c1",
  courseTitle: "Intro",
  status: "active",
  grantedAt: "2026-01-01T00:00:00Z",
  expiresAt: null,
  source: "manual",
};

function fakeRepo(over?: Partial<EntitlementsRepository>): EntitlementsRepository {
  return {
    list: vi.fn().mockResolvedValue({ rows: [SAMPLE], total: 1, page: 1, pageSize: 20 }),
    insert: vi.fn().mockResolvedValue(SAMPLE),
    setStatus: vi.fn().mockResolvedValue(SAMPLE),
    ...over,
  };
}

/** Pass-through unit of work: runs the callback with the fake repo as the
 *  tx-bound scope plus a capturing outbox appender. */
function fakeUow(repo: EntitlementsRepository) {
  const appended: NewDomainEvent[] = [];
  const append = vi.fn(async (events: NewDomainEvent[]) => {
    appended.push(...events);
  });
  const outbox: OutboxAppender = { append };
  const uow: EntitlementsUnitOfWork = {
    run: (fn) => fn({ entitlements: repo, outbox }),
  };
  return { uow, append, appended };
}

function build(repo = fakeRepo()) {
  const { uow, append, appended } = fakeUow(repo);
  const svc = new EntitlementsServiceImpl(repo, uow);
  return { svc, repo, append, appended };
}

describe("EntitlementsService", () => {
  it("lists entitlements via the read repository without appending events", async () => {
    const { svc, repo, append } = build();
    const page = await svc.list("org-1", { page: 1, pageSize: 20 });
    expect(page.rows).toHaveLength(1);
    expect(repo.list).toHaveBeenCalledWith("org-1", { page: 1, pageSize: 20 });
    expect(append).not.toHaveBeenCalled();
  });

  it("grants an entitlement (insert) and returns it", async () => {
    const { svc, repo } = build();
    const result = await svc.grant("org-1", { studentId: "s1", courseId: "c1", expiresAt: null });
    expect(result.id).toBe("e1");
    expect(repo.insert).toHaveBeenCalledWith("org-1", {
      studentId: "s1",
      courseId: "c1",
      expiresAt: null,
    });
  });

  it("appends enrollment.created (org + full snapshot) inside the unit of work", async () => {
    const { svc, appended } = build();
    await svc.grant("org-1", { studentId: "s1", courseId: "c1", expiresAt: null });
    expect(appended).toEqual([{ type: "enrollment.created", orgId: "org-1", enrollment: SAMPLE }]);
  });

  it("sets status (revoke/reactivate) via the tx-bound repository", async () => {
    const { svc, repo } = build();
    await svc.setStatus("org-1", "e1", "revoked");
    expect(repo.setStatus).toHaveBeenCalledWith("org-1", "e1", "revoked");
  });

  it("appends enrollment.deleted on revoke", async () => {
    const { svc, appended } = build();
    await svc.setStatus("org-1", "e1", "revoked");
    expect(appended).toEqual([{ type: "enrollment.deleted", orgId: "org-1", enrollment: SAMPLE }]);
  });

  it("appends enrollment.updated on reactivation", async () => {
    const { svc, appended } = build();
    await svc.setStatus("org-1", "e1", "active");
    expect(appended).toEqual([{ type: "enrollment.updated", orgId: "org-1", enrollment: SAMPLE }]);
  });

  it("appends nothing when setStatus finds no entitlement", async () => {
    const { svc, append } = build(fakeRepo({ setStatus: vi.fn().mockResolvedValue(null) }));
    const result = await svc.setStatus("org-1", "missing", "revoked");
    expect(result).toBeNull();
    expect(append).not.toHaveBeenCalled();
  });

  it("does not append when the write fails — the error propagates out of run", async () => {
    const { svc, append } = build(fakeRepo({ insert: vi.fn().mockRejectedValue(new Error("boom")) }));
    await expect(
      svc.grant("org-1", { studentId: "s1", courseId: "c1", expiresAt: null }),
    ).rejects.toThrow("boom");
    expect(append).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @headless-lms/server exec vitest run src/core/entitlements/service.test.ts`
Expected: FAIL — the service still calls `this.events.publish` (`this.uow.run is not a function` / `publish` of undefined).

- [ ] **Step 3: Rewrite the service** — replace the whole of `packages/server/src/core/entitlements/service.ts` with:

```ts
// entitlements context — service implementation (inbound port).
//
// Mutations run inside the context's UnitOfWork: the domain write and the
// outbox append commit in ONE transaction (transactional outbox). This
// service never publishes — the outbox relay dispatches committed events to
// EventBus subscribers at-least-once.
import type { Entitlement, EntitlementsQuery, GrantEntitlementInput, Page } from "./model.js";
import type {
  EntitlementsRepository,
  EntitlementsService,
  EntitlementsUnitOfWork,
} from "./ports.js";

export class EntitlementsServiceImpl implements EntitlementsService {
  constructor(
    /** Read-only access (list) — runs outside any transaction. */
    private readonly repo: EntitlementsRepository,
    /** Atomic write scope: tx-bound repo + outbox appender. */
    private readonly uow: EntitlementsUnitOfWork,
  ) {}

  list(orgId: string, query: EntitlementsQuery): Promise<Page<Entitlement>> {
    return this.repo.list(orgId, query);
  }

  // Re-granting an existing enrollment (the repo upserts) also emits created.
  grant(orgId: string, input: GrantEntitlementInput): Promise<Entitlement> {
    return this.uow.run(async ({ entitlements, outbox }) => {
      const enrollment = await entitlements.insert(orgId, input);
      await outbox.append([{ type: "enrollment.created", orgId, enrollment }]);
      return enrollment;
    });
  }

  setStatus(
    orgId: string,
    id: string,
    status: "active" | "revoked",
  ): Promise<Entitlement | null> {
    return this.uow.run(async ({ entitlements, outbox }) => {
      const enrollment = await entitlements.setStatus(orgId, id, status);
      if (!enrollment) return null;
      await outbox.append([
        status === "revoked"
          ? { type: "enrollment.deleted", orgId, enrollment }
          : { type: "enrollment.updated", orgId, enrollment },
      ]);
      return enrollment;
    });
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @headless-lms/server exec vitest run src/core/entitlements/service.test.ts`
Expected: PASS (8 tests). Note: `pnpm --filter @headless-lms/server typecheck` now errors in `composition/container.ts:120` (`TS2554`, service takes 2 args) — expected; Task 7 closes it. The Task-1 errors in this file are gone.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/core/entitlements/service.ts packages/server/src/core/entitlements/service.test.ts
git commit -m "refactor(entitlements): mutations through unit of work + outbox append"
```

---

### Task 6: Migrate the integrations service (fold credential+connection+outbox atomicity)

**Files:**
- Modify: `packages/server/src/core/integrations/service.ts`
- Test (rewrite fakes + event assertions): `packages/server/src/core/integrations/service.test.ts`

**Interfaces:**
- Consumes: `IntegrationsUnitOfWork`/`IntegrationsTxScope` (Task 2).
- Produces: `IntegrationsServiceImpl` constructor is now `(registry: IntegrationsRegistry, repo: ConnectionsRepository, uow: IntegrationsUnitOfWork, now: () => string)` — Task 7 wires exactly this. connect/reconnect/configure/disconnect each run one `uow.run` containing every write + the append.

- [ ] **Step 1: Rewrite the test file (failing test)** — replace the whole of `packages/server/src/core/integrations/service.test.ts` with:

```ts
import { describe, it, expect, vi } from "vitest";
import { IntegrationsServiceImpl } from "./service.js";
import { createIntegrationsRegistry } from "./registry.js";
import {
  AlreadyConnectedError,
  InvalidConfigError,
  UnknownIntegrationError,
} from "./model.js";
import type { Connection } from "./model.js";
import type { ConnectionsRepository, Integration, IntegrationsUnitOfWork } from "./ports.js";
import type { CredentialStore, NewDomainEvent } from "../shared/ports.js";

// Inline integrations — the real ones (adapters/integrations/*) are adapter
// concerns; the core service only needs modules satisfying the port.
const stripe: Integration = {
  id: "stripe",
  configSchema: () => ({ type: "object", properties: { mode: { enum: ["live", "test"] } } }),
  secretsSchema: () => ({ type: "object", required: ["apiKey"] }),
  actions: [],
  validateConfig: (config) => {
    const mode = (config as Record<string, unknown>)?.mode;
    return mode === undefined || mode === "live" || mode === "test"
      ? { ok: true }
      : { ok: false, errors: ["mode: invalid"] };
  },
};
const slack: Integration = {
  id: "slack",
  configSchema: () => ({ type: "object" }),
  secretsSchema: () => ({ type: "object", required: ["botToken"] }),
  validateConfig: () => ({ ok: true }),
  actions: [
    {
      id: "postMessageToChannel",
      description: "Post a message to a channel.",
      inputSchema: () => ({ type: "object" }),
      outputSchema: () => ({ type: "object" }),
      invoke: async () => ({}),
    },
  ],
};

const SAMPLE: Connection = {
  id: "con_1",
  integrationId: "stripe",
  config: { mode: "test" },
  active: true,
  credentialRef: "crd_1",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const registry = createIntegrationsRegistry([stripe, slack]);

function fakeRepo(over?: Partial<ConnectionsRepository>): ConnectionsRepository {
  return {
    insert: vi.fn().mockImplementation((_org, c) => Promise.resolve(c)),
    findById: vi.fn().mockResolvedValue(SAMPLE),
    findByIntegration: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([SAMPLE]),
    update: vi.fn().mockResolvedValue(SAMPLE),
    delete: vi.fn().mockResolvedValue(true),
    ...over,
  };
}

function fakeCredentials(over?: Partial<CredentialStore>): CredentialStore {
  return {
    store: vi.fn().mockResolvedValue("crd_1"),
    reveal: vi.fn().mockResolvedValue({ apiKey: "sk_live_x" }),
    update: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

/** Pass-through unit of work over the same fakes the service reads with —
 *  the scope's tx-bound repos ARE the fakes, plus a capturing appender. */
function build(repo = fakeRepo(), credentials = fakeCredentials()) {
  const appended: NewDomainEvent[] = [];
  const append = vi.fn(async (events: NewDomainEvent[]) => {
    appended.push(...events);
  });
  const uow: IntegrationsUnitOfWork = {
    run: (fn) => fn({ connections: repo, credentials, outbox: { append } }),
  };
  const svc = new IntegrationsServiceImpl(registry, repo, uow, () => "2026-01-02T00:00:00Z");
  return { svc, repo, credentials, append, appended };
}

describe("IntegrationsRegistry", () => {
  it("resolves declared integrations and rejects duplicates", () => {
    expect(registry.get("stripe")?.id).toBe("stripe");
    expect(registry.get("strope")).toBeNull();
    expect(registry.list().map((i) => i.id)).toEqual(["stripe", "slack"]);
    expect(() => createIntegrationsRegistry([stripe, stripe])).toThrow(/duplicate/);
  });
});

describe("IntegrationsService", () => {
  it("available exposes each declared integration's id, config schema, and actions", () => {
    const { svc } = build();
    const available = svc.available();
    expect(available.map((a) => a.id)).toEqual(["stripe", "slack"]);
    expect(available[0]?.configSchema).toHaveProperty("type", "object");
    expect(available[0]?.secretsSchema).toHaveProperty("required", ["apiKey"]);
    expect(available[0]?.actions).toEqual([]);
    expect(available[1]?.actions).toEqual([
      {
        id: "postMessageToChannel",
        description: "Post a message to a channel.",
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
      },
    ]);
  });

  it("connect stores the credential, inserts the connection, appends created — one scope", async () => {
    const { svc, repo, credentials, appended } = build();
    const conn = await svc.connect("org-1", {
      integrationId: "stripe",
      secrets: { apiKey: "sk_live_x" },
      config: { mode: "live" },
    });
    expect(credentials.store).toHaveBeenCalledWith("org-1", { apiKey: "sk_live_x" });
    expect(conn.credentialRef).toBe("crd_1");
    expect(conn.active).toBe(true);
    expect(repo.insert).toHaveBeenCalled();
    expect(appended).toEqual([
      expect.objectContaining({ type: "connection.created", orgId: "org-1", integrationId: "stripe" }),
    ]);
  });

  it("connect rejects an undeclared integration id", async () => {
    const { svc, credentials } = build();
    await expect(
      svc.connect("org-1", { integrationId: "strope", secrets: { apiKey: "x" } }),
    ).rejects.toThrow(UnknownIntegrationError);
    expect(credentials.store).not.toHaveBeenCalled();
  });

  it("connect rejects config the integration's validator refuses", async () => {
    const { svc, credentials } = build();
    await expect(
      svc.connect("org-1", {
        integrationId: "stripe",
        secrets: { apiKey: "x" },
        config: { mode: "sandbox" },
      }),
    ).rejects.toThrow(InvalidConfigError);
    expect(credentials.store).not.toHaveBeenCalled();
  });

  it("connect rejects a second connection for the same integration", async () => {
    const { svc, credentials } = build(
      fakeRepo({ findByIntegration: vi.fn().mockResolvedValue(SAMPLE) }),
    );
    await expect(
      svc.connect("org-1", { integrationId: "stripe", secrets: { apiKey: "x" } }),
    ).rejects.toThrow(AlreadyConnectedError);
    expect(credentials.store).not.toHaveBeenCalled();
  });

  it("connect appends nothing when the credential write fails (atomic scope aborts)", async () => {
    const { svc, repo, append } = build(
      fakeRepo(),
      fakeCredentials({ store: vi.fn().mockRejectedValue(new Error("crypto down")) }),
    );
    await expect(
      svc.connect("org-1", { integrationId: "stripe", secrets: { apiKey: "x" } }),
    ).rejects.toThrow("crypto down");
    expect(repo.insert).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it("reconnect replaces the secrets in place (same ref), appends updated", async () => {
    const { svc, credentials, appended } = build();
    await svc.reconnect("org-1", "con_1", { apiKey: "sk_live_new" });
    expect(credentials.update).toHaveBeenCalledWith("org-1", "crd_1", { apiKey: "sk_live_new" });
    expect(appended).toEqual([
      expect.objectContaining({ type: "connection.updated", changed: "credentials" }),
    ]);
  });

  it("configure validates the new config against the connection's integration", async () => {
    const { svc } = build();
    await expect(svc.configure("org-1", "con_1", { config: { mode: "nope" } })).rejects.toThrow(
      InvalidConfigError,
    );
  });

  it("configure patches config/active, appends updated", async () => {
    const { svc, repo, appended } = build();
    await svc.configure("org-1", "con_1", { active: false });
    expect(repo.update).toHaveBeenCalledWith("org-1", "con_1", {
      active: false,
      updatedAt: "2026-01-02T00:00:00Z",
    });
    expect(appended).toEqual([
      expect.objectContaining({ type: "connection.updated", changed: "configuration" }),
    ]);
  });

  it("disconnect destroys the credential and the connection, appends removed", async () => {
    const { svc, repo, credentials, appended } = build();
    const ok = await svc.disconnect("org-1", "con_1");
    expect(ok).toBe(true);
    expect(credentials.destroy).toHaveBeenCalledWith("org-1", "crd_1");
    expect(repo.delete).toHaveBeenCalledWith("org-1", "con_1");
    // The connection row holds an FK onto the credential row — it must go first.
    const deleteOrder = (repo.delete as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!;
    const destroyOrder = (credentials.destroy as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0]!;
    expect(deleteOrder).toBeLessThan(destroyOrder);
    expect(appended).toEqual([expect.objectContaining({ type: "connection.removed" })]);
  });

  it("reconnect/disconnect return null/false for an unknown connection", async () => {
    const { svc, credentials, append } = build(
      fakeRepo({ findById: vi.fn().mockResolvedValue(null) }),
    );
    expect(await svc.reconnect("org-1", "nope", { apiKey: "x" })).toBeNull();
    expect(await svc.disconnect("org-1", "nope")).toBe(false);
    expect(credentials.update).not.toHaveBeenCalled();
    expect(credentials.destroy).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it("getByIntegration resolves a consumer's connection", async () => {
    const repo = fakeRepo({ findByIntegration: vi.fn().mockResolvedValue(SAMPLE) });
    const { svc } = build(repo);
    const conn = await svc.getByIntegration("org-1", "stripe");
    expect(conn?.credentialRef).toBe("crd_1");
    expect(repo.findByIntegration).toHaveBeenCalledWith("org-1", "stripe");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @headless-lms/server exec vitest run src/core/integrations/service.test.ts`
Expected: FAIL — service still expects `(registry, repo, credentials, events, now)`; the mutation tests blow up on `this.events.publish`.

- [ ] **Step 3: Rewrite the service** — replace the whole of `packages/server/src/core/integrations/service.ts` with:

```ts
// integrations context — service implementation (inbound port). Owns the
// connection lifecycle; credentials live in the shared secure credential store
// (this service holds only the ref). The integrations the system supports are
// declared at startup via the IntegrationsRegistry: connect/configure reject
// unknown integration ids and validate config with the integration's own
// validator. The domain never calls the external service — consumers take the
// connection, reveal the credential at point of use, and build their own adapter.
//
// Mutations run inside the context's UnitOfWork: credential writes, connection
// writes, and the outbox append commit in ONE transaction (transactional
// outbox; this also closed the historical orphan-credential window). The
// outbox relay — not this service — publishes to EventBus subscribers.
import { genId } from "../shared/id.js";
import { AlreadyConnectedError, InvalidConfigError, UnknownIntegrationError } from "./model.js";
import type { ConfigureInput, ConnectInput, Connection } from "./model.js";
import type {
  ConnectionsRepository,
  IntegrationsRegistry,
  IntegrationsService,
  IntegrationsUnitOfWork,
} from "./ports.js";

export class IntegrationsServiceImpl implements IntegrationsService {
  constructor(
    private readonly registry: IntegrationsRegistry,
    /** Read-only access (find/list) — runs outside any transaction. */
    private readonly repo: ConnectionsRepository,
    /** Atomic write scope: tx-bound connections repo + credential store + outbox. */
    private readonly uow: IntegrationsUnitOfWork,
    private readonly now: () => string,
  ) {}

  available() {
    return this.registry.list().map((integration) => ({
      id: integration.id,
      configSchema: integration.configSchema(),
      secretsSchema: integration.secretsSchema(),
      actions: integration.actions.map((action) => ({
        id: action.id,
        description: action.description,
        inputSchema: action.inputSchema(),
        outputSchema: action.outputSchema(),
      })),
    }));
  }

  private validate(integrationId: string, config: Record<string, unknown>): void {
    const integration = this.registry.get(integrationId);
    if (!integration) throw new UnknownIntegrationError(integrationId);
    const result = integration.validateConfig(config);
    if (!result.ok) throw new InvalidConfigError(integrationId, result.errors);
  }

  async connect(orgId: string, input: ConnectInput): Promise<Connection> {
    const config = input.config ?? {};
    this.validate(input.integrationId, config);
    const existing = await this.repo.findByIntegration(orgId, input.integrationId);
    if (existing) throw new AlreadyConnectedError(input.integrationId);
    return this.uow.run(async ({ connections, credentials, outbox }) => {
      const credentialRef = await credentials.store(orgId, input.secrets);
      const at = this.now();
      const connection = await connections.insert(orgId, {
        id: genId("connection"),
        integrationId: input.integrationId,
        config,
        active: true,
        credentialRef,
        createdAt: at,
        updatedAt: at,
      });
      await outbox.append([
        {
          type: "connection.created",
          orgId,
          connectionId: connection.id,
          integrationId: connection.integrationId,
        },
      ]);
      return connection;
    });
  }

  async reconnect(
    orgId: string,
    id: string,
    secrets: Record<string, unknown>,
  ): Promise<Connection | null> {
    const connection = await this.repo.findById(orgId, id);
    if (!connection) return null;
    return this.uow.run(async ({ connections, credentials, outbox }) => {
      await credentials.update(orgId, connection.credentialRef, secrets);
      const updated = await connections.update(orgId, id, { updatedAt: this.now() });
      await outbox.append([
        {
          type: "connection.updated",
          orgId,
          connectionId: id,
          integrationId: connection.integrationId,
          changed: "credentials",
        },
      ]);
      return updated;
    });
  }

  async configure(orgId: string, id: string, input: ConfigureInput): Promise<Connection | null> {
    const connection = await this.repo.findById(orgId, id);
    if (!connection) return null;
    if (input.config !== undefined) this.validate(connection.integrationId, input.config);
    return this.uow.run(async ({ connections, outbox }) => {
      const updated = await connections.update(orgId, id, {
        ...(input.config !== undefined ? { config: input.config } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        updatedAt: this.now(),
      });
      await outbox.append([
        {
          type: "connection.updated",
          orgId,
          connectionId: id,
          integrationId: connection.integrationId,
          changed: "configuration",
        },
      ]);
      return updated;
    });
  }

  async disconnect(orgId: string, id: string): Promise<boolean> {
    const connection = await this.repo.findById(orgId, id);
    if (!connection) return false;
    return this.uow.run(async ({ connections, credentials, outbox }) => {
      // Connection first: it holds the FK onto the credential row.
      const deleted = await connections.delete(orgId, id);
      await credentials.destroy(orgId, connection.credentialRef);
      await outbox.append([
        {
          type: "connection.removed",
          orgId,
          connectionId: id,
          integrationId: connection.integrationId,
        },
      ]);
      return deleted;
    });
  }

  list(orgId: string): Promise<Connection[]> {
    return this.repo.list(orgId);
  }

  get(orgId: string, id: string): Promise<Connection | null> {
    return this.repo.findById(orgId, id);
  }

  getByIntegration(orgId: string, integrationId: string): Promise<Connection | null> {
    return this.repo.findByIntegration(orgId, integrationId);
  }
}
```

(The `ConnectionCreated`/`ConnectionUpdated`/`ConnectionRemoved` type imports and the `CredentialStore`/`EventBus` import are gone — the generic `append` accepts the literals; the `changed`/id fields are still type-checked structurally against the appended literals at the call sites, and end-to-end by the tests.)

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @headless-lms/server exec vitest run src/core/integrations/service.test.ts`
Expected: PASS (14 tests). Typecheck now shows only the two container arity errors (`container.ts:120` and `container.ts:141-147`).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/core/integrations/service.ts packages/server/src/core/integrations/service.test.ts
git commit -m "refactor(integrations): atomic connect/reconnect/configure/disconnect via unit of work"
```

---

### Task 7: Container wiring — UoW per context, EventBus out of the services (typecheck goes green)

**Files:**
- Modify: `packages/server/src/composition/container.ts`

**Interfaces:**
- Consumes: `DrizzleUnitOfWork` (Task 4), new service constructors (Tasks 5–6).
- Produces: a container whose entitlements/integrations services are UoW-wired; **no `EventBus` anywhere in composition** (it returns in Task 9 as the relay's fan-out). Gate: FULL typecheck/test/lint green — this task closes the red window.

- [ ] **Step 1: Failing check** — Run: `pnpm --filter @headless-lms/server typecheck`
Expected: FAIL with exactly the two container arity errors (lines ~120 and ~141). This is the "failing test" for a pure-wiring task.

- [ ] **Step 2: Rewire the container** — in `packages/server/src/composition/container.ts`:

Remove the line `import { InMemoryEventBus } from "../adapters/events/index.js";` and add below the `createDb` import:

```ts
import { DrizzleUnitOfWork } from "../adapters/db/unit-of-work.js";
```

Remove `const eventBus = new InMemoryEventBus();` from the adapter block (nothing consumes it until the relay lands in Task 9).

Replace the entitlements wiring line

```ts
  const entitlements = new EntitlementsServiceImpl(new DrizzleEntitlementsRepository(db), eventBus);
```

with:

```ts
  // Entitlements: reads on the root db; writes + outbox append in one tx.
  const entitlementsUow = new DrizzleUnitOfWork(db, (tx) => ({
    entitlements: new DrizzleEntitlementsRepository(tx),
  }));
  const entitlements = new EntitlementsServiceImpl(
    new DrizzleEntitlementsRepository(db),
    entitlementsUow,
  );
```

Replace the integrations wiring

```ts
  const integrations = new IntegrationsServiceImpl(
    integrationsRegistry,
    new DrizzleConnectionsRepository(db),
    credentialStore,
    eventBus,
    () => new Date().toISOString(),
  );
```

with:

```ts
  // Integrations: credential + connection writes + outbox append in one tx
  // (a tx-bound credential store instance shares the scope's transaction).
  const integrationsUow = new DrizzleUnitOfWork(db, (tx) => ({
    connections: new DrizzleConnectionsRepository(tx),
    credentials: new DrizzleCredentialStore(tx, config.credentialStoreKey),
  }));
  const integrations = new IntegrationsServiceImpl(
    integrationsRegistry,
    new DrizzleConnectionsRepository(db),
    integrationsUow,
    () => new Date().toISOString(),
  );
```

(The root-db `credentialStore` singleton stays — it still backs `container.credentials` for point-of-use `reveal` by consumers.)

- [ ] **Step 3: Verify — full green gate**

Run: `pnpm --filter @headless-lms/server typecheck && pnpm --filter @headless-lms/server test && pnpm --filter @headless-lms/server lint`
Expected: ALL PASS — zero typecheck errors anywhere (red window closed), full suite green, boundary lint green.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/composition/container.ts
git commit -m "refactor(composition): wire per-context units of work; drop EventBus from services"
```

---

### Task 8: `PollingOutboxRelay` adapter

**Files:**
- Create: `packages/server/src/adapters/events/outbox-relay.ts`
- Test: `packages/server/src/adapters/events/outbox-relay.test.ts`

**Interfaces:**
- Consumes: `OutboxStore`, `OutboxMessage`, `OutboxRelay`, `EventBus`, `Logger` ports (Task 2); `InMemoryEventBus` (unchanged, the fan-out).
- Produces: `interface PollingOutboxRelayConfig { enabled: boolean; pollIntervalMs: number; batchSize: number; maxAttempts: number; backoffBaseMs: number; backoffMaxMs: number; retentionDays: number; cleanupIntervalMs: number }`; `class PollingOutboxRelay implements OutboxRelay` with ctor `(store: OutboxStore, bus: EventBus, config: PollingOutboxRelayConfig, logger: Logger)`. Task 9 constructs exactly this.

- [ ] **Step 1: Write the failing tests** — create `packages/server/src/adapters/events/outbox-relay.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PollingOutboxRelay, type PollingOutboxRelayConfig } from "./outbox-relay.js";
import { InMemoryEventBus } from "./index.js";
import type { Logger, OutboxMessage, OutboxStore } from "../../core/shared/ports.js";

const CONFIG: PollingOutboxRelayConfig = {
  enabled: true,
  pollIntervalMs: 1000,
  batchSize: 10,
  maxAttempts: 10,
  backoffBaseMs: 1000,
  backoffMaxMs: 60_000,
  retentionDays: 7,
  cleanupIntervalMs: 3_600_000,
};

function message(id: number, over?: { type?: string; attempts?: number }): OutboxMessage {
  const type = over?.type ?? "enrollment.created";
  return {
    id: String(id),
    eventId: `evt_${id}`,
    type,
    payload: { type, id: `evt_${id}`, occurredAt: "2026-07-22T00:00:00.000Z" },
    attempts: over?.attempts ?? 0,
  };
}

/** Sequential batches: call N of fetchBatch returns batches[N-1] (then []). */
function fakeStore(batches: OutboxMessage[][]): OutboxStore {
  let call = 0;
  return {
    fetchBatch: vi.fn(async () => batches[call++] ?? []),
    markPublished: vi.fn(async () => {}),
    markFailed: vi.fn(async () => {}),
    deletePublishedBefore: vi.fn(async () => 0),
  };
}

function fakeLogger(): Logger {
  return { info: vi.fn(), error: vi.fn() };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T12:00:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("PollingOutboxRelay", () => {
  it("dispatches each message to bus subscribers and marks it published", async () => {
    const store = fakeStore([[message(1)]]);
    const bus = new InMemoryEventBus();
    const seen: string[] = [];
    bus.subscribe("enrollment.created", async (e) => {
      seen.push(e.id);
    });
    const relay = new PollingOutboxRelay(store, bus, CONFIG, fakeLogger());
    relay.start();
    await vi.advanceTimersByTimeAsync(CONFIG.pollIntervalMs);
    expect(seen).toEqual(["evt_1"]);
    expect(store.markPublished).toHaveBeenCalledWith("1");
    await relay.stop();
  });

  it("dispatches in commit (id) order within a batch", async () => {
    const order: string[] = [];
    const store = fakeStore([[message(1), message(2), message(3)]]);
    const bus = new InMemoryEventBus();
    bus.subscribe("enrollment.created", async (e) => {
      order.push(e.id);
    });
    const relay = new PollingOutboxRelay(store, bus, CONFIG, fakeLogger());
    relay.start();
    await vi.advanceTimersByTimeAsync(CONFIG.pollIntervalMs);
    expect(order).toEqual(["evt_1", "evt_2", "evt_3"]);
    await relay.stop();
  });

  it("marks a failing message failed with exponential backoff and keeps dispatching the rest", async () => {
    const store = fakeStore([[message(1, { type: "boom.event", attempts: 2 }), message(2)]]);
    const bus = new InMemoryEventBus();
    bus.subscribe("boom.event", async () => {
      throw new Error("handler blew up");
    });
    const logger = fakeLogger();
    const relay = new PollingOutboxRelay(store, bus, CONFIG, logger);
    relay.start();
    await vi.advanceTimersByTimeAsync(CONFIG.pollIntervalMs);
    // attempts=2 → delay = 1000 * 2^2 = 4000ms from now
    expect(store.markFailed).toHaveBeenCalledWith(
      "1",
      expect.stringContaining("handler blew up"),
      new Date(Date.now() + 4000),
    );
    expect(store.markPublished).toHaveBeenCalledTimes(1);
    expect(store.markPublished).toHaveBeenCalledWith("2");
    expect(logger.error).toHaveBeenCalledWith(
      "outbox dispatch failed",
      expect.objectContaining({ id: "1", attempts: 3 }),
    );
    await relay.stop();
  });

  it("caps the backoff at backoffMaxMs", async () => {
    const store = fakeStore([[message(1, { type: "boom.event", attempts: 8 })]]);
    const bus = new InMemoryEventBus();
    bus.subscribe("boom.event", async () => {
      throw new Error("still broken");
    });
    const relay = new PollingOutboxRelay(store, bus, CONFIG, fakeLogger());
    relay.start();
    await vi.advanceTimersByTimeAsync(CONFIG.pollIntervalMs);
    // 1000 * 2^8 = 256000 → capped at 60000
    expect(store.markFailed).toHaveBeenCalledWith(
      "1",
      expect.any(String),
      new Date(Date.now() + CONFIG.backoffMaxMs),
    );
    await relay.stop();
  });

  it("logs a parked dead letter when a failure reaches maxAttempts", async () => {
    const store = fakeStore([[message(1, { type: "boom.event", attempts: 9 })]]);
    const bus = new InMemoryEventBus();
    bus.subscribe("boom.event", async () => {
      throw new Error("poison");
    });
    const logger = fakeLogger();
    const relay = new PollingOutboxRelay(store, bus, CONFIG, logger);
    relay.start();
    await vi.advanceTimersByTimeAsync(CONFIG.pollIntervalMs);
    expect(store.markFailed).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      "outbox message parked: max attempts reached",
      expect.objectContaining({ id: "1", eventId: "evt_1", type: "boom.event", attempts: 10 }),
    );
    await relay.stop();
  });

  it("re-polls immediately while batches come back full", async () => {
    const config = { ...CONFIG, batchSize: 1 };
    const store = fakeStore([[message(1)], [message(2)], []]);
    const relay = new PollingOutboxRelay(store, new InMemoryEventBus(), config, fakeLogger());
    relay.start();
    await vi.advanceTimersByTimeAsync(CONFIG.pollIntervalMs);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.fetchBatch).toHaveBeenCalledTimes(3);
    expect(store.markPublished).toHaveBeenCalledTimes(2);
    await relay.stop();
  });

  it("stops cleanly: no polls after stop()", async () => {
    const store = fakeStore([[]]);
    const relay = new PollingOutboxRelay(store, new InMemoryEventBus(), CONFIG, fakeLogger());
    relay.start();
    await vi.advanceTimersByTimeAsync(CONFIG.pollIntervalMs);
    expect(store.fetchBatch).toHaveBeenCalledTimes(1);
    await relay.stop();
    await vi.advanceTimersByTimeAsync(CONFIG.pollIntervalMs * 5);
    expect(store.fetchBatch).toHaveBeenCalledTimes(1);
  });

  it("stop() before start() resolves (gen-openapi closes a never-started relay)", async () => {
    const relay = new PollingOutboxRelay(
      fakeStore([]),
      new InMemoryEventBus(),
      CONFIG,
      fakeLogger(),
    );
    await expect(relay.stop()).resolves.toBeUndefined();
  });

  it("start() is a no-op when disabled", async () => {
    const store = fakeStore([[message(1)]]);
    const relay = new PollingOutboxRelay(
      store,
      new InMemoryEventBus(),
      { ...CONFIG, enabled: false },
      fakeLogger(),
    );
    relay.start();
    await vi.advanceTimersByTimeAsync(CONFIG.pollIntervalMs * 3);
    expect(store.fetchBatch).not.toHaveBeenCalled();
    await relay.stop();
  });

  it("a second start() does not double the polling loop", async () => {
    const store = fakeStore([[]]);
    const relay = new PollingOutboxRelay(store, new InMemoryEventBus(), CONFIG, fakeLogger());
    relay.start();
    relay.start();
    await vi.advanceTimersByTimeAsync(CONFIG.pollIntervalMs);
    expect(store.fetchBatch).toHaveBeenCalledTimes(1);
    await relay.stop();
  });

  it("sweeps published rows older than the retention window on the cleanup cadence", async () => {
    const store = fakeStore([]);
    const relay = new PollingOutboxRelay(store, new InMemoryEventBus(), CONFIG, fakeLogger());
    relay.start();
    await vi.advanceTimersByTimeAsync(CONFIG.cleanupIntervalMs);
    expect(store.deletePublishedBefore).toHaveBeenCalledWith(
      new Date(Date.now() - CONFIG.retentionDays * 86_400_000),
    );
    await relay.stop();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @headless-lms/server exec vitest run src/adapters/events/outbox-relay.test.ts`
Expected: FAIL — `Cannot find module './outbox-relay.js'`.

- [ ] **Step 3: Implement the relay** — create `packages/server/src/adapters/events/outbox-relay.ts`:

```ts
// Same-process outbox relay (implements the core OutboxRelay port). A
// setTimeout-CHAINED poller (never setInterval for the poll — a slow batch
// must not overlap the next tick): each tick fetches due unpublished rows in
// commit order and publishes them to the EventBus (fan-out to subscribers).
//
// Delivery is at-least-once — handlers must be idempotent, keyed on event.id.
// Ordering is skip-past-failures: a failing row is backed off (capped
// exponential) and retried while later rows flow; after maxAttempts it is
// parked (published_at NULL, excluded from fetch by the store) and logged —
// the log-only dead letter. Re-drive manually:
//   UPDATE outbox SET attempts = 0 WHERE id = <id>;
// A separate interval sweeps published rows past the retention window.
import type {
  EventBus,
  Logger,
  OutboxMessage,
  OutboxRelay,
  OutboxStore,
} from "../../core/shared/ports.js";

export interface PollingOutboxRelayConfig {
  /** Master switch: false → start() is a no-op. */
  enabled: boolean;
  /** Idle delay between polls. */
  pollIntervalMs: number;
  /** Max rows fetched/dispatched per tick; a full batch re-polls immediately. */
  batchSize: number;
  /** Attempts before a message is parked as a dead letter. */
  maxAttempts: number;
  /** Backoff = min(backoffBaseMs * 2^attempts, backoffMaxMs). */
  backoffBaseMs: number;
  backoffMaxMs: number;
  /** Published rows older than this many days are swept. */
  retentionDays: number;
  /** Sweep cadence. */
  cleanupIntervalMs: number;
}

const DAY_MS = 86_400_000;

export class PollingOutboxRelay implements OutboxRelay {
  private pollTimer: NodeJS.Timeout | undefined;
  private cleanupTimer: NodeJS.Timeout | undefined;
  private running = false;
  private inFlight: Promise<void> = Promise.resolve();
  private sweepInFlight: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: OutboxStore,
    private readonly bus: EventBus,
    private readonly config: PollingOutboxRelayConfig,
    private readonly logger: Logger,
  ) {}

  start(): void {
    if (!this.config.enabled || this.running) return;
    this.running = true;
    this.schedule(this.config.pollIntervalMs);
    this.cleanupTimer = setInterval(() => {
      this.sweepInFlight = this.sweep();
    }, this.config.cleanupIntervalMs);
    this.logger.info("outbox relay started", {
      pollIntervalMs: this.config.pollIntervalMs,
      batchSize: this.config.batchSize,
    });
  }

  async stop(): Promise<void> {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.pollTimer = undefined;
    this.cleanupTimer = undefined;
    const wasRunning = this.running;
    this.running = false;
    await this.inFlight;
    await this.sweepInFlight;
    if (wasRunning) this.logger.info("outbox relay stopped");
  }

  private schedule(delayMs: number): void {
    if (!this.running) return;
    this.pollTimer = setTimeout(() => {
      this.inFlight = this.tick();
    }, delayMs);
  }

  /** One poll: fetch a batch, dispatch in commit order, reschedule —
   *  immediately when the batch was full (drain bursts), else after the idle
   *  interval. Never throws: a poll failure is logged and retried next tick. */
  private async tick(): Promise<void> {
    let fetched = 0;
    try {
      const batch = await this.store.fetchBatch(this.config.batchSize);
      fetched = batch.length;
      for (const message of batch) {
        await this.dispatch(message);
      }
    } catch (err) {
      this.logger.error("outbox poll failed", { error: String(err) });
    }
    this.schedule(fetched >= this.config.batchSize ? 0 : this.config.pollIntervalMs);
  }

  /** Publish one message to all subscribers; on failure, back off and skip
   *  past (the rest of the batch still dispatches). The outbox row is the
   *  retry unit: a retried event re-runs EVERY handler for it. */
  private async dispatch(message: OutboxMessage): Promise<void> {
    try {
      await this.bus.publish(message.payload);
      await this.store.markPublished(message.id);
    } catch (err) {
      const attempts = message.attempts + 1;
      const delayMs = Math.min(
        this.config.backoffBaseMs * 2 ** message.attempts,
        this.config.backoffMaxMs,
      );
      await this.store.markFailed(message.id, String(err), new Date(Date.now() + delayMs));
      if (attempts >= this.config.maxAttempts) {
        this.logger.error("outbox message parked: max attempts reached", {
          id: message.id,
          eventId: message.eventId,
          type: message.type,
          attempts,
        });
      } else {
        this.logger.error("outbox dispatch failed", {
          id: message.id,
          eventId: message.eventId,
          type: message.type,
          attempts,
          retryInMs: delayMs,
        });
      }
    }
  }

  private async sweep(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - this.config.retentionDays * DAY_MS);
      const deleted = await this.store.deletePublishedBefore(cutoff);
      if (deleted > 0) this.logger.info("outbox retention sweep", { deleted });
    } catch (err) {
      this.logger.error("outbox retention sweep failed", { error: String(err) });
    }
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @headless-lms/server exec vitest run src/adapters/events/outbox-relay.test.ts`
Expected: PASS (11 tests). Then `pnpm --filter @headless-lms/server typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/adapters/events/outbox-relay.ts packages/server/src/adapters/events/outbox-relay.test.ts
git commit -m "feat(events): polling outbox relay with backoff, parking, retention sweep"
```

---

### Task 9: Config block + env mapping + lifecycle (relay wired, started after listen, stopped on close)

**Files:**
- Modify: `packages/server/src/composition/container.ts` (OutboxConfig + defaults + store/relay wiring + `outboxRelay` on `Container`)
- Test: `packages/server/src/composition/container.test.ts` (create)
- Modify: `packages/server/src/http/server.ts` (onClose stop)
- Modify: `apps/api/src/config.ts` (env mapping)
- Modify: `apps/api/src/main.ts` (explicit start after listen)

**Interfaces:**
- Consumes: `DrizzleOutboxStore` (Task 4), `PollingOutboxRelay`/`PollingOutboxRelayConfig` (Task 8), `InMemoryEventBus` (returns as the relay's fan-out), `OutboxRelay`/`Logger` ports (Task 2).
- Produces: `Config.outbox?: OutboxConfig` (all-optional), `OUTBOX_DEFAULTS`, `resolveOutboxConfig(config?: OutboxConfig): PollingOutboxRelayConfig`, `Container.outboxRelay: OutboxRelay`. Env vars: `OUTBOX_ENABLED`, `OUTBOX_POLL_INTERVAL_MS`, `OUTBOX_BATCH_SIZE`, `OUTBOX_MAX_ATTEMPTS`, `OUTBOX_BACKOFF_BASE_MS`, `OUTBOX_BACKOFF_MAX_MS`, `OUTBOX_RETENTION_DAYS`, `OUTBOX_CLEANUP_INTERVAL_MS`.

- [ ] **Step 1: Write the failing config test** — create `packages/server/src/composition/container.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { OUTBOX_DEFAULTS, resolveOutboxConfig } from "./container.js";

describe("resolveOutboxConfig", () => {
  it("returns the spec defaults when no config is given", () => {
    expect(resolveOutboxConfig()).toEqual({
      enabled: true,
      pollIntervalMs: 1000,
      batchSize: 100,
      maxAttempts: 10,
      backoffBaseMs: 1000,
      backoffMaxMs: 60_000,
      retentionDays: 7,
      cleanupIntervalMs: 3_600_000,
    });
    expect(resolveOutboxConfig()).toEqual(OUTBOX_DEFAULTS);
  });

  it("merges partial overrides over the defaults", () => {
    const resolved = resolveOutboxConfig({ enabled: false, batchSize: 5 });
    expect(resolved.enabled).toBe(false);
    expect(resolved.batchSize).toBe(5);
    expect(resolved.pollIntervalMs).toBe(1000);
    expect(resolved.maxAttempts).toBe(10);
  });

  it("ignores explicit undefined values (defaults win)", () => {
    expect(resolveOutboxConfig({ pollIntervalMs: undefined }).pollIntervalMs).toBe(1000);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @headless-lms/server exec vitest run src/composition/container.test.ts`
Expected: FAIL — `resolveOutboxConfig` / `OUTBOX_DEFAULTS` are not exported.

- [ ] **Step 3: Implement config + wiring** — in `packages/server/src/composition/container.ts`:

Add imports (with the other adapter imports):

```ts
import { InMemoryEventBus } from "../adapters/events/index.js";
import {
  PollingOutboxRelay,
  type PollingOutboxRelayConfig,
} from "../adapters/events/outbox-relay.js";
import { DrizzleOutboxStore } from "../adapters/db/repositories/outbox.js";
```

Extend the shared-ports type import:

```ts
import type {
  CredentialStore,
  EmailSender,
  Logger,
  ObjectStorage,
  OutboxRelay,
} from "../core/shared/ports.js";
```

Add below the `Config` interface's closing brace (and add the field inside `Config`):

```ts
  /** Transactional-outbox relay tuning. All optional — see OUTBOX_DEFAULTS. */
  outbox?: OutboxConfig;
```

```ts
/** Tuning for the transactional-outbox relay. Every field is optional; the
 *  container resolves against OUTBOX_DEFAULTS. */
export interface OutboxConfig {
  /** Master switch for the same-process relay (poller + sweep). Default true. */
  enabled?: boolean;
  /** Idle delay between polls. Default 1000. */
  pollIntervalMs?: number;
  /** Max rows fetched/dispatched per tick. Default 100. */
  batchSize?: number;
  /** Attempts before a message is parked as a dead letter. Default 10. */
  maxAttempts?: number;
  /** Exponential backoff: base * 2^attempts, capped at max. Defaults 1000 / 60000. */
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  /** Published rows older than this many days are swept. Default 7. */
  retentionDays?: number;
  /** Sweep cadence. Default 3600000 (1 h). */
  cleanupIntervalMs?: number;
}

export const OUTBOX_DEFAULTS: PollingOutboxRelayConfig = {
  enabled: true,
  pollIntervalMs: 1000,
  batchSize: 100,
  maxAttempts: 10,
  backoffBaseMs: 1000,
  backoffMaxMs: 60_000,
  retentionDays: 7,
  cleanupIntervalMs: 3_600_000,
};

export function resolveOutboxConfig(config: OutboxConfig = {}): PollingOutboxRelayConfig {
  const overrides = Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== undefined),
  );
  return { ...OUTBOX_DEFAULTS, ...overrides };
}
```

Add to the `Container` interface (after `credentials`):

```ts
  /** The outbox relay — constructed but NEVER started by the container; the
   *  installation's entry point starts it after listen (gen-openapi must not
   *  poll). buildServer stops it onClose. */
  outboxRelay: OutboxRelay;
```

In `buildContainer`, after the `integrations` wiring block, add:

```ts
  // Transactional-outbox relay: drains committed outbox rows and fans them
  // out to EventBus subscribers — after the UoW migration this is the ONLY
  // EventBus.publish caller in the codebase.
  const eventBus = new InMemoryEventBus();
  const outboxConfig = resolveOutboxConfig(config.outbox);
  const relayLogger: Logger = {
    info: (msg, meta) => console.log(msg, meta ?? {}),
    error: (msg, meta) => console.error(msg, meta ?? {}),
  };
  const outboxRelay = new PollingOutboxRelay(
    new DrizzleOutboxStore(db, outboxConfig.maxAttempts),
    eventBus,
    outboxConfig,
    relayLogger,
  );
```

and add `outboxRelay,` to the returned object literal.

- [ ] **Step 4: Stop on close** — in `packages/server/src/http/server.ts`, after `registerRoutes(app, container);` and before `return app;`:

```ts
  // Drain + stop the outbox relay on shutdown. Harmless when the relay was
  // never started (gen-openapi boots this app with ready() + close() only).
  app.addHook("onClose", async () => {
    await container.outboxRelay.stop();
  });
```

- [ ] **Step 5: Env mapping** — in `apps/api/src/config.ts`, add to the object returned by `loadContainerConfig()` (after the `storage` block):

```ts
    outbox: {
      enabled: (process.env.OUTBOX_ENABLED ?? "true") !== "false",
      pollIntervalMs: Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 1000),
      batchSize: Number(process.env.OUTBOX_BATCH_SIZE ?? 100),
      maxAttempts: Number(process.env.OUTBOX_MAX_ATTEMPTS ?? 10),
      backoffBaseMs: Number(process.env.OUTBOX_BACKOFF_BASE_MS ?? 1000),
      backoffMaxMs: Number(process.env.OUTBOX_BACKOFF_MAX_MS ?? 60_000),
      retentionDays: Number(process.env.OUTBOX_RETENTION_DAYS ?? 7),
      cleanupIntervalMs: Number(process.env.OUTBOX_CLEANUP_INTERVAL_MS ?? 3_600_000),
    },
```

- [ ] **Step 6: Explicit start after listen** — replace the whole of `apps/api/src/main.ts` with:

```ts
// Process entry point: env → config → container → server → listen → relay.
import { fileURLToPath } from "node:url";
import { createContainer, buildServer } from "@headless-lms/server";
import { loadServerConfig } from "./config.js";

const config = loadServerConfig();
const container = await createContainer(config, {
  pluginsDir: fileURLToPath(new URL("./plugins/", import.meta.url)),
});
const app = await buildServer(config, container);

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// Start the outbox relay ONLY here, after listen — never from an onReady
// hook: gen-openapi boots this same container via app.ready() during
// `pnpm gen:sdk` and must not begin polling. buildServer's onClose stops it.
container.outboxRelay.start();
```

- [ ] **Step 7: Verify**

Run: `pnpm --filter @headless-lms/server exec vitest run src/composition/container.test.ts`
Expected: PASS (3 tests).
Run: `pnpm --filter @headless-lms/server typecheck && pnpm --filter @headless-lms/server test && pnpm --filter @headless-lms/server lint && pnpm --filter @headless-lms/api typecheck && pnpm --filter @headless-lms/api lint`
Expected: ALL PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/composition/container.ts packages/server/src/composition/container.test.ts packages/server/src/http/server.ts apps/api/src/config.ts apps/api/src/main.ts
git commit -m "feat(composition): outbox config + relay lifecycle (start after listen, stop on close)"
```

---

### Task 10: Baseline regen + full verification gate + live smoke

**Files:**
- Regenerated: `packages/server/drizzle/0000_baseline.sql`, `packages/server/drizzle/meta/*`

**Interfaces:**
- Consumes: everything. Produces: a dev database whose schema includes `outbox`, and a fully green workspace.

- [ ] **Step 1: Stop anything running + wipe the dev DB**

```bash
pkill -f "tsx watch" || true
docker compose -f docker/docker-compose.yml up -d postgres
docker exec headless-lms-postgres psql -U postgres -d headless_lms -c "drop schema public cascade; create schema public;"
```

Expected: `DROP SCHEMA` / `CREATE SCHEMA`.

- [ ] **Step 2: Regenerate the baseline (keeps the `0000_baseline` journal tag)**

```bash
rm -rf packages/server/drizzle/*
cd packages/server && pnpm exec tsx --env-file=../../.env node_modules/drizzle-kit/bin.cjs generate --name=baseline && cd ../..
grep -n "outbox" packages/server/drizzle/0000_baseline.sql
```

Expected: a fresh `packages/server/drizzle/0000_baseline.sql`; the grep shows `CREATE TABLE "outbox"` with all ten columns, the `outbox_event_id_unique` constraint, and `CREATE INDEX "outbox_unpublished_idx" ON "outbox" USING btree ("next_attempt_at","id") WHERE "outbox"."published_at" is null`.

- [ ] **Step 3: Migrate + seed**

```bash
pnpm --filter @headless-lms/api db:migrate
pnpm --filter @headless-lms/api seed
pnpm --filter @headless-lms/api seed:dev
```

Expected: migrate applies `0000_baseline`; both seeds complete without error.

- [ ] **Step 4: Full verification gate (paste output)**

```bash
pnpm --filter @headless-lms/server test
pnpm --filter @headless-lms/server typecheck
pnpm --filter @headless-lms/server lint
pnpm typecheck
pnpm gen:sdk
git status --short packages/sdk
```

Expected: server suite fully green (all pre-existing suites + the 5 new test files); typecheck and lint clean workspace-wide; `pnpm gen:sdk` completes **without the process hanging or any outbox poll logging** (proves the relay did not autostart under `app.ready()`), and `git status` shows **no diff** under `packages/sdk` (outbox is internal — no contract change).

- [ ] **Step 5: Live smoke — relay drains a committed outbox row**

```bash
pnpm --filter @headless-lms/api dev &
sleep 6   # wait for "outbox relay started" in the log
docker exec headless-lms-postgres psql -U postgres -d headless_lms -c \
  "insert into outbox (event_id, type, payload) values ('evt_smoke1', 'smoke.test', '{\"type\":\"smoke.test\",\"id\":\"evt_smoke1\",\"occurredAt\":\"2026-07-22T00:00:00.000Z\"}');"
sleep 3
docker exec headless-lms-postgres psql -U postgres -d headless_lms -c \
  "select published_at is not null as published, attempts, last_error from outbox where event_id = 'evt_smoke1';"
pkill -f "tsx watch"
```

Expected: api log contains `outbox relay started`; the final select returns `published = t`, `attempts = 0`, `last_error` NULL (no subscribers → publish is a successful no-op; the row was claimed, dispatched, and marked within one poll interval).

- [ ] **Step 6: Commit the regenerated baseline**

```bash
git add packages/server/drizzle
git commit -m "chore(db): regenerate baseline with outbox table"
```

---

## Self-Review

**1. Spec coverage** (spec section → task):

- Locked: `UnitOfWork<Scope>` port + `OutboxAppender`, services stop taking `EventBus` → Tasks 2, 5, 6, 7.
- Locked: `DomainEvent` gains `id` + `occurredAt`, stamped by the appender; producers construct `Omit<E, "id"|"occurredAt">` → Tasks 1 (envelope + `NewDomainEvent`), 4 (`stampEvent` in the appender).
- Locked: skip-past-failures relay, park after `maxAttempts` → Task 8 (dispatch loop + tests), Task 4 (`fetchBatch` excludes `attempts >= maxAttempts`).
- Locked: integrations atomicity folded in (credential+connection+outbox one tx) → Tasks 2 (`IntegrationsTxScope` includes `CredentialStore`), 6 (service), 7 (tx-bound credential store in the UoW factory).
- Locked: dead-letter log-only → Task 8 ("parked" error log; rows stay, sweep only touches published rows — Task 4's `deletePublishedBefore` predicate `isNotNull(publishedAt)`).
- Locked: `outbox.org_id` nullable → Task 3 (schema + explicit nullability test).
- Locked: baseline regen → Task 10.
- Schema section (columns, partial index, poll query shape `FOR UPDATE SKIP LOCKED`) → Tasks 3, 4.
- Ports section (all five interfaces, exact member signatures) → Task 2.
- Per-context tx scopes (`EntitlementsTxScope { entitlements }`, `IntegrationsTxScope { connections, credentials }`) → Task 2, spec naming followed exactly.
- DbExecutor widening (structure.ts `Tx` promoted; repos accept `DbExecutor`) → Task 3 (union callability probed against drizzle-orm 0.45.2 during planning).
- Adapters (`DrizzleOutboxAppender`/`Store` in `repositories/outbox.ts`, `DrizzleUnitOfWork` in `unit-of-work.ts`, `PollingOutboxRelay` in `events/outbox-relay.ts`, `InMemoryEventBus` retained unchanged) → Tasks 4, 8.
- Composition & lifecycle (container builds UoWs/store/relay, exposes `outboxRelay`; `buildServer` onClose stop; explicit start in `main.ts` after listen, NOT onReady) → Tasks 7, 9.
- Config block + env mapping in the only-process.env file → Task 9.
- Migration of all 6 publish sites (table in spec) → Tasks 5 (2 sites), 6 (4 sites); `EnrollmentExpired` untouched (no task touches `packages/types/src/entitlements.ts`).
- Delivery semantics (at-least-once, commit order, backoff via `next_attempt_at`) → Tasks 4 + 8 and their tests.
- Testing section (service fakes, UoW/appender same-tx + rollback propagation, relay unit tests incl. drain/park/sweep/stop, suite stays green) → Tasks 4, 5, 6, 8; real-DB rollback and the partial index are verified live in Task 10 (the suite has no Postgres harness — consistent with the codebase's unit-test-only style).
- Baseline regen sequence (barrel → wipe → rm drizzle → generate → migrate → seed → seed:dev; SDK regen only if contract changed — it didn't, verified by no-diff gate) → Task 10.

Gaps: none found.

**2. Placeholder scan:** no TBD/TODO/"add appropriate"/"similar to Task N" anywhere; every code step carries the complete file or the exact insertion with surrounding anchors; every run step has a command and expected output.

**3. Type consistency across tasks** (ledger):

- `NewDomainEvent<E>` defined Task 1 → used in Task 2 (`OutboxAppender.append<E extends NewDomainEvent>`), Task 4 (`stampEvent`, appender), Tasks 5/6/8 test fakes.
- `OutboxAppender.append` is **generic** (`<E extends NewDomainEvent>(events: E[])`) everywhere — this is what lets services pass inline event literals without tripping TS excess-property checks; fakes implement it with a concrete `(events: NewDomainEvent[])` signature (valid instantiation).
- Scope keys: `entitlements` (Task 2 = Task 4 container factory = Task 5 service/tests = Task 7 wiring); `connections`/`credentials` (Task 2 = Task 6 = Task 7).
- `DrizzleUnitOfWork(db, makeScope: (tx: Tx) => Scope)` (Task 4) matches Task 7's `new DrizzleUnitOfWork(db, (tx) => ({ … }))`.
- `DrizzleOutboxStore(db, maxAttempts)` (Task 4) matches Task 9's `new DrizzleOutboxStore(db, outboxConfig.maxAttempts)`.
- `PollingOutboxRelay(store, bus, config: PollingOutboxRelayConfig, logger)` (Task 8) matches Task 9's construction; `resolveOutboxConfig` returns `PollingOutboxRelayConfig` exactly.
- `OutboxMessage` fields (`id`, `eventId`, `type`, `payload`, `attempts` — per the spec's locked port, no top-level `occurredAt`; it lives inside `payload`) consistent across Tasks 2, 4, 8.
- `Container.outboxRelay: OutboxRelay` (Task 9) is what Task 9's `http/server.ts` hook and `main.ts` call.
