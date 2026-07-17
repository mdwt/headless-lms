import { describe, it, expect, vi, afterEach } from "vitest";
import stripe from "./stripe/index.js";
import slack from "./slack/index.js";

describe("integrations directory contract", () => {
  it("ids match their directory names (loader invariant)", () => {
    expect(stripe.id).toBe("stripe");
    expect(slack.id).toBe("slack");
  });

  it("each exposes its secrets as JSON Schema", () => {
    expect(stripe.secretsSchema()).toMatchObject({ type: "object", required: ["apiKey"] });
    expect(slack.secretsSchema()).toMatchObject({ type: "object", required: ["botToken"] });
  });

  it("slack's secrets schema documents the required scopes", () => {
    const schema = slack.secretsSchema() as {
      properties: { botToken: { description?: string } };
    };
    expect(schema.properties.botToken.description).toMatch(/chat:write/);
    expect(schema.properties.botToken.description).toMatch(/channels:read/);
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

  it("has a human-readable description", () => {
    expect(action.description.length).toBeGreaterThan(0);
  });

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

describe("slack postEventNotification action", () => {
  const action = slack.actions.find((a) => a.id === "postEventNotification")!;
  const ctx = {
    secrets: { botToken: "xoxb-token" },
    config: { defaultChannel: "#general" },
  };
  const createdEvent = {
    type: "enrollment.created",
    enrollment: {
      firstName: "Ada",
      lastName: "Lovelace",
      studentEmail: "ada@example.com",
      courseTitle: "Calculus 101",
      grantedAt: "2026-07-01T09:00:00Z",
    },
  };

  afterEach(() => vi.unstubAllGlobals());

  function stubSlackOk() {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, ts: "1720000000.000200" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("declares the event union in its input JSON Schema", () => {
    const schema = action.inputSchema() as {
      required?: string[];
      properties: { event: { anyOf?: unknown[]; oneOf?: unknown[] } };
    };
    expect(schema.required).toContain("event");
    const variants = schema.properties.event.anyOf ?? schema.properties.event.oneOf;
    expect(variants).toHaveLength(4);
  });

  it("posts the formatted message (fallback text + blocks) with the bot token", async () => {
    const fetchMock = stubSlackOk();
    const out = await action.invoke(ctx, { channel: "#alerts", event: createdEvent });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://slack.com/api/chat.postMessage");
    expect(init.headers).toMatchObject({ authorization: "Bearer xoxb-token" });
    const body = JSON.parse(init.body as string) as {
      channel: string;
      text: string;
      blocks: unknown[];
    };
    expect(body.channel).toBe("#alerts");
    expect(body.text).toBe("✅ Ada Lovelace enrolled in Calculus 101");
    expect(body.blocks[0]).toMatchObject({ type: "header" });
    expect(out).toEqual({ channel: "#alerts", ts: "1720000000.000200" });
  });

  it("falls back to the connection's defaultChannel", async () => {
    const fetchMock = stubSlackOk();
    await action.invoke(ctx, { event: createdEvent });
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as { channel: string };
    expect(body.channel).toBe("#general");
  });

  it("rejects an unknown event type before any external call", async () => {
    const fetchMock = stubSlackOk();
    await expect(
      action.invoke(ctx, { event: { ...createdEvent, type: "course.published" } }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("slack listChannels action", () => {
  const action = slack.actions.find((a) => a.id === "listChannels")!;
  const ctx = {
    secrets: { botToken: "xoxb-token" },
    config: { defaultChannel: "#general" },
  };

  afterEach(() => vi.unstubAllGlobals());

  it("lists channels with the bot token and maps the response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          channels: [
            { id: "C1", name: "general", is_private: false },
            { id: "C2", name: "alerts", is_private: false },
          ],
          response_metadata: { next_cursor: "cursor-2" },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const out = await action.invoke(ctx, { limit: 50 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://slack.com/api/conversations.list?types=public_channel&exclude_archived=true&limit=50",
    );
    expect(init.headers).toMatchObject({ authorization: "Bearer xoxb-token" });
    expect(out).toEqual({
      channels: [
        { id: "C1", name: "general" },
        { id: "C2", name: "alerts" },
      ],
      nextCursor: "cursor-2",
    });
  });

  it("omits nextCursor when slack returns an empty cursor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ ok: true, channels: [], response_metadata: { next_cursor: "" } }),
          { status: 200 },
        ),
      ),
    );
    const out = await action.invoke(ctx, {});
    expect(out).toEqual({ channels: [] });
  });

  it("passes the pagination cursor through", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, channels: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await action.invoke(ctx, { cursor: "cursor-2" });
    expect(fetchMock.mock.calls[0]?.[0]).toContain("cursor=cursor-2");
  });

  it("surfaces a missing_scope error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: false, error: "missing_scope" }), { status: 200 }),
      ),
    );
    await expect(action.invoke(ctx, {})).rejects.toThrow(/missing_scope/);
  });
});
