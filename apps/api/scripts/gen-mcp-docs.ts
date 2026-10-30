import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mcpCatalogue } from "@headless-lms/server";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const outPath = join(repoRoot, "apps", "website", "lib", "mcp-catalogue.json");

writeFileSync(outPath, `${JSON.stringify(mcpCatalogue(), null, 2)}\n`);
console.log(`Wrote ${outPath}`);
