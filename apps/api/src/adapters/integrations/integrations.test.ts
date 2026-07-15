import { describe, it, expect } from "vitest";
import { stripe } from "./stripe/index.js";
import { slack } from "./slack/index.js";

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
