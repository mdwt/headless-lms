# Transactional Outbox — Architecture Analysis

Analysis for introducing a transactional outbox as a core part of the platform:
every domain event is written to an `outbox` row **in the same database
transaction as the domain write**, and a relay (behind a port, same-process
poller as the first adapter) reads unpublished rows off a partial index and
dispatches them to the in-process `EventBus` subscribers. This document is the
design input for the spec; no production code accompanies it.

All paths are relative to the repo root; the server package is
`packages/server/src/`.

---

## A. Publish inventory

### A.1 Every `.publish(` call site

There are **six** publish sites, all in core services, all following the same
shape: `await repo.write(...)` (auto-committed single statement) → construct
event → `await this.events.publish(event)` after the write returns.

| # | File:line | Event type | Service method | Accompanying DB write |
|---|-----------|-----------|----------------|----------------------|
| 1 | `packages/server/src/core/entitlements/service.ts:26` | `enrollment.created` (`EnrollmentCreated`) | `EntitlementsServiceImpl.grant` | `DrizzleEntitlementsRepository.insert` — upsert into `enrollments` (`adapters/db/repositories/entitlements.ts:152-178`, `insert ... onConflictDoUpdate`) |
| 2 | `packages/server/src/core/entitlements/service.ts:41` | `enrollment.deleted` \| `enrollment.updated` (`EnrollmentDeleted`/`EnrollmentUpdated`) | `EntitlementsServiceImpl.setStatus` | `DrizzleEntitlementsRepository.setStatus` — `update enrollments set status` (`adapters/db/repositories/entitlements.ts:180-192`) |
| 3 | `packages/server/src/core/integrations/service.ts:67` | `connection.created` (`ConnectionCreated`) | `IntegrationsServiceImpl.connect` | **Two writes**: `DrizzleCredentialStore.store` — insert into `credentials` (`adapters/db/repositories/credentials.ts:70`) then `DrizzleConnectionsRepository.insert` — insert into `connections` (`adapters/db/repositories/integrations.ts:25-40`). Not atomic today. |
| 4 | `packages/server/src/core/integrations/service.ts:87` | `connection.updated` (`changed: "credentials"`) | `IntegrationsServiceImpl.reconnect` | `DrizzleCredentialStore.update` (`credentials.ts:85-92`) then `DrizzleConnectionsRepository.update` (`integrations.ts:70-85`). Two statements, not atomic today. |
| 5 | `packages/server/src/core/integrations/service.ts:107` | `connection.updated` (`changed: "configuration"`) | `IntegrationsServiceImpl.configure` | `DrizzleConnectionsRepository.update` (`integrations.ts:70-85`) |
| 6 | `packages/server/src/core/integrations/service.ts:123` | `connection.removed` (`ConnectionRemoved`) | `IntegrationsServiceImpl.disconnect` | `DrizzleConnectionsRepository.delete` (`integrations.ts:87-92`) then `DrizzleCredentialStore.destroy` (`credentials.ts:93-96`). Two statements, not atomic today. |

Verified exhaustively: `grep -rn '\.publish(' packages/server/src` returns only
these six (plus their service tests). No route handler, adapter, or reporting
code publishes. Nothing anywhere calls `EventBus.subscribe` today — events are
currently published into a subscriber-less bus (the Slack plugin's
`plugins/slack/src/notifications/formatters.ts` formats domain-event bodies,
but it is invoked as an integration *action*, not as a bus subscriber). The
outbox therefore changes the producer side without breaking any consumer.

The entitlements service already carries the intent, verbatim
(`core/entitlements/service.ts:3-6`):

> ```
> // Events are published after the awaited repo call returns. Repo methods are
> // single auto-committed statements (no transactions in this codebase), so
> // publish always happens after commit. If these writes ever move inside a
> // transaction, switch to a transactional outbox (planned with automations).
> ```

### A.2 Domain events declared in `@headless-lms/types`

Base shape (`packages/types/src/shared.ts:4-6`):

```ts
export interface DomainEvent {
  readonly type: string;
}
```

Per context:

