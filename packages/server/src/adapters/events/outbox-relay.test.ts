import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PollingOutboxRelay, type PollingOutboxRelayConfig } from "./outbox-relay.js";
import { InMemoryEventBus } from "./index.js";
import type { Logger, OutboxMessage, OutboxStore } from "../../core/shared/ports.js";

const CONFIG: PollingOutboxRelayConfig = {
  enabled: true,
  pollIntervalMs: 1000,
  batchSize: 10,
};

function message(n: number, type = "enrollment.created", attempts = 0): OutboxMessage {
  const id = `evt_${n}`;
  return {
    id,
    attempts,
    payload: { type, id, orgId: "org-1", createdAt: "2026-07-22T00:00:00.000Z" },
  };
}

/** Sequential batches: call N of fetchBatch returns batches[N-1] (then []). */
function fakeStore(batches: OutboxMessage[][]): OutboxStore {
  let call = 0;
  return {
    fetchBatch: vi.fn(async () => batches[call++] ?? []),
    markProcessed: vi.fn(async () => {}),
    markFailed: vi.fn(async () => {}),
  };
}

function fakeLogger(): Logger {
  return { info: vi.fn(), error: vi.fn() };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-22T12:00:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("PollingOutboxRelay", () => {
  it("dispatches each message to bus subscribers and marks it processed", async () => {
    const store = fakeStore([[message(1)]]);
    const bus = new InMemoryEventBus();
    const seen: string[] = [];
    bus.subscribe("enrollment.created", async (e) => {
      seen.push(e.id);
    });
    const relay = new PollingOutboxRelay(store, bus, CONFIG, fakeLogger());
    relay.start();
    await vi.advanceTimersByTimeAsync(CONFIG.pollIntervalMs);
    expect(seen).toEqual(["evt_1"]);
    expect(store.markProcessed).toHaveBeenCalledWith("evt_1");
    await relay.stop();
  });

  it("dispatches in id order within a batch", async () => {
    const order: string[] = [];
    const store = fakeStore([[message(1), message(2), message(3)]]);
    const bus = new InMemoryEventBus();
    bus.subscribe("enrollment.created", async (e) => {
      order.push(e.id);
    });
    const relay = new PollingOutboxRelay(store, bus, CONFIG, fakeLogger());
    relay.start();
    await vi.advanceTimersByTimeAsync(CONFIG.pollIntervalMs);
    expect(order).toEqual(["evt_1", "evt_2", "evt_3"]);
    await relay.stop();
  });

  it("records a failure via markFailed (error + backoff), logs it, and keeps dispatching the rest", async () => {
    const store = fakeStore([[message(1, "boom.event"), message(2)]]);
    const bus = new InMemoryEventBus();
    bus.subscribe("boom.event", async () => {
      throw new Error("handler blew up");
    });
    const logger = fakeLogger();
    const relay = new PollingOutboxRelay(store, bus, CONFIG, logger);
    relay.start();
    await vi.advanceTimersByTimeAsync(CONFIG.pollIntervalMs);
    expect(store.markProcessed).toHaveBeenCalledTimes(1);
    expect(store.markProcessed).toHaveBeenCalledWith("evt_2");
    // First failure (attempts 0): retry after the 5s backoff base.
    expect(store.markFailed).toHaveBeenCalledWith(
      "evt_1",
      expect.stringContaining("handler blew up"),
      new Date(Date.now() + 5_000),
    );
    expect(logger.error).toHaveBeenCalledWith(
      "outbox dispatch failed",
      expect.objectContaining({
        id: "evt_1",
        type: "boom.event",
        error: expect.stringContaining("handler blew up"),
      }),
    );
    await relay.stop();
  });

  it("doubles the backoff per prior attempt: attempts=3 → 5s × 2³ = 40s", async () => {
    const store = fakeStore([[message(1, "boom.event", 3)]]);
    const bus = new InMemoryEventBus();
    bus.subscribe("boom.event", async () => {
      throw new Error("still broken");
    });
    const relay = new PollingOutboxRelay(store, bus, CONFIG, fakeLogger());
    relay.start();
    await vi.advanceTimersByTimeAsync(CONFIG.pollIntervalMs);
    expect(store.markFailed).toHaveBeenCalledWith(
      "evt_1",
      expect.stringContaining("still broken"),
      new Date(Date.now() + 40_000),
    );
    await relay.stop();
  });

  it("caps the backoff at 15 minutes", async () => {
    const store = fakeStore([[message(1, "boom.event", 9)]]);
    const bus = new InMemoryEventBus();
    bus.subscribe("boom.event", async () => {
      throw new Error("still broken");
    });
    const relay = new PollingOutboxRelay(store, bus, CONFIG, fakeLogger());
    relay.start();
    await vi.advanceTimersByTimeAsync(CONFIG.pollIntervalMs);
    expect(store.markFailed).toHaveBeenCalledWith(
      "evt_1",
      expect.stringContaining("still broken"),
      new Date(Date.now() + 15 * 60_000),
    );
    await relay.stop();
  });

  it("retries a failed message on the next tick", async () => {
    const store = fakeStore([[message(1, "boom.event")], [message(1, "boom.event")]]);
    const bus = new InMemoryEventBus();
    bus.subscribe("boom.event", async () => {
      throw new Error("still broken");
    });
    const relay = new PollingOutboxRelay(store, bus, CONFIG, fakeLogger());
    relay.start();
    await vi.advanceTimersByTimeAsync(CONFIG.pollIntervalMs);
    await vi.advanceTimersByTimeAsync(CONFIG.pollIntervalMs);
    expect(store.fetchBatch).toHaveBeenCalledTimes(2);
    expect(store.markProcessed).not.toHaveBeenCalled();
    await relay.stop();
  });

  it("re-polls immediately while batches come back full", async () => {
    const config = { ...CONFIG, batchSize: 1 };
    const store = fakeStore([[message(1)], [message(2)], []]);
    const relay = new PollingOutboxRelay(store, new InMemoryEventBus(), config, fakeLogger());
    relay.start();
    await vi.advanceTimersByTimeAsync(CONFIG.pollIntervalMs);
    // 1ms advances (vitest's advanceTimersByTimeAsync(0) does not fire a timer
    // due at the current fake time) — far below pollIntervalMs, so these still
    // prove the full-batch re-poll skips the idle interval.
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(store.fetchBatch).toHaveBeenCalledTimes(3);
    expect(store.markProcessed).toHaveBeenCalledTimes(2);
    await relay.stop();
  });

  it("stops cleanly: no polls after stop()", async () => {
    const store = fakeStore([[]]);
    const relay = new PollingOutboxRelay(store, new InMemoryEventBus(), CONFIG, fakeLogger());
    relay.start();
    await vi.advanceTimersByTimeAsync(CONFIG.pollIntervalMs);
    expect(store.fetchBatch).toHaveBeenCalledTimes(1);
    await relay.stop();
    await vi.advanceTimersByTimeAsync(CONFIG.pollIntervalMs * 5);
    expect(store.fetchBatch).toHaveBeenCalledTimes(1);
  });

  it("stop() before start() resolves (gen-openapi closes a never-started relay)", async () => {
    const relay = new PollingOutboxRelay(
      fakeStore([]),
      new InMemoryEventBus(),
      CONFIG,
      fakeLogger(),
    );
    await expect(relay.stop()).resolves.toBeUndefined();
  });

  it("start() is a no-op when disabled", async () => {
    const store = fakeStore([[message(1)]]);
    const relay = new PollingOutboxRelay(
      store,
      new InMemoryEventBus(),
      { ...CONFIG, enabled: false },
      fakeLogger(),
    );
    relay.start();
    await vi.advanceTimersByTimeAsync(CONFIG.pollIntervalMs * 3);
    expect(store.fetchBatch).not.toHaveBeenCalled();
    await relay.stop();
  });

  it("a second start() does not double the polling loop", async () => {
    const store = fakeStore([[]]);
    const relay = new PollingOutboxRelay(store, new InMemoryEventBus(), CONFIG, fakeLogger());
    relay.start();
    relay.start();
    await vi.advanceTimersByTimeAsync(CONFIG.pollIntervalMs);
    expect(store.fetchBatch).toHaveBeenCalledTimes(1);
    await relay.stop();
  });
});
