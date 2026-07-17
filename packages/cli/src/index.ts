#!/usr/bin/env node
// The bin entry: env, dispatch, exit code. All logic lives in main.ts.
// Loads ./.env from the cwd if present (Node 22 native), so installations
// don't need --env-file gymnastics.
import { main } from "./main.js";

try {
  process.loadEnvFile();
} catch {
  // no .env in cwd — fine, env may come from the environment itself
}

process.exitCode = await main(process.argv.slice(2));
