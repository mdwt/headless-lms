import { describe, it, expect } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { digestRuns } from "./discussion.js";
import { communities } from "./content.js";

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
