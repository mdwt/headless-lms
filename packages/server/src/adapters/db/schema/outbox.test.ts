import { describe, it, expect } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { outbox } from "./outbox.js";

describe("outbox schema", () => {
  const config = getTableConfig(outbox);

  it("is the outbox table with the polling columns", () => {
    expect(config.name).toBe("outbox");
    expect(config.columns.map((c) => c.name).sort()).toEqual([
      "attempts",
      "event_id",
      "id",
      "last_error",
      "next_attempt_at",
      "occurred_at",
      "org_id",
      "payload",
      "published_at",
      "type",
    ]);
  });

  it("keeps org_id nullable (platform-level events)", () => {
    const orgId = config.columns.find((c) => c.name === "org_id");
    expect(orgId?.notNull).toBe(false);
  });

  it("declares the partial unpublished index", () => {
    expect(config.indexes).toHaveLength(1);
    expect(config.indexes[0]?.config.name).toBe("outbox_unpublished_idx");
  });
});