| Context | Types file | Events |
|---------|-----------|--------|
| entitlements | `packages/types/src/entitlements.ts:47-81` | `EnrollmentCreated` (`enrollment.created`), `EnrollmentUpdated` (`enrollment.updated`), `EnrollmentDeleted` (`enrollment.deleted`), `EnrollmentExpired` (`enrollment.expired` — **declared, never published**; the file notes a future scheduled sweep will publish it: "expired" is derived from `expires_at` at read time) |
| integrations | `packages/types/src/integrations.ts:89-110` | `ConnectionCreated` (`connection.created`), `ConnectionUpdated` (`connection.updated`, carries `changed: "credentials" | "configuration"`), `ConnectionRemoved` (`connection.removed`) |
| identity | `packages/types/src/identity.ts:45` | `IdentityEvent = never` |
| content | `packages/types/src/content.ts:75` | `ContentEvent = never` |
| organizations | `packages/types/src/organizations.ts:117` | `OrganizationEvent = never` |
| progress | `packages/types/src/progress.ts:41` | `ProgressEvent = never` |
| assets | `packages/types/src/assets.ts` | none declared |

Enrollment events carry the **full denormalised `Entitlement` snapshot**
(student names, email, course title — the repository joins `students` and
`courses` at read time), so an outbox payload of the event as-is is
self-contained; consumers need no cross-context lookups (this is stated policy
in `packages/types/src/entitlements.ts:40-44`).

Core contexts re-export these from their `events.ts` per the type-ownership
rule (e.g. `core/entitlements/events.ts`), never re-declare.

---

## B. Current transaction & persistence mechanics

### B.1 The database client

`packages/server/src/adapters/db/index.ts:10-13`:

```ts
export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString });
  return drizzle(pool);
}
```

One `pg.Pool`, one `NodePgDatabase` (no schema generic), created once in
`composition/container.ts:95` and handed to every repository constructor.
`composition/db.ts` re-exports `createDb`/`schema` as the sanctioned path for
inbound code (cli, workers, cron) needing a raw connection.

### B.2 How repositories execute writes

Every repository takes `private readonly db: NodePgDatabase` and issues
**single auto-committed statements** (e.g.
`DrizzleEntitlementsRepository.insert`, `entitlements.ts:152-178`). There is no
unit of work; a service method that performs two writes (integrations
`connect`/`reconnect`/`disconnect`) performs two independent commits.

`db.transaction(...)` is used in exactly three places today:

1. `adapters/db/repositories/structure.ts` — the content-structure repository
   wraps its own multi-statement mutations (lines 27, 124, 141, 154, 186, 213,
   252, 301). Crucially it already established the tx-handle typing precedent
   (`structure.ts:19`):

   ```ts
   /** Transaction executor — the same query surface as the root db. */
   type Tx = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];
   ```

   and passes `tx` to private methods that run the same Drizzle query-builder
   calls. This confirms the Drizzle tx handle is interchangeable with the root
   db for query building — the exact property the outbox design relies on.

2. `composition/seed.ts:204` — all-or-nothing seed insert.
3. `composition/seed-dev-student.ts:99` — same.

No service, and no repository other than `structure.ts`, is transaction-aware.

### B.3 Wiring (constructor injection)

`composition/container.ts` builds everything in dependency order:

- `container.ts:95-96`: `const db = createDb(...)`, `const eventBus = new InMemoryEventBus()`.
- `container.ts:120`: `new EntitlementsServiceImpl(new DrizzleEntitlementsRepository(db), eventBus)`.
- `container.ts:141-147`: `new IntegrationsServiceImpl(registry, new DrizzleConnectionsRepository(db), credentialStore, eventBus, () => new Date().toISOString())`.

Services receive repos and the bus as constructor args; `db` itself never
crosses into core.

### B.4 The EventBus port and adapter

Port (`core/shared/ports.ts:12-15`):

```ts
export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
  subscribe(type: string, handler: (event: DomainEvent) => Promise<void>): void;
}
```

Adapter (`adapters/events/index.ts:5-19`): `InMemoryEventBus` — a
`Map<string, handler[]>`; `publish` awaits each subscribed handler
sequentially. No persistence, no retry, no error isolation: a throwing handler
propagates into the publishing request. (Today that is moot — nothing
subscribes.)

### B.5 Where the transaction boundary must be introduced

The boundary belongs at the **service method** (the use case), because that is
where the event is constructed from the write's result and where multi-write
flows (integrations connect/disconnect) live. The repo methods that must
become transaction-aware (i.e. runnable against a tx handle, not only the root
db):

