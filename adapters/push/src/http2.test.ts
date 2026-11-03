import { createServer, type Http2Server } from "node:http2";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { http2Transport } from "./http2.js";

let server: Http2Server | null = null;

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = null;
});

async function listen(
  handler: (headers: Record<string, unknown>, body: string) => { status: number; body: string },
): Promise<{ origin: string; sessions: () => number }> {
  let sessions = 0;
  server = createServer();
  server.on("session", () => {
    sessions += 1;
  });
  server.on("stream", (stream, headers) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => {
      const reply = handler(headers, Buffer.concat(chunks).toString("utf8"));
      stream.respond({ ":status": reply.status });
      stream.end(reply.body);
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { origin: `http://127.0.0.1:${port}`, sessions: () => sessions };
}

describe("http2Transport", () => {
  it("posts the body with the headers and returns the status and body", async () => {
    const seen: { headers: Record<string, unknown>; body: string }[] = [];
    const { origin } = await listen((headers, body) => {
      seen.push({ headers, body });
      return { status: 410, body: '{"reason":"Unregistered"}' };
    });

    const response = await http2Transport()(
      origin,
      "/3/device/abc",
      { "apns-topic": "com.a" },
      "{}",
    );

    expect(response).toEqual({ status: 410, body: '{"reason":"Unregistered"}' });
    expect(seen[0]!.headers[":method"]).toBe("POST");
    expect(seen[0]!.headers[":path"]).toBe("/3/device/abc");
    expect(seen[0]!.headers["apns-topic"]).toBe("com.a");
    expect(seen[0]!.body).toBe("{}");
  });

  it("reuses one connection per origin", async () => {
    const { origin, sessions } = await listen(() => ({ status: 200, body: "" }));
    const transport = http2Transport();

    await transport(origin, "/a", {}, "");
    await transport(origin, "/b", {}, "");

    expect(sessions()).toBe(1);
  });

  it("rejects when the origin cannot be reached", async () => {
    await expect(http2Transport()("http://127.0.0.1:1", "/a", {}, "")).rejects.toThrow();
  });
});
