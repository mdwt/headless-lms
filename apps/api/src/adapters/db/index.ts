// Drizzle client + connection. Owns connection pooling (Drizzle does not).
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

// Centralized schema — re-exported so the db adapter is the single source for tables.
export * as schema from "./schema/index.js";

export type Db = ReturnType<typeof createDb>;

export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString });
  return drizzle(pool);
}
