import { describe, it, expect } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { ConflictError } from "@headless-lms/core/shared/errors";
import { DrizzleAssetsRepository } from "./assets.js";

type Statement = { text: string; params: unknown[] };

function repoWith(fail?: { code: string }) {
  const statements: Statement[] = [];
  const client = {
    async query(config: string | { text: string }, params: unknown[] = []) {
      const text = typeof config === "string" ? config : config.text;
      statements.push({ text, params });
      if (fail) {
        throw Object.assign(new Error("violates foreign key constraint"), fail);
      }
      return { rows: [], rowCount: 0 };
    },
  };
  const db = drizzle({ client: client as never });
  return { repo: new DrizzleAssetsRepository(db), statements };
}

describe("DrizzleAssetsRepository", () => {
  it("turns a delete the references refuse into a conflict", async () => {
    const { repo } = repoWith({ code: "23503" });
    await expect(repo.delete("org1", "ast_1")).rejects.toBeInstanceOf(ConflictError);
    await expect(repo.delete("org1", "ast_1")).rejects.toThrow("This file is still in use");
  });

  it("deletes inside the org", async () => {
    const { repo, statements } = repoWith();
    expect(await repo.delete("org1", "ast_1")).toBe(false);
    expect(statements[0]?.text).toMatch(/^delete from "assets" where \("assets"."org_id" = \$1/);
    expect(statements[0]?.params).toEqual(["org1", "ast_1"]);
  });

  it("marks only a pending asset ready", async () => {
    const { repo, statements } = repoWith();
    expect(
      await repo.markReady("org1", "ast_1", {
        key: "org/org1/image/ast_1/me.png",
        kind: "image",
        size: 10,
        contentType: "image/png",
      }),
    ).toBeNull();
    expect(statements[0]?.text).toContain('"assets"."status" = $');
    expect(statements[0]?.params).toContain("pending");
  });

  it("answers which storage keys an asset row of the org holds", async () => {
    const { repo, statements } = repoWith();
    expect(await repo.heldKeys("org1", [])).toEqual([]);
    expect(statements).toEqual([]);
    expect(await repo.heldKeys("org1", ["org/org1/uploads/a/x.png"])).toEqual([]);
    expect(statements[0]?.text).toMatch(
      /^select "key" from "assets" where \("assets"."org_id" = \$1 and "assets"."key" in \(\$2\)\)/,
    );
    expect(statements[0]?.params).toEqual(["org1", "org/org1/uploads/a/x.png"]);
  });
});
