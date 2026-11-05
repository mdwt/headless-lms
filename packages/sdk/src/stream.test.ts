import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createClient, createConfig } from "./generated/client";
import { Chats } from "./index";

describe("streamMemberChatEvents", () => {
  it("is declared as an event stream", () => {
    const spec = JSON.parse(readFileSync(new URL("../openapi.json", import.meta.url), "utf8"));
    const operation = spec.paths["/api/member/communities/{communityId}/chats/events"].get;
    expect(operation.operationId).toBe("streamMemberChatEvents");
    expect(Object.keys(operation.responses["200"].content)).toEqual(["text/event-stream"]);
  });

  it("yields each event's data with its type", async () => {
    const body = [
      'event: ready\ndata: {"type":"ready","heartbeatMs":25000}\n\n',
      ": ping\n\n",
      'event: unread\ndata: {"type":"unread","unread":3,"requests":1}\n\n',
    ].join("");
    const requested: string[] = [];
    const client = createClient(
      createConfig({
        baseUrl: "https://api.example.com",
        fetch: async (input: RequestInfo | URL) => {
          requested.push(input instanceof Request ? input.url : String(input));
          return new Response(body, { headers: { "content-type": "text/event-stream" } });
        },
      }),
    );
    const { stream } = await Chats.streamMemberChatEvents(
      { communityId: "cmy_1" },
      { client, sseMaxRetryAttempts: 0 },
    );
    const events = [];
    for await (const event of stream) {
      events.push(event.type);
    }
    expect(events).toEqual(["ready", "unread"]);
    expect(requested).toEqual([
      "https://api.example.com/api/member/communities/cmy_1/chats/events",
    ]);
  });
});
