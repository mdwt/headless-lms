import { describe, it, expect } from "vitest";
import stripe from "./stripe/index.js";
import slack from "./slack/index.js";

// Per-integration behaviour is tested where the integration lives (the slack
// actions in @headless-lms/plugin-slack). This suite covers what the plugin
// folder promises the loader: ids matching directory names and the schema
// surface each integration exposes.
describe("integrations directory contract", () => {
  it("ids match their directory names (loader invariant)", () => {
    expect(stripe.id).toBe("stripe");
    expect(slack.id).toBe("slack");
  });

  it("each exposes its secrets as JSON Schema", () => {
    expect(stripe.secretsSchema()).toMatchObject({ type: "object", required: ["apiKey"] });
    expect(slack.secretsSchema()).toMatchObject({ type: "object", required: ["botToken"] });
  });

  it("each exposes its config as JSON Schema", () => {
    expect(stripe.configSchema()).toMatchObject({
      type: "object",
      properties: { mode: { enum: ["live", "test"] } },
    });
    expect(slack.configSchema()).toMatchObject({
      type: "object",
      required: ["defaultChannel"],
    });
  });

  it("each exposes invocable actions with unique ids", () => {
    for (const integration of [stripe, slack]) {
      const ids = integration.actions.map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect(slack.actions.map((a) => a.id)).toEqual(["postToChannel", "listChannels"]);
  });
});

describe("integration config validators", () => {
  it("stripe accepts a valid config and rejects an invalid mode", () => {
    expect(stripe.validateConfig({ mode: "test" }).ok).toBe(true);
    expect(stripe.validateConfig(undefined).ok).toBe(true); // defaults apply
    const bad = stripe.validateConfig({ mode: "sandbox" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0]).toMatch(/^mode:/);
  });

  it("slack requires a defaultChannel", () => {
    expect(slack.validateConfig({ defaultChannel: "#general" }).ok).toBe(true);
    expect(slack.validateConfig({}).ok).toBe(false);
  });
});
