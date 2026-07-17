import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { loadIntegrations } from "@headless-lms/server";
import slack from "./slack/index.js";

// Per-integration behaviour is tested where the integration lives (the slack
// actions in @headless-lms/plugin-slack). This suite covers what the plugin
// folder promises the loader: ids matching directory names and the schema
// surface each integration exposes.
describe("integrations directory contract", () => {
  it("ids match their directory names (loader invariant)", () => {
    expect(slack.id).toBe("slack");
  });

  it("each exposes its secrets as JSON Schema", () => {
    expect(slack.secretsSchema()).toMatchObject({ type: "object", required: ["botToken"] });
  });

  it("each exposes its config as JSON Schema", () => {
    expect(slack.configSchema()).toMatchObject({
      type: "object",
      required: ["defaultChannel"],
    });
  });

  it("each exposes invocable actions with unique ids", () => {
    const ids = slack.actions.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(["postToChannel", "listChannels"]);
  });
});

describe("loadIntegrations over the real plugins directory", () => {
  it("discovers exactly the slack integration", async () => {
    const registry = await loadIntegrations(fileURLToPath(new URL("./", import.meta.url)));
    expect(registry.list().map((i) => i.id)).toEqual(["slack"]);
  });
});

describe("integration config validators", () => {
  it("slack requires a defaultChannel", () => {
    expect(slack.validateConfig({ defaultChannel: "#general" }).ok).toBe(true);
    expect(slack.validateConfig({}).ok).toBe(false);
  });
});
