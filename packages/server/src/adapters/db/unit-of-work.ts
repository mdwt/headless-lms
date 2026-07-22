import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { UnitOfWork } from "../../core/shared/ports.js";
import type { Tx } from "./index.js";

export class DrizzleUnitOfWork<Scope> implements UnitOfWork<Scope> {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly makeScope: (tx: Tx) => Scope,
  ) {}

  run<T>(fn: (scope: Scope) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => fn(this.makeScope(tx)));
  }
}
