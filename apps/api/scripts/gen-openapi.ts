import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createContainer, buildServer } from "@headless-lms/server";
import { loadServerConfig } from "../src/config.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const outPath = join(repoRoot, "packages", "sdk", "openapi.json");

const config = loadServerConfig();
const app = await buildServer(config, await createContainer(config));
await app.ready();
const document = app.swagger();
writeFileSync(outPath, `${JSON.stringify(document, null, 2)}\n`);
await app.close();
console.log(`Wrote ${outPath}`);
