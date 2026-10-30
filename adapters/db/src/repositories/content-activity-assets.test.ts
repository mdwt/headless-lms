import { describe, it, expect } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { ConflictError } from "@headless-lms/core/shared/errors";
import { DrizzleContentRepository } from "./content.js";

function repoRefusingLinks(detail?: string) {
  const client = {
    async query(config: string | { text: string }) {
      const text = typeof config === "string" ? config : config.text;
      if (text.startsWith('insert into "activity_assets"')) {
        throw Object.assign(new Error("violates foreign key constraint"), {
          code: "23503",
          ...(detail ? { detail } : {}),
        });
      }
      if (/^select .* from "modules"/.test(text)) {
        return { rows: [["mod_1"]], rowCount: 1 };
      }
      if (/^select .* from "activities"/.test(text)) {
        return { rows: [["act_1"]], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    async connect() {
      return { ...client, release() {} };
    },
  };
  const db = drizzle({ client: client as never });
  return new DrizzleContentRepository(db);
}

describe("DrizzleContentRepository activity asset links", () => {
  it("refuses a link to a file deleted during the save with a conflict naming it", async () => {
    const repo = repoRefusingLinks(
      'Key (org_id, asset_id)=(org1, ast_gone) is not present in table "assets".',
    );
    const save = repo.saveActivity("org1", "crs_1", "mod_1", { assetIds: ["ast_gone"] }, "act_1");
    await expect(save).rejects.toBeInstanceOf(ConflictError);
    await expect(
      repo.saveActivity("org1", "crs_1", "mod_1", { assetIds: ["ast_gone"] }, "act_1"),
    ).rejects.toThrow(
      "An activity can only use ready files from the media library. Not available: ast_gone",
    );
  });

  it("refuses with the plain message when the database names no file", async () => {
    const repo = repoRefusingLinks();
    await expect(
      repo.saveActivity("org1", "crs_1", "mod_1", { assetIds: ["ast_gone"] }, "act_1"),
    ).rejects.toThrow("An activity can only use ready files from the media library");
  });
});
