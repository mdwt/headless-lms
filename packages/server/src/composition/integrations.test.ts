import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadIntegrations } from "./integrations.js";

/** Write a fake integration dir whose index.js (CJS) default-exports `body`. */
async function fakeIntegrationsDir(name: string, body: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "integrations-"));
  await mkdir(join(dir, name));
  await writeFile(join(dir, name, "index.js"), `module.exports = ${body};`);
  return dir;
}

describe("loadIntegrations", () => {
  it("returns an empty registry when no plugins dir is given", async () => {
    const registry = await loadIntegrations();
    expect(registry.list()).toEqual([]);
  });

  it("rejects an integration whose id does not match its directory name", async () => {
    const dir = await fakeIntegrationsDir(
      "mailchimp",
      `{ id: "mailchomp", configSchema: () => ({}), secretsSchema: () => ({}), validateConfig: () => ({ ok: true }), actions: [] }`,
    );
    await expect(loadIntegrations(dir)).rejects.toThrow(/must match its directory name/);
  });

  it("rejects an integration with a malformed action", async () => {
    const dir = await fakeIntegrationsDir(
      "mailchimp",
      `{ id: "mailchimp", configSchema: () => ({}), secretsSchema: () => ({}), validateConfig: () => ({ ok: true }),
         actions: [{ id: "sendCampaign", inputSchema: () => ({}) }] }`,
    );
    await expect(loadIntegrations(dir)).rejects.toThrow(/Integration port/);
  });
});
