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
