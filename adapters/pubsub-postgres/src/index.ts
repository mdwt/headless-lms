import { randomUUID } from "node:crypto";
import pg from "pg";
import type { JsonValue, Logger, PubSub } from "@headless-lms/core/shared/ports";
import { describeError, noopLogger } from "@headless-lms/core/shared/logger";

const PG_CHANNEL = "hlms_pubsub";
const PART_SIZE = 7800;
const PART_TTL_MS = 10_000;
const PING_INTERVAL_MS = 30_000;
const PING_TIMEOUT_MS = 10_000;
const BACKOFF_MIN_MS = 1000;
const BACKOFF_MAX_MS = 30_000;
const PUBLISH_TIMEOUT_MS = 2000;

export interface PostgresPubSubOptions {
  connectionString: string;
  logger?: Logger;
  pingIntervalMs?: number;
  pingTimeoutMs?: number;
}

type Envelope =
  | { c: string; d: string }
  | { c: string; id: string; i: number; n: number; d: string }
  | { p: string };

interface Subscriber {
  handler: (message: JsonValue) => void;
  onReset: () => void;
}

interface PendingParts {
  channel: string;
  parts: (string | undefined)[];
  received: number;
  timer: NodeJS.Timeout;
}

function encode(message: JsonValue): string {
  return Buffer.from(JSON.stringify(message), "utf8").toString("base64");
}

function decode(data: string): JsonValue {
  return JSON.parse(Buffer.from(data, "base64").toString("utf8")) as JsonValue;
}

export class PostgresPubSub implements PubSub {
  private readonly connectionString: string;
  private readonly logger: Logger;
  private readonly pingIntervalMs: number;
  private readonly pingTimeoutMs: number;
  private readonly pool: pg.Pool;
  private readonly instanceId = randomUUID();
  private readonly subscribers = new Map<string, Set<Subscriber>>();
  private readonly partials = new Map<string, PendingParts>();
  private listener: pg.Client | null = null;
  private connecting: pg.Client | null = null;
  private started = false;
  private stopped = false;
  private attempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private pingDeadline: NodeJS.Timeout | null = null;
  private pendingPing: string | null = null;

  constructor(options: PostgresPubSubOptions) {
    this.connectionString = options.connectionString;
    this.logger = options.logger ?? noopLogger;
    this.pingIntervalMs = options.pingIntervalMs ?? PING_INTERVAL_MS;
    this.pingTimeoutMs = options.pingTimeoutMs ?? PING_TIMEOUT_MS;
    this.pool = new pg.Pool({
      connectionString: options.connectionString,
      max: 2,
      connectionTimeoutMillis: PUBLISH_TIMEOUT_MS,
      statement_timeout: PUBLISH_TIMEOUT_MS,
      query_timeout: PUBLISH_TIMEOUT_MS,
      allowExitOnIdle: true,
    });
    this.pool.on("error", (error) => {
      this.logger.warn("pubsub pool connection failed", { error: describeError(error) });
    });
  }

  async publish(channel: string, message: JsonValue): Promise<void> {
    const data = encode(message);
    if (data.length <= PART_SIZE) {
      await this.notify([{ c: channel, d: data }]);
      return;
    }
    const id = randomUUID();
    const n = Math.ceil(data.length / PART_SIZE);
    const parts: Envelope[] = [];
    for (let i = 0; i < n; i += 1) {
      parts.push({ c: channel, id, i, n, d: data.slice(i * PART_SIZE, (i + 1) * PART_SIZE) });
    }
    await this.notify(parts);
  }

  subscribe(
    channel: string,
    handler: (message: JsonValue) => void,
    onReset: () => void,
  ): () => void {
    const subscriber: Subscriber = { handler, onReset };
    const list = this.subscribers.get(channel) ?? new Set<Subscriber>();
    list.add(subscriber);
    this.subscribers.set(channel, list);
    return () => {
      list.delete(subscriber);
      if (list.size === 0 && this.subscribers.get(channel) === list) {
        this.subscribers.delete(channel);
      }
    };
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;
    this.pingTimer = setInterval(() => void this.ping(), this.pingIntervalMs);
    this.pingTimer.unref();
    await this.connect(true);
  }

  async stop(): Promise<void> {
    if (!this.started || this.stopped) {
      return;
    }
    this.stopped = true;
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.clearPing();
    this.dropPartials();
    const client = this.listener;
    this.listener = null;
    if (client) {
      client.removeAllListeners("end");
      try {
        await client.query("UNLISTEN *");
      } catch (error) {
        this.logger.debug("pubsub unlisten failed", { error: describeError(error) });
      }
      await client.end().catch(() => {});
    }
    await this.pool.end();
    this.logger.info("pubsub stopped");
  }

