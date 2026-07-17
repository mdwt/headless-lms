#!/usr/bin/env node
// The installation CLI: `headless-lms <command>`.
// Loads ./.env from the cwd if present (Node 22 native), so installations
// don't need --env-file gymnastics.
import { runMigrations } from "./migrate.js";
import { runSeed } from "./seed.js";

try {
  process.loadEnvFile();
} catch {
  // no .env in cwd — fine, env may come from the environment itself
}

const command = process.argv[2];

switch (command) {
  case "migrate":
    try {
      await runMigrations(process.env.DATABASE_URL ?? "");
      console.log("Migrations applied.");
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    break;
  case "seed":
    try {
      await runSeed(process.env.DATABASE_URL ?? "");
      console.log("Seed complete.");
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    break;
  default:
    console.error(`Usage: headless-lms <migrate|seed>\nUnknown command: ${command ?? "(none)"}`);
    process.exit(1);
}
