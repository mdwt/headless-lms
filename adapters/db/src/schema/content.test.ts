import { describe, it, expect } from "vitest";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { courses, modules, activities, activityAssets } from "./content.js";

/** The FK on `table` that points at `target`, identified by table name. */
function fkTo(table: PgTable, target: PgTable) {
  const targetName = getTableConfig(target).name;
  return getTableConfig(table).foreignKeys.find(
    (fk) => getTableConfig(fk.reference().foreignTable).name === targetName,
  );
}

describe("content schema — course tree delete", () => {
  it("cascades modules when their course is deleted", () => {
    expect(fkTo(modules, courses)?.onDelete).toBe("cascade");
  });

  it("cascades activities when their module is deleted", () => {
    expect(fkTo(activities, modules)?.onDelete).toBe("cascade");
  });

  it("cascades activity-asset links when their activity is deleted", () => {
    expect(fkTo(activityAssets, activities)?.onDelete).toBe("cascade");
  });

  it("does not cascade assets themselves — the link cascades, the asset survives", () => {
    const assetFk = getTableConfig(activityAssets).foreignKeys.find(
      (fk) => getTableConfig(fk.reference().foreignTable).name === "assets",
    );
    expect(assetFk?.onDelete).toBe("no action");
  });
});
