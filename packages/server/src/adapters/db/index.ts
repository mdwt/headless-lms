// Drizzle client + connection. Owns connection pooling (Drizzle does not).
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

/** Transaction executor — the same query surface as the root db.
 *  (Promoted from the structure.ts repository's local alias.) */
export type Tx = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];

/** What a Drizzle repository executes against: the root db OR a transaction
 *  handle — tx-bound repo instances are how DrizzleUnitOfWork guarantees no
 *  statement escapes the transaction. */
export type DbExecutor = NodePgDatabase | Tx;

// Centralized schema — re-exported so the db adapter is the single source for tables.
export * as schema from './schema/index.js';

export type Db = ReturnType<typeof createDb>;

export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString });
  return drizzle(pool);
}
