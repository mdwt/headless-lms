# Design: Transactional outbox (core)

Date: 2026-07-22
Branch: `worktree-outbox-pattern`
Analysis: `docs/architecture/2026-07-22-outbox-analysis.md`

## Goal

Make the outbox a core part of the system: **every domain event is appended to an `outbox` row in the same DB transaction as the domain write** (no dual write), and a configurable **same-process poller** (behind a port) relays outbox rows to the in-process `EventBus` subscribers at-least-once. Every `publish()` call site today is migrated to the outbox; after this change the only `EventBus.publish` caller is the relay.

## Locked decisions

- **Transaction threading:** a generic `UnitOfWork<P>` port; `uow.run(fn)` gives the callback a scope of tx-bound repos + an `OutboxAppender`. Drizzle adapter = `db.transaction(tx => fn(makeScope(tx)))`. Services stop taking `EventBus`.
- **Event envelope:** the base `DomainEvent` in `@headless-lms/types` gains `id: string` + `occurredAt: string`, stamped by the `OutboxAppender` at append time (idempotency key + timestamp for handlers).
- **Ordering:** skip-past-failures — a failing row is backed off/retried while others flow; parked after `maxAttempts`.
- **Integrations atomicity:** folded in — credential-store writes + connection writes + outbox append share one transaction (removes the existing orphan-credential window).
- **Dead-letter:** log-only — parked rows stay in the table (`published_at IS NULL`, `attempts = maxAttempts`) and are logged; no admin/replay surface in this vertical.
- **`outbox.org_id`:** nullable (platform-level events may exist).
- **Baseline regen** (no incremental migration); regenerate `drizzle/0000_baseline.sql`.

## Schema — `adapters/db/schema/outbox.ts`

```sql
CREATE TABLE outbox (
  id              bigserial PRIMARY KEY,           -- commit-order polling key
  event_id        text NOT NULL UNIQUE,            -- genId("event"); consumer idempotency key
  type            text NOT NULL,
  org_id          text,                            -- nullable (platform events)
  payload         jsonb NOT NULL,                  -- the full self-contained DomainEvent
  occurred_at     timestamp NOT NULL DEFAULT now(),
  published_at    timestamp,                       -- NULL = pending
  attempts        integer NOT NULL DEFAULT 0,
  next_attempt_at timestamp NOT NULL DEFAULT now(),
  last_error      text
);
CREATE INDEX outbox_unpublished_idx ON outbox (next_attempt_at, id) WHERE published_at IS NULL;
```

Poll query: `SELECT ... WHERE published_at IS NULL AND next_attempt_at <= now() ORDER BY id LIMIT :n FOR UPDATE SKIP LOCKED`.

## Ports — `core/shared/ports.ts`

```ts
// The event as persisted/relayed. DomainEvent base gains id + occurredAt (see below).
export interface OutboxAppender {
  /** Append events to the outbox within the current unit of work. Stamps id + occurredAt. */
  append(events: DomainEvent[]): Promise<void>;
}

/** Runs `fn` inside one DB transaction; `scope` = tx-bound ports + the outbox appender. */
export interface UnitOfWork<Scope> {
  run<T>(fn: (scope: Scope & { outbox: OutboxAppender }) => Promise<T>): Promise<T>;
}

export interface OutboxMessage {
  id: string;            // the bigserial as string
  eventId: string;
  type: string;
  payload: DomainEvent;
  attempts: number;
}

export interface OutboxStore {
  fetchBatch(limit: number): Promise<OutboxMessage[]>;         // FOR UPDATE SKIP LOCKED, own tx
  markPublished(id: string): Promise<void>;
  markFailed(id: string, error: string, nextAttemptAt: Date): Promise<void>;
  deletePublishedBefore(cutoff: Date): Promise<number>;
}

export interface OutboxRelay {
  start(): void;
  stop(): Promise<void>;
}
```

`@headless-lms/types` `shared.ts` — base event:
```ts
export interface DomainEvent {
  type: string;
  id: string;         // stamped by OutboxAppender (genId("event"))
  occurredAt: string; // ISO, stamped at append
}
```
(Each concrete event already extends `DomainEvent`; `id`/`occurredAt` are populated by the appender, so producers construct events without them — the appender fills them. To keep producers ergonomic, events are appended as `Omit<E, "id"|"occurredAt">` and the appender returns/persists the full event.)

## Per-context tx-scoped scopes

Each context that emits events defines its tx-scoped port bundle (the repos it writes in a use case), e.g.:
```ts
// entitlements
interface EntitlementsTxScope { entitlements: EntitlementsRepository }
// integrations (multi-write)
interface IntegrationsTxScope { connections: ConnectionsRepository; credentials: CredentialStore }
```
The service is injected a `UnitOfWork<ThatScope>` instead of `(repo, events)`. A use case becomes:
```ts
async grant(orgId, input) {
  return this.uow.run(async ({ entitlements, outbox }) => {
    const enrollment = await entitlements.insert(orgId, input);
    await outbox.append([{ type: "enrollment.created", orgId, enrollment }]);
    return enrollment;
  });
}
```