  private async notify(envelopes: Envelope[]): Promise<void> {
    if (envelopes.length === 1) {
      await this.pool.query("SELECT pg_notify($1, $2)", [PG_CHANNEL, JSON.stringify(envelopes[0])]);
      return;
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const envelope of envelopes) {
        await client.query("SELECT pg_notify($1, $2)", [PG_CHANNEL, JSON.stringify(envelope)]);
      }
      await client.query("COMMIT");
      client.release();
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      client.release(error as Error);
      throw error;
    }
  }

  private async connect(initial: boolean): Promise<void> {
    if (this.stopped) {
      return;
    }
    const client = new pg.Client({ connectionString: this.connectionString, keepAlive: true });
    this.connecting = client;
    client.on("error", (error) => this.lost(client, describeError(error)));
    client.on("end", () => this.lost(client, "connection ended"));
    client.on("notification", (message) => {
      if (client === this.listener && message.channel === PG_CHANNEL && message.payload) {
        this.receive(message.payload);
      }
    });
    try {
      await client.connect();
      await client.query(`LISTEN ${PG_CHANNEL}`);
    } catch (error) {
      if (this.connecting === client) {
        this.connecting = null;
        this.logger.warn("pubsub connect failed", { error: describeError(error) });
        this.discard(client);
        this.scheduleReconnect();
      }
      return;
    }
    if (this.connecting !== client || this.stopped) {
      this.discard(client);
      return;
    }
    this.connecting = null;
    this.listener = client;
    this.attempts = 0;
    this.logger.info("pubsub listening", { reconnect: !initial });
    if (!initial) {
      this.reset();
    }
  }

  private lost(client: pg.Client, reason: string): void {
    if (client !== this.listener) {
      return;
    }
    this.listener = null;
    this.clearPing();
    this.dropPartials();
    this.logger.warn("pubsub listener lost", { reason });
    this.discard(client);
    this.scheduleReconnect();
  }

  private discard(client: pg.Client): void {
    client.removeAllListeners("notification");
    client.removeAllListeners("end");
    client.removeAllListeners("error");
    client.on("error", () => {});
    void client.end().catch(() => {});
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) {
      return;
    }
    const cap = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** this.attempts);
    this.attempts += 1;
    const delay = Math.random() * cap;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect(false);
    }, delay);
    this.reconnectTimer.unref();
  }

  private reset(): void {
    for (const list of this.subscribers.values()) {
      for (const subscriber of [...list]) {
        try {
          subscriber.onReset();
        } catch (error) {
          this.logger.error("pubsub reset handler failed", { error: describeError(error) });
        }
      }
    }
  }

  private async ping(): Promise<void> {
    const client = this.listener;
    if (!client || this.pendingPing) {
      return;
    }
    const id = randomUUID();
    this.pendingPing = id;
    this.pingDeadline = setTimeout(() => {
      if (this.pendingPing === id) {
        this.pendingPing = null;
        this.pingDeadline = null;
        this.lost(client, "ping not received");
      }
    }, this.pingTimeoutMs);
    this.pingDeadline.unref();
    try {
      await this.notify([{ p: `${this.instanceId}:${id}` }]);
    } catch (error) {
      this.logger.warn("pubsub ping failed", { error: describeError(error) });
    }
  }

  private clearPing(): void {
    if (this.pingDeadline) {
      clearTimeout(this.pingDeadline);
    }
    this.pingDeadline = null;
    this.pendingPing = null;
  }

  private receive(payload: string): void {
    let envelope: Envelope;
    try {
      envelope = JSON.parse(payload) as Envelope;
    } catch {
      this.logger.warn("pubsub payload unreadable");
      return;
    }
    if ("p" in envelope) {
      if (envelope.p === `${this.instanceId}:${this.pendingPing}`) {
        this.clearPing();
      }
      return;
    }
    if ("n" in envelope) {
      this.part(envelope);
      return;
    }
    this.deliver(envelope.c, envelope.d);
  }

  private part(envelope: { c: string; id: string; i: number; n: number; d: string }): void {
    let partial = this.partials.get(envelope.id);
    if (!partial) {
      const timer = setTimeout(() => {
        this.partials.delete(envelope.id);
        this.logger.warn("pubsub message parts dropped", { channel: envelope.c });
      }, PART_TTL_MS);
      timer.unref();
      partial = {
        channel: envelope.c,
        parts: new Array<string | undefined>(envelope.n).fill(undefined),
        received: 0,
        timer,
      };
      this.partials.set(envelope.id, partial);
    }
    if (partial.parts[envelope.i] === undefined) {
      partial.parts[envelope.i] = envelope.d;
      partial.received += 1;
    }
    if (partial.received < partial.parts.length) {
      return;
    }
    clearTimeout(partial.timer);
    this.partials.delete(envelope.id);
    this.deliver(partial.channel, partial.parts.join(""));
  }

  private deliver(channel: string, data: string): void {
    const list = this.subscribers.get(channel);
    if (!list || list.size === 0) {
      return;
    }
    let message: JsonValue;
    try {
      message = decode(data);
    } catch {
      this.logger.warn("pubsub message unreadable", { channel });
      return;
    }
    for (const subscriber of [...list]) {
      try {
        subscriber.handler(message);
      } catch (error) {
        this.logger.error("pubsub handler failed", { channel, error: (error as Error).message });
      }
    }
  }

  private dropPartials(): void {
    for (const partial of this.partials.values()) {
      clearTimeout(partial.timer);
    }
    this.partials.clear();
  }
}
