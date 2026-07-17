// Re-exports the db adapter for inbound entry points (cli, workers, cron)
// that need a raw connection outside the full container — e.g. the seed
// script inserts directly via the schema rather than through service ports.
// Inbound code may not import adapters/ directly (boundary rule), so this
// thin composition-layer re-export is the sanctioned path.
export { createDb, schema, type Db } from "../adapters/db/index.js";
