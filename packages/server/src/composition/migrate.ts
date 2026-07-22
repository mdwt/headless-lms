// Runs the drizzle migrations shipped inside this package against the
// installation's database. Fails loudly and legibly — this is the first
// command every new installation runs.
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

/** drizzle/ sits at the package root: ../../drizzle from src/composition AND dist/composition. */
export function migrationsFolder(): string {
  return fileURLToPath(new URL('../../drizzle/', import.meta.url));
}

export async function runMigrations(databaseUrl: string): Promise<void> {
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set. Put it in your .env (e.g. postgres://postgres:postgres@localhost:8005/headless_lms) and re-run.',
    );
  }
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: migrationsFolder() });
  } catch (err) {
    throw new Error(
      `Migration failed against ${databaseUrl.replace(/\/\/.*@/, '//***@')}: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  } finally {
    await pool.end();
  }
}