- `DrizzleEntitlementsRepository.insert`, `.setStatus` (and the private
  `findById` they call).
- `DrizzleConnectionsRepository.insert`, `.update`, `.delete` (and
  `findById`/`findByIntegration` when read inside the same tx).
- `DrizzleCredentialStore.store`, `.update`, `.destroy` — if (recommended,
  see C.4) the integrations flows become fully atomic, which fixes an existing
  latent inconsistency: today a crash between `credentials.store` and
  `connections.insert` leaks an orphan credential row, and between
  `repo.delete` and `credentials.destroy` leaks an orphan credential.

Read-only repos (dashboard, students, learn, content read paths, etc.) are
untouched.

### B.6 Boot & lifecycle (where a poller starts/stops)

- `apps/api/src/main.ts`: `loadServerConfig()` → `createContainer(config,
  { pluginsDir })` → `buildServer(config, container)` → `app.listen(...)`.
  No signal handling, no graceful-shutdown path today.
- `packages/server/src/http/server.ts:14-31`: `buildServer` assembles Fastify
  plugins; it starts nothing.
- `packages/server/src/index.ts:29-34`: `createContainer` wraps
  `buildContainer(config.container, options)`.
- **Caveat for lifecycle design**: `apps/api/scripts/gen-openapi.ts` boots the
  full container and calls `await app.ready()` (line 12) with **no port
  bound**, then `app.close()`. Any relay auto-started from an `onReady` hook
  would run during spec generation. The design must keep relay start explicit
  or config-gated (see E.5).

---

## C. Transaction threading through the write path

### C.1 The problem

Core may not import drizzle, `pg`, or adapters (`.eslintrc.cjs:99-146` —
enforced, not advisory). Yet the service is the place that (a) decides which
event to emit, (b) builds it from the write result, and (c) must have write +
outbox-append commit atomically. Something framework-free must represent "run
these operations in one atomic scope" inside core.

### C.2 Options evaluated

**Option 1 — Unit-of-work port exposing tx-scoped ports (recommended).**
Core declares a generic `UnitOfWork<Ports>` in `core/shared/ports.ts`:
`uow.run(fn)` executes `fn` against a scope containing the context's
repository (and any other transactional ports) plus an `OutboxAppender`, all
bound to one transaction. The Drizzle adapter implements it as
`db.transaction((tx) => fn(makePorts(tx)))`, instantiating tx-bound repository
instances. Services swap `this.repo`/`this.events` for `this.uow.run(...)` in
mutating methods.

- Pros: explicit and honest (the atomic scope is visible in the use case's
  code); zero framework types in core (the port is pure TS); trivially fakeable
  in unit tests (`run: (fn) => fn({ repo: fakeRepo, outbox: fakeOutbox })`);
  naturally fixes the integrations multi-write flows (credential + connection
  in one tx); matches the constructor-injection style the container already
  uses; the tx-bound-repo trick is already proven by `structure.ts`.
- Cons: mutating service methods change shape (wrapped in `run`); repository
  constructor types must widen to accept the tx handle (mechanical, see C.3).

**Option 2 — Repos accept an optional tx handle parameter.**
Every write method gains `tx?: TransactionHandle` where core declares an
opaque branded type. A separate `Transactional` port yields the handle.

