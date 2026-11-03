import { describe, it, expect } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { digestRuns, subscriptions } from "./discussion.js";
import { communities } from "./content.js";
import { orgUsers } from "./organizations.js";

describe("discussion schema — digest_runs", () => {
  const config = getTableConfig(digestRuns);

  it("keys one row per community by (org_id, community_id)", () => {
    expect(config.name).toBe("digest_runs");
    expect(config.primaryKeys).toHaveLength(1);
    expect(config.primaryKeys[0]!.columns.map((column) => column.name)).toEqual([
      "org_id",
      "community_id",
    ]);
  });

  it("holds a required last_due_at with its time zone", () => {
    const lastDueAt = config.columns.find((column) => column.name === "last_due_at");
    expect(lastDueAt?.notNull).toBe(true);
    expect(lastDueAt?.getSQLType()).toBe("timestamp with time zone");
  });

  it("cascades from its community", () => {
    expect(config.foreignKeys).toHaveLength(1);
    const fk = config.foreignKeys[0]!;
    const reference = fk.reference();
    expect(getTableConfig(reference.foreignTable).name).toBe(getTableConfig(communities).name);
    expect(reference.columns.map((column) => column.name)).toEqual(["org_id", "community_id"]);
    expect(reference.foreignColumns.map((column) => column.name)).toEqual(["org_id", "id"]);
    expect(fk.onDelete).toBe("cascade");
  });
});

describe("discussion schema — subscriptions", () => {
  const config = getTableConfig(subscriptions);

  it("keys one row per person and item, and indexes the item by state", () => {
    expect(config.primaryKeys[0]!.columns.map((column) => column.name)).toEqual([
      "org_id",
      "org_user_id",
      "item_type",
      "item_id",
    ]);
    expect(
      config.indexes.map((index) =>
        index.config.columns.map((column) => (column as { name: string }).name),
      ),
    ).toEqual([["org_id", "item_type", "item_id", "state"]]);
  });

  it("cascades from the person and has no key to the item", () => {
    expect(config.foreignKeys).toHaveLength(1);
    const fk = config.foreignKeys[0]!;
    const reference = fk.reference();
    expect(getTableConfig(reference.foreignTable).name).toBe(getTableConfig(orgUsers).name);
    expect(reference.columns.map((column) => column.name)).toEqual(["org_id", "org_user_id"]);
    expect(fk.onDelete).toBe("cascade");
  });
});
