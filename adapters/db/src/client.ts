// Drizzle client + connection. Owns connection pooling (Drizzle does not).
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { Logger } from "@headless-lms/core/shared/ports";
import { noopLogger } from "@headless-lms/core/shared/logger";

/** Transaction executor — the same query surface as the root db.
 *  (Promoted from the structure.ts repository's local alias.) */
export type Tx = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];

/** What a Drizzle repository executes against: the root db OR a transaction
 *  handle — tx-bound repo instances are how DrizzleUnitOfWork guarantees no
 *  statement escapes the transaction. */
export type DbExecutor = NodePgDatabase | Tx;

// Centralized schema — re-exported so the db adapter is the single source for tables.
export * as schema from "./schema/index.js";

export type Db = ReturnType<typeof createDb>;

export interface DatabasePoolOptions {
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export function createDb(
  connectionString: string,
  logger: Logger = noopLogger,
  poolOptions: DatabasePoolOptions = {},
) {
  const pool = new pg.Pool({ connectionString, ...poolOptions });
  pool.on("error", (error) => {
    logger.warn("database connection lost", { error: error.message });
  });
  return drizzle(pool);
}
