# @headless-lms/adapter-db

Drizzle/Postgres persistence adapter. Implements the outbound repository ports from
`@headless-lms/core` and ships the migrations for the LMS database.

It depends on `@headless-lms/core`, `drizzle-orm` and `pg` — never on the server or
any other adapter.

## Layout

| Path                  | What lives there                                                           |
| --------------------- | -------------------------------------------------------------------------- |
| `src/schema/`         | Drizzle tables, grouped by owning context, barrelled in `index.ts`         |
| `src/repositories/`   | One `Drizzle*Repository` per context port, plus pg error translation       |
| `src/client.ts`       | `createDb` — pool + drizzle instance; `Db`, `Tx`, `DbExecutor` types       |
| `src/unit-of-work.ts` | `DrizzleUnitOfWork` — transaction scope for the core `UnitOfWork` port     |
| `src/migrate.ts`      | `runMigrations(databaseUrl)` against the packaged `drizzle/` folder        |
| `drizzle/`            | Generated SQL migrations and snapshots (committed, shipped in the package) |

## Usage

```ts
import { createDb, runMigrations, DrizzleProgressRepository } from "@headless-lms/adapter-db";

await runMigrations(process.env.DATABASE_URL!);

const db = createDb(process.env.DATABASE_URL!);
const progress = new DrizzleProgressRepository(db, logger);
```

Repositories take a `DbExecutor`, so the same class works against the root `db` or a
transaction handle. `DrizzleUnitOfWork` builds a tx-bound scope, guaranteeing nothing
escapes the transaction:

```ts
const uow = new DrizzleUnitOfWork(db, (tx) => ({
  progress: new DrizzleProgressRepository(tx),
  outbox: new DrizzleOutboxRepository(tx),
}));

await uow.run(async ({ progress, outbox }) => {
  /* ... */
});
```

## Error translation

`repositories/pg-errors.ts` turns driver failures into domain errors — unique violations
become `ConflictError`, everything else becomes a `DbQueryError` carrying the SQL text and
structured pg fields but never the bind params (they can hold PII).

## Drift checks

`schema/drift.ts` provides compile-time assertions that a table's row type matches its
domain type from `@headless-lms/core/schemas`. A row field may be wider than the domain's,
never narrower, missing, or extra. Drift fails `pnpm typecheck` with the offending keys.

## Migration workflow

Push during dev, generate once at the end.

```bash
pnpm db:push       # apply schema changes straight to the dev database, no files
pnpm db:generate   # diff against the last committed snapshot → one migration
pnpm db:migrate    # apply pending migrations
```

While iterating locally, use `db:push`. When the schema is settled and ready to ship, run
`db:generate` once — it diffs against the last committed snapshot, so you get a single
migration containing everything since the previous release.

All three read `DATABASE_URL` from the repo-root `.env`.

## Tests

```bash
pnpm test        # vitest
pnpm typecheck
```
