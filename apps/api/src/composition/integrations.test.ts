import { describe, it, expect } from "vitest";
import { loadIntegrationsRegistry } from "./integrations.js";

describe("loadIntegrationsRegistry", () => {
  it("loads every integration under src/integrations/ keyed by directory name", async () => {
    const registry = await loadIntegrationsRegistry();
    expect(registry.list().map((i) => i.id)).toEqual(["slack", "stripe"]);
    expect(registry.get("stripe")?.validateConfig({ mode: "test" }).ok).toBe(true);
    expect(registry.get("strope")).toBeNull();
  });
});
