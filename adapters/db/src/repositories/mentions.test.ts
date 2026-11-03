import { describe, it, expect } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { DrizzleMentionsRepository } from "./mentions.js";

function capture(answers: unknown[][][] = []) {
  const statements: { text: string; params: unknown[] }[] = [];
  const client = {
    async query(config: string | { text: string; values?: unknown[] }, params: unknown[] = []) {
      const text = typeof config === "string" ? config : config.text;
      const values = typeof config === "string" ? params : (config.values ?? params);
      statements.push({ text, params: values });
      const rows = answers[statements.length - 1] ?? [];
      return { rows, rowCount: rows.length };
    },
  };
  return { statements, repo: new DrizzleMentionsRepository(drizzle({ client: client as never })) };
}

const at = new Date("2026-11-03T12:00:00.000Z");

describe("DrizzleMentionsRepository.sync", () => {
  it("deletes the people no longer mentioned, inserts the rest, and returns the new ones", async () => {
    const { repo, statements } = capture([[], [["ou_2"]]]);
    await expect(repo.sync("org_1", "comment", "cmt_1", ["ou_1", "ou_2"], at)).resolves.toEqual([
      "ou_2",
    ]);
    expect(statements[0]?.text).toBe(
      'delete from "mentions" where (("mentions"."org_id" = $1 and "mentions"."item_type" = $2 and "mentions"."item_id" = $3) and "mentions"."org_user_id" not in ($4, $5))',
    );
    expect(statements[1]?.text).toMatch(
      /^insert into "mentions" \("org_id", "item_type", "item_id", "org_user_id", "created_at"\) values .* on conflict do nothing returning "org_user_id"$/,
    );
  });

  it("clears the item when nobody is mentioned any more", async () => {
    const { repo, statements } = capture();
    await expect(repo.sync("org_1", "post", "pst_1", [], at)).resolves.toEqual([]);
    expect(statements).toHaveLength(1);
    expect(statements[0]?.text).toBe(
      'delete from "mentions" where ("mentions"."org_id" = $1 and "mentions"."item_type" = $2 and "mentions"."item_id" = $3)',
    );
  });
});

describe("DrizzleMentionsRepository reads", () => {
  it("groups a page of items' mentions, first mention first", async () => {
    const { repo, statements } = capture([
      [
        ["msg_1", "ou_1"],
        ["msg_1", "ou_2"],
        ["msg_2", "ou_3"],
      ],
    ]);
    await expect(repo.forItems("org_1", "message", ["msg_1", "msg_2"])).resolves.toEqual({
      msg_1: ["ou_1", "ou_2"],
      msg_2: ["ou_3"],
    });
    expect(statements[0]?.text).toMatch(
      /order by "mentions"\."item_id" asc, "mentions"\."created_at" asc, "mentions"\."org_user_id" asc$/,
    );
  });

  it("skips the query for no items", async () => {
    const { repo, statements } = capture();
    await expect(repo.forItems("org_1", "post", [])).resolves.toEqual({});
    expect(statements).toHaveLength(0);
  });
});
