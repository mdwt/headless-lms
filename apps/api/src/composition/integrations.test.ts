import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadIntegrationsRegistry } from "./integrations.js";

/** Write a fake integration dir whose index.js (CJS) default-exports `body`. */
async function fakeIntegrationsDir(name: string, body: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "integrations-"));
  await mkdir(join(dir, name));
  await writeFile(join(dir, name, "index.js"), `module.exports = ${body};`);
  return dir;
}

describe("loadIntegrationsRegistry", () => {
  it("loads every integration under src/integrations/ keyed by directory name", async () => {
    const registry = await loadIntegrationsRegistry();
    expect(registry.list().map((i) => i.id)).toEqual(["slack", "stripe"]);
    expect(registry.get("stripe")?.validateConfig({ mode: "test" }).ok).toBe(true);
    expect(registry.get("strope")).toBeNull();
  });

  it("rejects an integration whose id does not match its directory name", async () => {
    const dir = await fakeIntegrationsDir(
      "mailchimp",
      `{ id: "mailchomp", configSchema: () => ({}), validateConfig: () => ({ ok: true }), actions: [] }`,
    );
    await expect(loadIntegrationsRegistry(dir)).rejects.toThrow(/must match its directory name/);
  });

  it("rejects an integration with a malformed action", async () => {
    const dir = await fakeIntegrationsDir(
      "mailchimp",
      `{ id: "mailchimp", configSchema: () => ({}), validateConfig: () => ({ ok: true }),
         actions: [{ id: "sendCampaign", inputSchema: () => ({}) }] }`,
    );
    await expect(loadIntegrationsRegistry(dir)).rejects.toThrow(/Integration port/);
  });
});