- Pros: repos stay singletons.
- Cons: pollutes every outbound port signature with a persistence concern;
  core carries around an opaque token it can do nothing with (a "leaky
  abstraction wearing a brand type"); every call site must remember to pass
  it — forgetting compiles fine and silently breaks atomicity. Worst option
  for this codebase.

**Option 3 — Ambient transaction context (AsyncLocalStorage).**
A `Transactional.run(fn)` adapter stores the Drizzle tx in ALS; repositories
resolve their executor through a provider that returns the ambient tx when
present, the root db otherwise. Core services just call `transactional.run(async
() => { await repo.insert(...); await outbox.append(...) })` with unchanged
repo ports.

- Pros: smallest diff to ports; repos stay singletons; call sites can't forget
  to pass a handle.
- Cons: invisible coupling — nothing in a repo's signature says whether it is
  inside a tx; harder to reason about and to test (fakes must simulate the
  ambient scope); a footgun with any code that intentionally escapes the tx
  (e.g. the relay's own bookkeeping); the codebase has no ALS precedent and
  its style is emphatically explicit (lazy `orgAdminRef`, comments justifying
  every indirection).

**Option 4 — Push event recording into the repository port** (write methods
take an event factory: `repo.insert(orgId, input, (row) => [events])`; adapter
runs write + append in one tx).

- Pros: no new UoW concept; atomicity is unbreakable per call.
- Cons: every write port grows an events parameter (persistence port now owns
  event semantics); multi-write use cases (integrations connect) still need a
  cross-repo transaction, which this cannot express — so Option 1 would be
  needed anyway for exactly the flows that are hardest. Rejected as
  incomplete.

### C.3 Recommendation: Option 1, shaped for this codebase

**Ports** (in `core/shared/ports.ts`, alongside `EventBus` — precedent: this
file already hosts cross-cutting ports consumed by adapters rather than core,
e.g. `EmailSender`, `CredentialStore`):

```ts
/** Appends domain events to the transactional outbox. Inside a UnitOfWork
 *  scope the append shares the scope's transaction — the event becomes
 *  visible to the relay only when the surrounding write commits. */
export interface OutboxAppender {
  append(events: DomainEvent[]): Promise<void>;
}

/** Runs a callback atomically: every port in the scope (context repos + the
 *  outbox) executes in one database transaction; a thrown error rolls all of
 *  it back. P is the context-specific port bundle. */
export interface UnitOfWork<P> {
  run<T>(fn: (scope: P & { outbox: OutboxAppender }) => Promise<T>): Promise<T>;
}
```

Each context declares its own scope in its `ports.ts` (respecting the
per-context file contract), e.g. `core/entitlements/ports.ts`:

```ts
export interface EntitlementsTxPorts {
  repo: EntitlementsRepository;
}
export type EntitlementsUnitOfWork = UnitOfWork<EntitlementsTxPorts>;
```

`core/integrations/ports.ts`:

```ts
export interface IntegrationsTxPorts {
  repo: ConnectionsRepository;
  credentials: CredentialStore;
}
export type IntegrationsUnitOfWork = UnitOfWork<IntegrationsTxPorts>;
```

**Service shape after migration** (entitlements `grant`, currently
`service.ts:23-28`):

```ts
async grant(orgId: string, input: GrantEntitlementInput): Promise<Entitlement> {
  return this.uow.run(async ({ repo, outbox }) => {
    const enrollment = await repo.insert(orgId, input);
    await outbox.append([{ type: "enrollment.created", orgId, enrollment }]);
    return enrollment;
  });
}
```

The service keeps a plain repo for reads (`list` stays as-is) and drops its
`EventBus` dependency entirely — after this migration **no core service
publishes to the bus**; the bus becomes the relay's dispatch fan-out only.

**Adapter** (`adapters/db/unit-of-work.ts`), one generic implementation:

```ts
type Tx = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0]; // structure.ts:19 precedent
export type DbExecutor = NodePgDatabase | Tx;

export class DrizzleUnitOfWork<P> implements UnitOfWork<P> {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly ports: (tx: DbExecutor) => P,
  ) {}
  run<T>(fn: (scope: P & { outbox: OutboxAppender }) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) =>
      fn({ ...this.ports(tx), outbox: new DrizzleOutboxAppender(tx) }),
    );
  }
}
```

Repository constructors widen from `NodePgDatabase` to `DbExecutor` (exported
from `adapters/db/index.ts`). This is required because Drizzle's
`NodePgTransaction` shares the query-builder surface with `NodePgDatabase` but
is not assignable to it (the root db type carries `$client` etc.);
`structure.ts` sidestepped this with its local `Tx` alias — the outbox work
promotes that alias to the shared `DbExecutor`. Purely mechanical: no query
code changes.

**Container wiring** (`composition/container.ts`):

```ts
const entitlementsUow = new DrizzleUnitOfWork(db, (tx) => ({
  repo: new DrizzleEntitlementsRepository(tx),
}));
const entitlements = new EntitlementsServiceImpl(
  new DrizzleEntitlementsRepository(db), // reads
  entitlementsUow,                        // atomic writes + outbox
);
```

Constructing a tx-bound repo per `run` is negligible cost (repos are stateless
wrappers over the executor) and is exactly how the scope guarantees no
statement escapes the transaction.

### C.4 Blast radius of the migration (requirement 5)

| Service method | Change |
|---|---|
| `EntitlementsServiceImpl.grant` | wrap insert + append in `uow.run` |
| `EntitlementsServiceImpl.setStatus` | wrap update + append in `uow.run` |
| `IntegrationsServiceImpl.connect` | wrap credential store + connection insert + append in one `uow.run` (fixes existing non-atomicity) |
| `IntegrationsServiceImpl.reconnect` | wrap credential update + connection update + append |
| `IntegrationsServiceImpl.configure` | wrap update + append |
| `IntegrationsServiceImpl.disconnect` | wrap delete + credential destroy + append |

`EventBus` disappears from both services' constructors; their `service.test.ts`
fakes swap `fakeEvents()` for a pass-through fake UoW. No HTTP route, no
api-contract schema, no SDK surface changes.

---

## D. Proposed schema

### D.1 Table (`adapters/db/schema/outbox.ts`, re-exported from `schema/index.ts`)

The outbox is infrastructure, not a domain table, so the org-scoped composite
`(org_id, id)` PK convention (AGENTS.md multi-tenancy rule) deliberately does
not apply; a monotonic `bigserial` PK gives commit-order polling and dense
index locality. `org_id` is retained as a plain column (every current event is
org-scoped) for filtering/debugging.

```ts
import { pgTable, bigserial, text, jsonb, timestamp, integer, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { genId } from "../../../core/shared/id.js";

export const outbox = pgTable(
  "outbox",
  {
    /** Monotonic position — the relay's ordering and paging key. */
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    /** Stable event identity for consumer-side idempotency/dedup. */
    eventId: text("event_id").notNull().unique().$defaultFn(() => genId("event")),
    /** DomainEvent.type, e.g. "enrollment.created". */
    type: text("type").notNull(),
    /** The org the event belongs to (all current events carry one). */
    orgId: text("org_id"),
    /** The full DomainEvent, JSON-serialised — self-contained snapshot. */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    /** When the producing transaction wrote the row. */
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
    /** Set once the relay has dispatched to all subscribers. NULL = pending. */
    publishedAt: timestamp("published_at"),
    /** Dispatch attempts so far. */
    attempts: integer("attempts").notNull().default(0),
    /** Earliest next dispatch (backoff schedule). */
    nextAttemptAt: timestamp("next_attempt_at").notNull().defaultNow(),
    /** Message of the most recent dispatch failure. */
    lastError: text("last_error"),
  },
  (t) => ({
    // Partial index: the poll query's exact shape. Stays tiny — only
    // unpublished rows live in it, published rows fall out on update.
    unpublishedIdx: index("outbox_unpublished_idx")
      .on(t.nextAttemptAt, t.id)
      .where(sql`${t.publishedAt} is null`),
  }),
);
```

(`timestamp` without timezone follows the existing schema convention —
`enrollments.granted_at`, `connections.created_at` are `timestamp` too.)

### D.2 DDL sketch

```sql
CREATE TABLE outbox (
  id              bigserial PRIMARY KEY,
  event_id        text NOT NULL UNIQUE,
  type            text NOT NULL,
  org_id          text,
  payload         jsonb NOT NULL,
  occurred_at     timestamp NOT NULL DEFAULT now(),
  published_at    timestamp,
  attempts        integer NOT NULL DEFAULT 0,
  next_attempt_at timestamp NOT NULL DEFAULT now(),
  last_error      text
);

CREATE INDEX outbox_unpublished_idx
  ON outbox (next_attempt_at, id)
  WHERE published_at IS NULL;
```

Poll query the index serves:

```sql
SELECT * FROM outbox
WHERE published_at IS NULL AND next_attempt_at <= now()
ORDER BY id
LIMIT $batch
FOR UPDATE SKIP LOCKED;
```

`FOR UPDATE SKIP LOCKED` makes the relay safe if a second API process ever
runs (each instance claims disjoint rows); with a single process it is free.

### D.3 Migration mechanics

Migrations live in `packages/server/drizzle/` with a **single
`0000_baseline.sql`** (journal tag `0000_baseline`,
`drizzle/meta/_journal.json`) — this codebase regenerates the baseline rather
than accreting incremental files while pre-release. The outbox table is added
to the schema barrel and the baseline regenerated via `pnpm db:generate`
(config: `packages/server/drizzle.config.ts` scans
`src/adapters/db/schema/index.ts` + the auth schema). Note drizzle-kit emits
partial indexes correctly from the `.where(sql...)` builder.

---

## E. Ports & adapters

### E.1 Port inventory (all in `core/shared/ports.ts` — framework-free)

```ts
// Producer side (used by core services via UnitOfWork scope)
export interface OutboxAppender {
  append(events: DomainEvent[]): Promise<void>;
}

export interface UnitOfWork<P> {
  run<T>(fn: (scope: P & { outbox: OutboxAppender }) => Promise<T>): Promise<T>;
}

// Relay side (used by the relay adapter + composition; core never calls these,
// same as EmailSender/ObjectStorage which already live in this file)
export interface OutboxMessage {
  /** Outbox position (bigint as string). */
  id: string;
  /** Stable event identity (idempotency key for consumers). */
  eventId: string;
  type: string;
  payload: DomainEvent;
  occurredAt: string; // ISO-8601
  attempts: number;
}

export interface OutboxStore {
  /** Due, unpublished messages in commit order; claims them for this reader. */
  fetchBatch(limit: number): Promise<OutboxMessage[]>;
  markPublished(id: string): Promise<void>;
  markFailed(id: string, error: string, nextAttemptAt: Date): Promise<void>;
  /** Retention sweep: delete published rows older than the cutoff. */
  deletePublishedBefore(cutoff: Date): Promise<number>;
}

/** The relay mechanism — how outbox rows become dispatched events. Swappable:
 *  same-process poller today; LISTEN/NOTIFY, CDC (Debezium), or an external
 *  worker later, without touching producers or subscribers. */
export interface OutboxRelay {
  start(): void;
  /** Graceful: resolves after the in-flight batch finishes. */
  stop(): Promise<void>;
}
```

### E.2 Adapters

| Adapter | File | Responsibility |
|---|---|---|
| `DrizzleOutboxAppender` | `adapters/db/repositories/outbox.ts` | `insert into outbox` using the **tx executor it was constructed with** — the same-transaction guarantee lives here. Serialises the event to `payload`, mirrors `type`/`orgId`, defaults the rest. |
| `DrizzleOutboxStore` | `adapters/db/repositories/outbox.ts` | Constructed with the root db. `fetchBatch` (the D.2 query, inside a short tx for `FOR UPDATE SKIP LOCKED`), `markPublished`, `markFailed`, `deletePublishedBefore`. |
| `DrizzleUnitOfWork<P>` | `adapters/db/unit-of-work.ts` | `db.transaction` + tx-scoped port construction (C.3). |
| `PollingOutboxRelay` | `adapters/events/outbox-relay.ts` | The same-process poller (E.3). Depends on `OutboxStore`, `EventBus`, `Logger`, config. Knows nothing of Drizzle. |
| `InMemoryEventBus` | `adapters/events/index.ts` (unchanged) | Stays the in-process dispatch: subscribers register exactly as the port defines today. |

### E.3 The poller loop (`PollingOutboxRelay`)

```
start(): schedule tick after pollIntervalMs (setTimeout chain, never
         setInterval — a slow batch must not overlap the next tick)

tick():
  batch = store.fetchBatch(batchSize)
  for each message (ascending id):
    try:
      await bus.publish(message.payload)     // all subscribers, sequentially
      await store.markPublished(message.id)
    catch err:
      delay = min(backoffBaseMs * 2^attempts, backoffMaxMs)
      await store.markFailed(message.id, String(err), now + delay)
      log.error("outbox dispatch failed", { id, type, attempts })
      continue                                // skip past; don't block the queue
  if batch was full → tick again immediately (drain bursts)
  else → schedule next tick after pollIntervalMs

cleanup (separate timer, cleanupIntervalMs):
  store.deletePublishedBefore(now − retentionDays)

stop(): clear timers; await the in-flight tick promise.
```

Poison-message policy: after `maxAttempts` failures the row stays unpublished
but is excluded from `fetchBatch` (`attempts < maxAttempts` predicate) and
logged loudly — a parked dead letter, never deleted by the retention sweep
(which only touches published rows), so it remains inspectable and manually
re-drivable (`UPDATE outbox SET attempts = 0 WHERE id = ...`).

### E.4 Keep `EventBus`, don't replace it

Recommendation: **keep** the `EventBus` port and `InMemoryEventBus` adapter as
the relay's dispatch fan-out.

- Subscribers (none yet; automations/plugins are the intended ones) keep the
  exact `subscribe(type, handler)` contract — requirement "subscribers
  unchanged" satisfied by construction.
- The bus's role inverts cleanly: today publish-side (services → bus), after
  the migration dispatch-side only (relay → bus → handlers). Core services no
  longer hold an `EventBus` at all, so the "someone might still publish
  directly" hole closes structurally — the only remaining `publish` caller in
  the codebase is the relay. Worth an ESLint restriction or a doc note, but
  the constructor surgery already removes the temptation.
- Replacing it (e.g. handlers registered directly on the relay) would buy
  nothing and would churn the port for the plugin/automation story.

One semantic note to document for future subscribers: under the relay,
`publish` failures no longer surface in an HTTP request — they surface as
outbox retries. A handler that throws is retried **together with every other
handler for that event** (the outbox row is the retry unit, not the
handler-event pair), so handlers must be idempotent (F.1).

### E.5 Lifecycle

- `buildContainer` constructs `DrizzleOutboxStore`, `PollingOutboxRelay`
  (skipping construction when `outbox.enabled === false` in favor of a no-op
  relay), and exposes `outboxRelay: OutboxRelay` on the `Container`.
- `buildServer` (`http/server.ts`) registers
  `app.addHook("onClose", () => container.outboxRelay.stop())` so
  `app.close()` always drains, then **`apps/api/src/main.ts` calls
  `container.outboxRelay.start()` after `app.listen(...)` resolves**.
  Start stays explicit in the installation entry point because
  `apps/api/scripts/gen-openapi.ts:12` calls `app.ready()` on the real
  container with no port bound — an `onReady`-hook autostart would begin
  polling during every `pnpm gen:sdk`. (The onClose hook still covers
  gen-openapi's `app.close()` harmlessly: stopping a never-started relay is a
  no-op.)
- The CLI (`headless-lms migrate|seed`) never builds the container, so it is
  unaffected.

### E.6 Config surface

`Config` in `composition/container.ts` (exported as `ContainerConfig`) gains:

```ts
outbox?: {
  /** Master switch for the same-process relay (poller + cleanup). Default true. */
  enabled?: boolean;
  /** Idle delay between polls. Default 1000. */
  pollIntervalMs?: number;
  /** Max rows fetched/dispatched per tick. Default 50. */
  batchSize?: number;
  /** Attempts before a message is parked as a dead letter. Default 10. */
  maxAttempts?: number;
  /** Exponential backoff: base * 2^attempts, capped. Defaults 1000 / 60000. */
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  /** Published rows older than this are deleted by the sweep. Default 7. */
  retentionDays?: number;
  /** How often the sweep runs. Default 3600000 (1 h). */
  cleanupIntervalMs?: number;
};
```

`apps/api/src/config.ts` maps env vars (`OUTBOX_ENABLED`,
`OUTBOX_POLL_INTERVAL_MS`, `OUTBOX_BATCH_SIZE`, `OUTBOX_MAX_ATTEMPTS`,
`OUTBOX_RETENTION_DAYS`, …) — it is "the only file that touches
process.env" (`config.ts:1-3`), so the server package sees only the typed
object.

---

## F. Delivery semantics, testing, trade-offs

### F.1 Semantics

- **At-least-once.** The commit point is the domain transaction; the relay can
  crash between `bus.publish` and `markPublished`, redelivering on restart.
  Exactly-once delivery is not achievable here; exactly-once *processing* is
  the consumer's job: every handler must be idempotent, keyed on
  `event_id`. This must be a stated contract for automations/plugin
  subscribers from day one (e.g. a processed-events table or natural
  idempotency like upserts).
- **Ordering.** Rows dispatch in `id` (commit) order per tick — a global total
  order in the happy path, which is stronger than most brokers give. Two
  qualifiers: (1) a failing message is skipped and retried later, so order is
  not preserved *across failures* (an `enrollment.updated` can land before the
  failed `enrollment.created` retry); (2) if the deployment ever scales to
  multiple API processes, `SKIP LOCKED` keeps them from double-claiming but
  interleaves dispatch order. Handlers must treat ordering as best-effort —
  the full-snapshot event payloads (A.2) make this easy since every event is
  self-contained state, not a delta.
- **No dual write remains.** After migration, requirement 5 holds structurally:
  core services cannot publish (no bus dependency), and the only path from a
  domain write to a subscriber is write→outbox(committed together)→relay→bus.

### F.2 Testing strategy

- **Service unit tests** (existing style, `core/*/service.test.ts` with vi
  fakes): fake UoW passes a scope through and records; assert
  `outbox.append` was called with the exact event *within* `run`, and that a
  repo failure inside `run` propagates without append (rollback semantics are
  the adapter's job, the service test just asserts ordering/inputs).
- **UnitOfWork + appender adapter test** (needs Postgres, like migrate's
  operational tests): `uow.run` writing a row + appending, then throwing →
  assert neither the domain row nor the outbox row exists; happy path →
  both exist.
- **Relay unit tests** (pure, fake `OutboxStore`/`EventBus`/timers via
  `vi.useFakeTimers`): dispatch order; markPublished per message; a throwing
  handler → markFailed with the right backoff and the rest of the batch still
  dispatched; maxAttempts exclusion; full batch triggers immediate re-tick;
  `stop()` awaits the in-flight tick; cleanup calls `deletePublishedBefore`
  with `now − retention`.
- **Store adapter test** (Postgres): fetchBatch respects
  `published_at IS NULL AND next_attempt_at <= now()` order/limit; the partial
  index exists (assert via `pg_indexes`).

### F.3 Trade-offs accepted

- **Polling latency** (≤ pollIntervalMs, default 1 s) instead of the old
  in-request immediacy. Acceptable for notification/automation workloads; the
  relay port keeps LISTEN/NOTIFY as a drop-in latency upgrade later.
- **UoW constructs repos per transaction** — negligible (stateless objects),
  and the price of a scope that cannot leak statements outside the tx.
- **`EnrollmentExpired`** remains unpublished (needs the future scheduled
  sweep); when that sweep arrives it writes outbox rows through the same
  appender — the design already accommodates it.

### F.4 Open decisions needing user confirmation

1. **Event envelope: extend `DomainEvent`?** Today `DomainEvent` is
   `{ readonly type: string }` and subscribers receive exactly the payload the
   service built. For consumer idempotency, handlers need the `event_id`.
   Options: (a) add optional `readonly id?: string` / `readonly occurredAt?:
   string` to the base `DomainEvent` in `@headless-lms/types`, stamped into the
   payload by the appender at append time (subscribers get keys; producers
   don't set them; payload in DB is self-describing) — recommended; (b) leave
   `DomainEvent` untouched and change the relay→handler contract to pass an
   envelope, which breaks the "subscribers unchanged" requirement; (c) punt —
   handlers derive idempotency from natural keys only. (a) touches the
   published type surface, so it needs sign-off.
2. **Dead-letter surfacing.** The design parks poisoned rows
   (attempts ≥ maxAttempts) in the table with logs. Is log-only acceptable for
   now, or should the spec include an operational surface (an admin
   route/reporting view over parked rows, or a metric)?
3. **Ordering strictness.** Recommended policy is skip-past-failures (F.1).
   The alternative — halt the queue (or the org's slice of it) until the head
   message succeeds — preserves strict order at the cost of one poison message
   stalling all events (or all of an org's events). Confirm skip-past is
   acceptable for the automation/notification use cases planned.
4. **Integrations atomicity scope.** C.4 folds the credential-store writes
   into the integrations transaction (fixing today's orphan-credential
   windows). Strictly it exceeds "introduce the outbox" — confirm it's in
   scope, since the UoW must wrap those flows anyway and leaving the
   credential writes outside the tx would be a deliberate inconsistency.
5. **`org_id` column nullability.** Kept nullable for hypothetical
   platform-level events; all current events are org-scoped. Nullable vs
   NOT NULL is a one-word decision but affects the baseline.
