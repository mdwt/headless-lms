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
    await runMigrations(process.env.DATABASE_URL ?? "");
    console.log("Migrations applied.");
    break;
  case "seed":
    await runSeed(process.env.DATABASE_URL ?? "");
    console.log("Seed complete.");
    break;
  default:
    console.error(`Usage: headless-lms <migrate|seed>\nUnknown command: ${command ?? "(none)"}`);
    process.exit(1);
}
