import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { UnitOfWork } from "@headless-lms/core/shared/ports";
import type { Tx } from "./client.js";
import { translateDbError } from "./repositories/pg-errors.js";

export class DrizzleUnitOfWork<Scope> implements UnitOfWork<Scope> {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly makeScope: (tx: Tx) => Scope,
  ) {}

  async run<T>(fn: (scope: Scope) => Promise<T>): Promise<T> {
    try {
      return await this.db.transaction((tx) => fn(this.makeScope(tx)));
    } catch (err) {
      throw translateDbError(err);
    }
  }
}
