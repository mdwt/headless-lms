import { afterEach, describe, expect, it } from "vitest";
import net from "node:net";
import pg from "pg";
import type { JsonValue } from "@headless-lms/core/shared/ports";
import { PostgresPubSub } from "./index.js";

const url = process.env.TEST_DATABASE_URL;

const open: PostgresPubSub[] = [];
const servers: net.Server[] = [];

function pubsub(
  connectionString = url!,
  options: { pingIntervalMs?: number; pingTimeoutMs?: number } = {},
) {
  const instance = new PostgresPubSub({ connectionString, ...options });
  open.push(instance);
  return instance;
}

function inbox(instance: PostgresPubSub, channel: string) {
  const messages: JsonValue[] = [];
  let resets = 0;
  const unsubscribe = instance.subscribe(
    channel,
    (message) => messages.push(message),
    () => {
      resets += 1;
    },
  );
  return {
    messages,
    resets: () => resets,
    unsubscribe,
  };
}

async function until(check: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error("timed out");
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

const settle = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

function listenerOf(instance: PostgresPubSub): pg.Client | null {
  return (instance as unknown as { listener: pg.Client | null }).listener;
}

function pidOf(instance: PostgresPubSub): number {
  return (listenerOf(instance) as unknown as { processID: number }).processID;
}

async function admin<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function serve(
  handler: (socket: net.Socket) => void,
): Promise<{ server: net.Server; port: number }> {
  const server = net.createServer(handler);
  servers.push(server);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: (server.address() as net.AddressInfo).port });
    });
  });
}

function through(port: number): string {
  const target = new URL(url!);
  target.hostname = "127.0.0.1";
  target.port = String(port);
  return target.toString();
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((instance) => instance.stop().catch(() => {})));
  for (const server of servers.splice(0)) {
    server.close();
  }
});

describe.skipIf(!url)("PostgresPubSub", () => {
  it("delivers to every subscriber of the channel on both instances and no other channel", async () => {
    const a = pubsub();
    const b = pubsub();
    await a.start();
    await b.start();
    const onA = inbox(a, "chats");
    const onB = inbox(b, "chats");
    const other = inbox(b, "posts");
    await a.publish("chats", { chatId: "cht_1" });
    await until(() => onA.messages.length === 1 && onB.messages.length === 1);
    await settle();
    expect(onA.messages).toEqual([{ chatId: "cht_1" }]);
    expect(onB.messages).toEqual([{ chatId: "cht_1" }]);
    expect(other.messages).toEqual([]);
  });

  it("delivers nothing to an unsubscribed handler", async () => {
    const a = pubsub();
    await a.start();
    const gone = inbox(a, "chats");
    const kept = inbox(a, "chats");
    gone.unsubscribe();
    await a.publish("chats", 1);
    await until(() => kept.messages.length === 1);
    await settle();
    expect(gone.messages).toEqual([]);
  });

  it("delivers a 50 KB message of quotes, backslashes, emoji and CJK whole and once", async () => {
    const a = pubsub();
    const b = pubsub();
    await a.start();
    await b.start();
    const onB = inbox(b, "chats");
    const unit = `"quoted" \\back\\slash 👋🏽 漢字かな交じり文 `;
    const body = unit.repeat(Math.ceil(50_000 / Buffer.byteLength(unit)));
    expect(Buffer.byteLength(body)).toBeGreaterThan(50_000);
    await a.publish("chats", { body });
    await until(() => onB.messages.length === 1);
    await settle();
    expect(onB.messages).toEqual([{ body }]);
  });

  it("reconnects after its listening connection is terminated, resets and keeps delivering", async () => {
    const a = pubsub();
    await a.start();
    const onA = inbox(a, "chats");
    const pid = pidOf(a);
    await admin((client) => client.query("SELECT pg_terminate_backend($1)", [pid]));
    await until(() => onA.resets() === 1, 10_000);
    await a.publish("chats", "after");
    await until(() => onA.messages.length === 1);
    expect(onA.messages).toEqual(["after"]);
    expect(pidOf(a)).not.toBe(pid);
  });

  it("reconnects and resets when its listener stops receiving without an error", async () => {
    const a = pubsub(url, { pingIntervalMs: 300, pingTimeoutMs: 300 });
    await a.start();
    const onA = inbox(a, "chats");
    const stalled = listenerOf(a) as unknown as { connection: { stream: net.Socket } };
    stalled.connection.stream.pause();
    await until(() => onA.resets() === 1, 10_000);
    await a.publish("chats", "after");
    await until(() => onA.messages.length === 1);
    stalled.connection.stream.destroy();
  });

  it("publishes without being started and reaches a listening instance", async () => {
    const a = pubsub();
    const b = pubsub();
    await b.start();
    const onB = inbox(b, "chats");
    await a.publish("chats", "hello");
    await until(() => onB.messages.length === 1);
    expect(onB.messages).toEqual(["hello"]);
  });

  it("starts while Postgres is down and connects with a reset once it is back", async () => {
    const target = new URL(url!);
    let up = false;
    const { port } = await serve((socket) => {
      if (!up) {
        socket.destroy();
        return;
      }
      const upstream = net.connect(Number(target.port || 5432), target.hostname);
      socket.pipe(upstream).pipe(socket);
      upstream.on("error", () => socket.destroy());
      socket.on("error", () => upstream.destroy());
    });
    const a = pubsub(through(port));
    const onA = inbox(a, "chats");
    await a.start();
    expect(listenerOf(a)).toBeNull();
    up = true;
    await until(() => onA.resets() === 1, 15_000);
    await a.publish("chats", "back");
    await until(() => onA.messages.length === 1);
  }, 20_000);

  it("rejects a publish against an unreachable database within about 2 s", async () => {
    const held: net.Socket[] = [];
    const { port } = await serve((socket) => {
      held.push(socket);
    });
    const a = pubsub(through(port));
    const started = Date.now();
    await expect(a.publish("chats", "lost")).rejects.toThrow();
    const took = Date.now() - started;
    expect(took).toBeGreaterThanOrEqual(1500);
    expect(took).toBeLessThan(3000);
    for (const socket of held) {
      socket.destroy();
    }
  });

  it("closes its listening connection and its pool on stop", async () => {
    const a = pubsub();
    await a.start();
    await a.publish("chats", "warm");
    const pid = pidOf(a);
    await a.stop();
    const rows = await admin(
      async (client) =>
        (await client.query("SELECT pid FROM pg_stat_activity WHERE pid = $1", [pid])).rows,
    );
    expect(rows).toEqual([]);
    const pool = (a as unknown as { pool: pg.Pool }).pool;
    expect(pool.totalCount).toBe(0);
    await expect(a.publish("chats", "late")).rejects.toThrow();
  });

  it("does nothing on stop when never started", async () => {
    const a = pubsub();
    await expect(a.stop()).resolves.toBeUndefined();
  });
});
