import { afterEach, describe, expect, it } from "vitest";
import {
  createServer,
  type IncomingHttpHeaders,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { FetchWebhookSender, WebhookAddressRefusedError } from "./index.js";

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

const local = (timeoutMs?: number) =>
  new FetchWebhookSender({ allowPrivateNetwork: true, timeoutMs });

describe("FetchWebhookSender", () => {
  it("POSTs the body with the given headers and returns the response status", async () => {
    const { url, received } = await listen((res) => res.writeHead(204).end());

    const response = await local().send({
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
    const response = await local().send({ url, headers: {}, body: "{}" });
    expect(response).toEqual({ status: 500 });
  });

  it("does not follow redirects", async () => {
    const { url, received } = await listen((res) =>
      res.writeHead(307, { location: "http://127.0.0.1:1/elsewhere" }).end(),
    );
    const response = await local().send({ url, headers: {}, body: "{}" });
    expect(response).toEqual({ status: 307 });
    expect(received).toHaveLength(1);
  });

  it("rejects when the endpoint does not answer within the timeout", async () => {
    const { url } = await listen(() => {});
    await expect(local(50).send({ url, headers: {}, body: "{}" })).rejects.toThrow();
  });

  it("reaches a hostname through its resolved address", async () => {
    const { url, received } = await listen((res) => res.writeHead(200).end());
    const response = await local().send({
      url: url.replace("127.0.0.1", "localhost"),
      headers: {},
      body: "{}",
    });
    expect(response).toEqual({ status: 200 });
    expect(received).toHaveLength(1);
  });

  it("refuses loopback and private addresses unless allowed", async () => {
    const { url, received } = await listen((res) => res.writeHead(204).end());
    const sender = new FetchWebhookSender();
    await expect(sender.send({ url, headers: {}, body: "{}" })).rejects.toThrow(
      WebhookAddressRefusedError,
    );
    await expect(
      sender.send({ url: url.replace("127.0.0.1", "localhost"), headers: {}, body: "{}" }),
    ).rejects.toThrow(WebhookAddressRefusedError);
    for (const target of [
      "http://10.0.0.1/hooks",
      "http://169.254.169.254/latest/meta-data",
      "http://[::1]/hooks",
      "http://[::ffff:192.168.0.1]/hooks",
      "http://[fd00:ec2::254]/hooks",
      "http://0.0.0.0/hooks",
    ]) {
      await expect(sender.send({ url: target, headers: {}, body: "{}" })).rejects.toThrow(
        WebhookAddressRefusedError,
      );
    }
    expect(received).toHaveLength(0);
  });
});
