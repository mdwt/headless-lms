import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PollingOutboxRelay, orderingKey, type PollingOutboxRelayConfig } from "./outbox-relay.js";
import { InMemoryEventBus } from "./index.js";
import type { Logger, OutboxMessage, OutboxStore } from "@headless-lms/core/shared/ports";

const CONFIG: PollingOutboxRelayConfig = {
  enabled: true,
  pollIntervalMs: 1000,
  batchSize: 10,
  concurrency: 4,
};

function message(n: number, type = "entitlement.created", attempts = 0): OutboxMessage {
  const id = `evt_${n}`;
  return {
    id,
    attempts,
    payload: {
      type,
      version: 1,
      id,
      orgId: "org-1",
      occurredAt: "2026-07-22T00:00:00.000Z",
      data: {},
    },
  };
}

function event(n: number, type: string, data: Record<string, unknown>): OutboxMessage {
  const base = message(n, type);
  return { ...base, payload: { ...base.payload, data } };
}

function gate(): { promise: Promise<void>; open: () => void } {
  let open = () => {};
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
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
  const logger: Logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => logger,
  };
  return logger;
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
    bus.subscribe("entitlement.created", async (e) => {
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
    bus.subscribe("entitlement.created", async (e) => {
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

describe("PollingOutboxRelay logging baseline", () => {
  it("logs each successful dispatch at info", async () => {
    const store = fakeStore([[message(1)]]);
    const bus = new InMemoryEventBus();
    bus.subscribe("entitlement.created", async () => {});
    const logger = fakeLogger();
    const relay = new PollingOutboxRelay(store, bus, CONFIG, logger);
    relay.start();
    await vi.advanceTimersByTimeAsync(CONFIG.pollIntervalMs);
    expect(logger.info).toHaveBeenCalledWith("outbox event dispatched", {
      id: "evt_1",
      type: "entitlement.created",
    });
    expect(logger.debug).toHaveBeenCalledWith("outbox batch fetched", { count: 1 });
    await relay.stop();
  });

  it("warns when a failure exhausts the retry budget", async () => {
    const store = fakeStore([[message(1, "boom.event", 9)]]); // attempts=9 → this failure parks it
    const bus = new InMemoryEventBus();
    bus.subscribe("boom.event", async () => {
      throw new Error("still broken");
    });
    const logger = fakeLogger();
    const relay = new PollingOutboxRelay(store, bus, CONFIG, logger);
    relay.start();
    await vi.advanceTimersByTimeAsync(CONFIG.pollIntervalMs);
    expect(logger.warn).toHaveBeenCalledWith(
      "outbox event parked",
      expect.objectContaining({ id: "evt_1", type: "boom.event", attempt: 10 }),
    );
    expect(logger.error).not.toHaveBeenCalled();
    await relay.stop();
  });
});

describe("orderingKey", () => {
  it("keys chat events by chat, post and comment events by post, and the rest by their item", () => {
    expect(
      orderingKey(event(1, "discussion.message.sent", { id: "msg_1", chatId: "cht_1" }).payload),
    ).toBe("org-1:cht_1");
    expect(orderingKey(event(2, "discussion.chat.updated", { id: "cht_1" }).payload)).toBe(
      "org-1:cht_1",
    );
    expect(orderingKey(event(3, "discussion.post.published", { id: "pst_1" }).payload)).toBe(
      "org-1:pst_1",
    );
    expect(
      orderingKey(
        event(4, "discussion.comment.created", { id: "cmt_1", postId: "pst_1", activityId: null })
          .payload,
      ),
    ).toBe("org-1:pst_1");
    expect(
      orderingKey(
        event(5, "discussion.comment.created", { id: "cmt_2", postId: null, activityId: "act_1" })
          .payload,
      ),
    ).toBe("org-1:act_1");
    expect(orderingKey(event(6, "entitlement.created", { id: "ent_1" }).payload)).toBe(
      "org-1:ent_1",
    );
    expect(orderingKey(event(7, "discussion.digest.due", { communityId: "cmy_1" }).payload)).toBe(
      "org-1:evt_7",
    );
  });
});

describe("PollingOutboxRelay concurrency", () => {
  it("keeps events of one key in order while other keys run alongside", async () => {
    const first = gate();
    const seen: string[] = [];
    const store = fakeStore([
      [
        event(1, "discussion.message.sent", { chatId: "cht_a" }),
        event(2, "discussion.message.sent", { chatId: "cht_a" }),
        event(3, "discussion.message.sent", { chatId: "cht_b" }),
      ],
    ]);
    const bus = new InMemoryEventBus();
    bus.subscribe("discussion.message.sent", async (e) => {
      seen.push(`start ${e.id}`);
      if (e.id === "evt_1") {
        await first.promise;
      }
      seen.push(`end ${e.id}`);
    });
    const relay = new PollingOutboxRelay(store, bus, CONFIG, fakeLogger());
    relay.start();
    await vi.advanceTimersByTimeAsync(CONFIG.pollIntervalMs);
    expect(seen).toEqual(["start evt_1", "start evt_3", "end evt_3"]);
    first.open();
    await vi.advanceTimersByTimeAsync(1);
    expect(seen).toEqual([
      "start evt_1",
      "start evt_3",
      "end evt_3",
      "end evt_1",
      "start evt_2",
      "end evt_2",
    ]);
    expect(store.markProcessed).toHaveBeenCalledTimes(3);
    await relay.stop();
  });

  it("dispatches no more than the configured number of events at once", async () => {
    const release = gate();
    let running = 0;
    let most = 0;
    const store = fakeStore([
      Array.from({ length: 10 }, (_, i) =>
        event(i + 1, "discussion.post.published", { id: `pst_${i}` }),
      ),
    ]);
    const bus = new InMemoryEventBus();
    bus.subscribe("discussion.post.published", async () => {
      running++;
      most = Math.max(most, running);
      await release.promise;
      running--;
    });
    const relay = new PollingOutboxRelay(store, bus, { ...CONFIG, concurrency: 3 }, fakeLogger());
    relay.start();
    await vi.advanceTimersByTimeAsync(CONFIG.pollIntervalMs);
    expect(running).toBe(3);
    release.open();
    await vi.advanceTimersByTimeAsync(1);
    expect(most).toBe(3);
    expect(store.markProcessed).toHaveBeenCalledTimes(10);
    await relay.stop();
  });

  it("waits for the whole batch before fetching the next one", async () => {
    const release = gate();
    const store = fakeStore([
      [event(1, "discussion.post.published", { id: "pst_1" })],
      [event(2, "discussion.post.published", { id: "pst_1" })],
    ]);
    const bus = new InMemoryEventBus();
    bus.subscribe("discussion.post.published", async (e) => {
      if (e.id === "evt_1") {
        await release.promise;
      }
    });
    const relay = new PollingOutboxRelay(store, bus, { ...CONFIG, batchSize: 1 }, fakeLogger());
    relay.start();
    await vi.advanceTimersByTimeAsync(CONFIG.pollIntervalMs);
    await vi.advanceTimersByTimeAsync(CONFIG.pollIntervalMs);
    expect(store.fetchBatch).toHaveBeenCalledTimes(1);
    release.open();
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(vi.mocked(store.markProcessed).mock.calls).toEqual([["evt_1"], ["evt_2"]]);
    await relay.stop();
  });

  it("isolates a failure: the failed event backs off, the rest of its key and other keys go on", async () => {
    const store = fakeStore([
      [
        event(1, "discussion.message.sent", { chatId: "cht_a" }),
        event(2, "discussion.message.sent", { chatId: "cht_a" }),
        event(3, "discussion.message.sent", { chatId: "cht_b" }),
      ],
    ]);
    const bus = new InMemoryEventBus();
    bus.subscribe("discussion.message.sent", async (e) => {
      if (e.id === "evt_1") {
        throw new Error("handler blew up");
      }
    });
    const relay = new PollingOutboxRelay(store, bus, CONFIG, fakeLogger());
    relay.start();
    await vi.advanceTimersByTimeAsync(CONFIG.pollIntervalMs);
    expect(store.markFailed).toHaveBeenCalledTimes(1);
    expect(store.markFailed).toHaveBeenCalledWith(
      "evt_1",
      expect.stringContaining("handler blew up"),
      new Date(Date.now() + 5_000),
    );
    expect(store.markProcessed).toHaveBeenCalledWith("evt_2");
    expect(store.markProcessed).toHaveBeenCalledWith("evt_3");
    await relay.stop();
  });

  it("keeps dispatching when recording a failure fails", async () => {
    const store = fakeStore([
      [
        event(1, "boom.event", { id: "pst_1" }),
        event(2, "boom.event", { id: "pst_1" }),
        message(3),
      ],
    ]);
    vi.mocked(store.markFailed).mockRejectedValueOnce(new Error("db down"));
    const bus = new InMemoryEventBus();
    bus.subscribe("boom.event", async (e) => {
      if (e.id === "evt_1") {
        throw new Error("handler blew up");
      }
    });
    const logger = fakeLogger();
    const relay = new PollingOutboxRelay(store, bus, CONFIG, logger);
    relay.start();
    await vi.advanceTimersByTimeAsync(CONFIG.pollIntervalMs);
    expect(logger.error).toHaveBeenCalledWith(
      "outbox failure not recorded",
      expect.objectContaining({ id: "evt_1", markError: expect.stringContaining("db down") }),
    );
    expect(store.markProcessed).toHaveBeenCalledWith("evt_2");
    expect(store.markProcessed).toHaveBeenCalledWith("evt_3");
    await relay.stop();
  });
});
