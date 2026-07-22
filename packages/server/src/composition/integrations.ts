// Builds the IntegrationsRegistry by scanning an installation-owned plugins
// directory — the home of third-party integrations, deliberately outside core
// (not the domain) and outside adapters. Each subdirectory is one integration:
// its name IS the integration id, and its index module's default export must
// satisfy the core Integration port. The directory itself is passed in by
// composition options (this package ships no plugins of its own); loaded once
// at startup, anything malformed fails the boot, not a request.
import { readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { createIntegrationsRegistry } from "../core/integrations/index.js";
import type { Integration, IntegrationsRegistry } from "../core/integrations/index.js";
import type { Logger } from "../core/shared/ports.js";
import { noopLogger } from "../core/shared/logger.js";

function isIntegration(value: unknown): value is Integration {
  const it = value as Integration | undefined;
  return (
    typeof it?.id === "string" &&
    typeof it?.configSchema === "function" &&
    typeof it?.secretsSchema === "function" &&
    typeof it?.validateConfig === "function" &&
    Array.isArray(it?.actions) &&
    it.actions.every(
      (action) =>
        typeof action?.id === "string" &&
        typeof action?.description === "string" &&
        typeof action?.inputSchema === "function" &&
        typeof action?.outputSchema === "function" &&
        typeof action?.invoke === "function",
    ) &&
    new Set(it.actions.map((action) => action.id)).size === it.actions.length
  );
}

export async function loadIntegrations(
  dir?: string,
  logger: Logger = noopLogger,
): Promise<IntegrationsRegistry> {
  if (!dir) {
    logger.debug("no plugins directory configured — zero integrations");
    return createIntegrationsRegistry([]);
  }
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    // A fresh installation's plugins/ dir has no .ts files yet (just a
    // README), so the build never creates dist/plugins/ — that's zero
    // installed integrations, not a boot failure.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      logger.debug("plugins directory missing — zero integrations", { dir });
      return createIntegrationsRegistry([]);
    }
    throw err;
  }
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
  logger.info("integrations loaded", {
    count: integrations.length,
    ids: integrations.map((integration) => integration.id),
  });
  return createIntegrationsRegistry(integrations);
}
