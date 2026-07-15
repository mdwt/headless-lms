// Builds the IntegrationsRegistry by scanning src/integrations/ — the home of
// integrations that are not part of the core system. Each subdirectory is one
// integration: its name IS the integration id, and its index module's default
// export must satisfy the core Integration port. Loaded once at startup;
// anything malformed fails the boot, not a request.
import { readdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { createIntegrationsRegistry } from "../core/integrations/index.js";
import type { Integration, IntegrationsRegistry } from "../core/integrations/index.js";

const INTEGRATIONS_DIR = fileURLToPath(new URL("../integrations/", import.meta.url));

function isIntegration(value: unknown): value is Integration {
  const it = value as Integration | undefined;
  return (
    typeof it?.id === "string" &&
    typeof it?.configSchema === "function" &&
    typeof it?.validateConfig === "function" &&
    Array.isArray(it?.actions) &&
    it.actions.every(
      (action) =>
        typeof action?.id === "string" &&
        typeof action?.inputSchema === "function" &&
        typeof action?.outputSchema === "function" &&
        typeof action?.invoke === "function",
    ) &&
    new Set(it.actions.map((action) => action.id)).size === it.actions.length
  );
}

export async function loadIntegrationsRegistry(
  dir: string = INTEGRATIONS_DIR,
): Promise<IntegrationsRegistry> {
  const entries = await readdir(dir, { withFileTypes: true });
  const integrations: Integration[] = [];
  for (const entry of entries.filter((e) => e.isDirectory())) {
    // index.ts when running from source (tsx/vitest), index.js from dist.
    const files = await readdir(join(dir, entry.name));
    const index = files.find((f) => f === "index.ts" || f === "index.js");
    if (!index) throw new Error(`integration "${entry.name}" has no index module`);
    const mod = (await import(pathToFileURL(join(dir, entry.name, index)).href)) as {
      default?: unknown;
    };
    if (!isIntegration(mod.default)) {
      throw new Error(
        `integration "${entry.name}" must default-export an object satisfying the Integration port ` +
          `(id, configSchema, validateConfig, actions[] with unique ids and input/output schemas)`,
      );
    }
    if (mod.default.id !== entry.name) {
      throw new Error(
        `integration id "${mod.default.id}" must match its directory name "${entry.name}"`,
      );
    }
    integrations.push(mod.default);
  }
  return createIntegrationsRegistry(integrations);
}