## DbExecutor widening (adapters)

Promote the existing `structure.ts` pattern to a shared type:
```ts
type Tx = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];
export type DbExecutor = NodePgDatabase | Tx;
```
Drizzle repo constructors accept `DbExecutor` (mechanical widening). `DrizzleUnitOfWork` (`adapters/db/unit-of-work.ts`) implements `run` by opening `db.transaction` and constructing tx-bound repo instances + a `DrizzleOutboxAppender(tx)` for the scope.

## Adapters

- `adapters/db/repositories/outbox.ts` — `DrizzleOutboxAppender(tx)` (insert, stamping `event_id`/`occurred_at`), `DrizzleOutboxStore(db)` (batch fetch with `FOR UPDATE SKIP LOCKED` in its own tx, mark published/failed, retention delete).
- `adapters/db/unit-of-work.ts` — `DrizzleUnitOfWork` factory per context (or one generic factory parameterized by a `makeScope(tx)`), constructing the tx-scoped bundle.
- `adapters/events/outbox-relay.ts` — `PollingOutboxRelay(store, bus, config, logger)`: a `setTimeout`-chained loop that fetches a batch, dispatches each message to `bus.publish` (fan-out to subscribers), `markPublished` on success, `markFailed` with capped exponential backoff on error, parks (`attempts >= maxAttempts`, log-only) so the partial-index poll skips it; a separate retention sweep calls `deletePublishedBefore` on `cleanupIntervalMs`. Idempotent, re-entrancy-guarded, stops cleanly.
- `EventBus` (`adapters/events/index.ts`) is retained unchanged as the relay's in-process fan-out; subscribers register on it as before.

## Composition & lifecycle

- `composition/container.ts` — builds `DrizzleUnitOfWork` per emitting context, injects them into services (replacing the `eventBus` arg); constructs `DrizzleOutboxStore` + `PollingOutboxRelay`; exposes `outboxRelay` on the container. `eventBus` stays for subscribers + the relay.
- `http/server.ts` (`buildServer`) — `onClose` hook → `await outboxRelay.stop()`.
- `apps/api/src/main.ts` — **explicit `container.outboxRelay.start()` after `listen`** (NOT onReady — `apps/api gen:openapi` calls `app.ready()` on the real container, and an onReady autostart would poll during `pnpm gen:sdk`).

## Config

`ContainerConfig`/`ServerConfig` gains an `outbox` block, env-mapped in `apps/api/src/config.ts`:
```ts
outbox: {
  enabled: boolean;          // default true; false → relay.start() is a no-op
  pollIntervalMs: number;    // e.g. 1000
  batchSize: number;         // e.g. 100
  maxAttempts: number;       // e.g. 10 → park
  backoffBaseMs: number;     // exponential base
  backoffMaxMs: number;      // cap
  retentionDays: number;     // published rows older than this are swept
  cleanupIntervalMs: number; // sweep cadence
}
```

## Migration of publish sites (all 6)

| Site | Change |
|---|---|
| `entitlements.grant` | wrap insert + `outbox.append([enrollment.created])` in `uow.run` |
| `entitlements.setStatus` | wrap update + append (`enrollment.deleted`\|`updated`) |
| `integrations.connect` | credential insert + connection insert + append (`connection.created`) in one tx (folds atomicity) |
| `integrations.reconnect` | credential update + connection update + append (`connection.updated`) |
| `integrations.configure` | connection update + append (`connection.updated`) |
| `integrations.disconnect` | connection delete + credential destroy + append (`connection.removed`) |

Services no longer import/receive `EventBus`. `EnrollmentExpired` (declared, never published) is untouched — the future expiry sweep will use the same appender.

## Delivery semantics

At-least-once; handlers must be idempotent (keyed on `event.id`). Ordering: commit order (`ORDER BY id`) except a parked/failed message is skipped. No exactly-once. Retries: capped exponential backoff via `next_attempt_at`. Poison messages park (log-only) and stop consuming a poll slot via the partial index predicate.

## Testing

- `unit-of-work` / appender: a use case appends the event in the same tx as the write; a thrown error rolls back BOTH the domain write and the outbox row (fake tx or a real-DB integration test).
- `PollingOutboxRelay`: fetch→dispatch→markPublished on success; markFailed + backoff on handler throw; park at maxAttempts; retention sweep deletes old published rows. Fakes for `OutboxStore` + `EventBus`.
- Each migrated service test updated to the `UnitOfWork` fake (a `run` that invokes `fn` with fake repos + a capturing outbox appender), asserting the event is appended.
- Existing suite stays green; baseline regen keeps the schema in sync.

## Baseline regen

Add `outbox` to the schema barrel → wipe dev DB (`drop schema public cascade; create schema public`) → `rm -rf packages/server/drizzle/*` → `db:generate` (fresh `0000_baseline.sql`) → `db:migrate` → `seed` + `seed:dev`. Regenerate SDK only if a contract changes (none expected — outbox is internal).
