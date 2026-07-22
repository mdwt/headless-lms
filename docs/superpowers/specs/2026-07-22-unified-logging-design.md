# Unified Structured Logging

Replace the minimal two-method `Logger` port and the ad-hoc console shims with a
proper leveled, contextual logger, backed by a single shared pino instance, and
inject it into every service, repository, and adapter.

## Current state

- Fastify runs its own default pino (`Fastify({ logger: true })`) — HTTP logs only.
- `core/shared/ports.ts` has a two-method `Logger` (`info`/`error`), consumed
  only by the outbox relay, wired to a bare `console.log`/`console.error` shim
  in the container.
- The MCP route calls `console.error` directly.
- No log statements anywhere in core services, reporting, or repositories.

## The port (`core/shared/ports.ts`)

```ts
export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}
```

Convention: errors go in meta under the `err` key — pino's standard serializer
renders `type`/`message`/`stack`.

## The adapter (`adapters/logging/index.ts`)

- `PinoLogger implements Logger` — thin wrapper over a pino instance;
  `child(bindings)` wraps `pino.child(bindings)`.
- `createRootLogger(level)` — builds the root pino instance (JSON output,
  standard `err` serializer) and returns `{ instance, logger }`: the raw pino
  instance (for Fastify) and its `PinoLogger` wrapper (the port).
- `pino` becomes a direct dependency of `packages/server` (already present
  transitively via Fastify).

## Config & wiring — one stream

- `Config` gains `logging?: { level?: "debug" | "info" | "warn" | "error" }`,
  resolved against a default of `"info"` (same resolve-with-defaults pattern as
  `OutboxConfig`). `apps/api` maps a `LOG_LEVEL` env var onto it.
- `createContainer` calls `createRootLogger` first. `Container` exposes:
  - `logger: Logger` — the root port.
  - `loggerInstance` — the raw pino instance for Fastify.
- `buildServer` switches to `Fastify({ loggerInstance })`, so HTTP request
  logs, the error handler's `request.log.error`, domain logs, and the outbox
  relay all share one stream, one format, one level.
- The MCP route's `console.error` becomes `request.log.error`.
- Seed scripts keep `console.log` — they are CLI output, not server logs.
- The container's ad-hoc `relayLogger` console shim is deleted.

## Injection — everywhere, child-bound

Every core service, reporting service, Drizzle repository, and adapter (email,
storage, outbox relay, auth org-admin/hooks where they do meaningful work)
takes a `Logger` as its last constructor parameter. The container binds each
one a child with a single `module` key:

| Component            | Binding                                |
| -------------------- | -------------------------------------- |
| Core services        | `{ module: "<context>.service" }`      |
| Repositories         | `{ module: "<context>.repo" }`         |
| Reporting services   | `{ module: "reporting.<name>" }`       |
| Email adapter        | `{ module: "email" }`                  |
| Storage adapter      | `{ module: "storage" }`                |
| Outbox relay         | `{ module: "outbox.relay" }`           |
| Integration loading  | `{ module: "integrations.loader" }`    |

## Logging baseline

- **info** — every domain mutation with its key identifiers: course/activity
  created/updated/archived, entitlement granted/revoked, student created, org
  mirrored, progress recorded, asset stored, integration
  connected/reconnected/configured/disconnected, outbox event dispatched.
  Reads do not log at info — the HTTP request log covers them.
- **warn** — domain-rule rejections and recoverable oddities: event parked
  after max retries, unknown integration id at load, duplicate enrollment.
- **error** — adapter/infra failures: outbox dispatch failure, email send
  failure, storage errors, integration hook crashes.
- **debug** — chatty detail: relay poll batches, repository-level notes,
  integration loader scanning.

## Testing

- `core/shared/logger.ts` (runtime code in core, like the error classes):
  exports `noopLogger` and `createCapturingLogger()` (records
  `{ level, msg, meta }` entries for assertions). Unit tests inject one of
  these; existing service/repository tests gain the extra constructor arg.
- `adapters/logging/index.test.ts`: `PinoLogger` maps levels correctly,
  `child()` merges bindings, `err` serialization works.
- `container.test.ts`: services receive module-bound children;
  `logging.level` reaches pino.
