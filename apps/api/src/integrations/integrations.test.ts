import { describe, it, expect, vi, afterEach } from "vitest";
import stripe from "./stripe/index.js";
import slack from "./slack/index.js";

describe("integrations directory contract", () => {
  it("ids match their directory names (loader invariant)", () => {
    expect(stripe.id).toBe("stripe");
    expect(slack.id).toBe("slack");
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

describe("slack postMessageToChannel action", () => {
  const action = slack.actions.find((a) => a.id === "postMessageToChannel")!;
  const ctx = {
    secrets: { botToken: "xoxb-token" },
    config: { defaultChannel: "#general" },
  };

  afterEach(() => vi.unstubAllGlobals());

  function stubSlackOk() {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, ts: "1720000000.000100" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("declares its input/output as JSON Schema", () => {
    expect(action.inputSchema()).toMatchObject({ type: "object", required: ["text"] });
    expect(action.outputSchema()).toMatchObject({
      type: "object",
      required: ["channel", "ts"],
    });
  });

  it("posts with the revealed bot token and the given channel", async () => {
    const fetchMock = stubSlackOk();
    const out = await action.invoke(ctx, { channel: "#alerts", text: "hi" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://slack.com/api/chat.postMessage",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer xoxb-token" }),
        body: JSON.stringify({ channel: "#alerts", text: "hi" }),
      }),
    );
    expect(out).toEqual({ channel: "#alerts", ts: "1720000000.000100" });
  });

  it("falls back to the connection's defaultChannel", async () => {
    const fetchMock = stubSlackOk();
    const out = await action.invoke(ctx, { text: "hi" });
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ channel: "#general", text: "hi" }),
    );
    expect(out).toMatchObject({ channel: "#general" });
  });

  it("rejects invalid input before any external call", async () => {
    const fetchMock = stubSlackOk();
    await expect(action.invoke(ctx, { text: "" })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces a slack API error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: false, error: "channel_not_found" }), { status: 200 }),
      ),
    );
    await expect(action.invoke(ctx, { text: "hi" })).rejects.toThrow(/channel_not_found/);
  });
});
