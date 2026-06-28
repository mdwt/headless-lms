// Emits the OpenAPI spec from the live Fastify route schemas. Builds the app
// and waits for `ready()` (no port is bound), then reads @fastify/swagger's
// generated document. Output feeds the SDK generator (`@headless-lms/api-sdk`).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildServer } from "../src/http/server.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const outPath = join(repoRoot, "packages", "sdk", "openapi.json");

const app = buildServer();
await app.ready();
const document = app.swagger();
writeFileSync(outPath, `${JSON.stringify(document, null, 2)}\n`);
await app.close();
console.log(`Wrote ${outPath}`);
