import { afterEach, describe, expect, it } from "vitest";
import {
  createServer,
  type IncomingHttpHeaders,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { FetchWebhookSender } from "./index.js";

interface Received {
  method: string | undefined;
  headers: IncomingHttpHeaders;
  body: string;
}

let server: Server | undefined;

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

async function listen(
  respond: (res: ServerResponse) => void,
): Promise<{ url: string; received: Received[] }> {
  const received: Received[] = [];
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received.push({ method: req.method, headers: req.headers, body });
      respond(res);
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/hooks`, received };
}

describe("FetchWebhookSender", () => {
  it("POSTs the body with the given headers and returns the response status", async () => {
    const { url, received } = await listen((res) => res.writeHead(204).end());

    const response = await new FetchWebhookSender().send({
      url,
      headers: { "content-type": "application/json", "webhook-id": "evt_1" },
      body: '{"ok":true}',
    });

    expect(response).toEqual({ status: 204 });
    expect(received).toEqual([
      {
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json",
          "webhook-id": "evt_1",
        }),
        body: '{"ok":true}',
      },
    ]);
  });

  it("returns a non-2xx status instead of throwing", async () => {
    const { url } = await listen((res) => res.writeHead(500).end("boom"));
    const response = await new FetchWebhookSender().send({ url, headers: {}, body: "{}" });
    expect(response).toEqual({ status: 500 });
  });

  it("does not follow redirects", async () => {
    const { url, received } = await listen((res) =>
      res.writeHead(307, { location: "http://127.0.0.1:1/elsewhere" }).end(),
    );
    const response = await new FetchWebhookSender().send({ url, headers: {}, body: "{}" });
    expect(response).toEqual({ status: 307 });
    expect(received).toHaveLength(1);
  });

  it("rejects when the endpoint does not answer within the timeout", async () => {
    const { url } = await listen(() => {});
    await expect(
      new FetchWebhookSender(50).send({ url, headers: {}, body: "{}" }),
    ).rejects.toThrow();
  });
});
