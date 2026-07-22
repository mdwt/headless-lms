import { describe, it, expect, vi } from "vitest";
import { DrizzleOutboxAppender, stampEvent } from "./outbox.js";
import type { DbExecutor } from "../index.js";
import type { NewDomainEvent } from "../../../core/shared/ports.js";

describe("stampEvent", () => {
  it("stamps a fresh evt_ id and the append time as ISO occurredAt", () => {
    const at = new Date("2026-07-22T12:00:00.000Z");
    const stamped = stampEvent({ type: "enrollment.created", orgId: "org-1" }, at);
    expect(stamped.id).toMatch(/^evt_[0-9A-Za-z]{27}$/);
    expect(stamped.occurredAt).toBe("2026-07-22T12:00:00.000Z");
    expect(stamped.type).toBe("enrollment.created");
    expect(stamped.orgId).toBe("org-1");
  });

  it("stamps a unique id per call", () => {
    expect(stampEvent({ type: "t" }).id).not.toBe(stampEvent({ type: "t" }).id);
  });
});

function fakeTx() {
  const values = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values }));
  return { tx: { insert } as unknown as DbExecutor, insert, values };
}

describe("DrizzleOutboxAppender", () => {
  it("inserts one stamped row per event, mirroring type/orgId and eventId=payload.id", async () => {
    const { tx, values } = fakeTx();
    const events = [
      { type: "enrollment.created", orgId: "org-1" } as NewDomainEvent,
      { type: "connection.removed", orgId: "org-2" } as NewDomainEvent,
    ];
    await new DrizzleOutboxAppender(tx).append(events);
    const rows = values.mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ type: "enrollment.created", orgId: "org-1" });
    expect(rows[1]).toMatchObject({ type: "connection.removed", orgId: "org-2" });
    const payload = rows[0]!["payload"] as { id: string; occurredAt: string; orgId: string };
    expect(payload.id).toMatch(/^evt_/);
    expect(payload.orgId).toBe("org-1");
    expect(rows[0]!["eventId"]).toBe(payload.id);
    expect(rows[0]!["occurredAt"]).toEqual(new Date(payload.occurredAt));
  });

  it("defaults orgId to null for platform-level events", async () => {
    const { tx, values } = fakeTx();
    await new DrizzleOutboxAppender(tx).append([{ type: "platform.ping" }]);
    const rows = values.mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(rows[0]!["orgId"]).toBeNull();
  });

  it("is a no-op for an empty event list", async () => {
    const { tx, insert } = fakeTx();
    await new DrizzleOutboxAppender(tx).append([]);
    expect(insert).not.toHaveBeenCalled();
  });
});
