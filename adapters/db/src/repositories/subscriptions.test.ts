import { describe, it, expect } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { DrizzleSubscriptionsRepository } from "./subscriptions.js";

function capture(rows: unknown[][] = []) {
  const statements: { text: string; params: unknown[] }[] = [];
  const client = {
    async query(config: string | { text: string; values?: unknown[] }, params: unknown[] = []) {
      const text = typeof config === "string" ? config : config.text;
      const values = typeof config === "string" ? params : (config.values ?? params);
      statements.push({ text, params: values });
      return { rows, rowCount: rows.length };
    },
  };
  return {
    statements,
    repo: new DrizzleSubscriptionsRepository(drizzle({ client: client as never })),
  };
}

const at = new Date("2026-11-03T12:00:00.000Z");

describe("DrizzleSubscriptionsRepository", () => {
  it("upserts one row per person and item, replacing its state and end time", async () => {
    const { repo, statements } = capture();
    await repo.upsert("org_1", {
      orgId: "org_1",
      orgUserId: "ou_1",
      itemType: "chat",
      itemId: "cht_1",
      state: "muted",
      mutedUntil: at,
      createdAt: at,
    });
    expect(statements[0]?.text).toMatch(
      /^insert into "subscriptions" .* on conflict \("org_id","org_user_id","item_type","item_id"\) do update set "state" = \$\d+, "muted_until" = \$\d+$/,
    );
  });

  it("reads active mutes among the given people, open-ended or ending later", async () => {
    const { repo, statements } = capture([["ou_1"]]);
    await expect(repo.mutedAmong("org_1", "post", "pst_1", ["ou_1", "ou_2"], at)).resolves.toEqual([
      "ou_1",
    ]);
    expect(statements[0]?.text).toBe(
      'select "org_user_id" from "subscriptions" where ("subscriptions"."org_id" = $1 and "subscriptions"."item_type" = $2 and "subscriptions"."item_id" = $3 and "subscriptions"."state" = $4 and "subscriptions"."org_user_id" in ($5, $6) and ("subscriptions"."muted_until" is null or "subscriptions"."muted_until" > $7))',
    );
    expect(statements[0]?.params).toEqual([
      "org_1",
      "post",
      "pst_1",
      "muted",
      "ou_1",
      "ou_2",
      at.toISOString(),
    ]);
  });

  it("reads a post's followers by state", async () => {
    const { repo, statements } = capture([["ou_3"]]);
    await expect(repo.followerIds("org_1", "pst_1")).resolves.toEqual(["ou_3"]);
    expect(statements[0]?.params).toEqual(["org_1", "post", "pst_1", "following"]);
  });

  it("skips the query for nobody", async () => {
    const { repo, statements } = capture();
    await expect(repo.mutedAmong("org_1", "chat", "cht_1", [], at)).resolves.toEqual([]);
    await expect(repo.forViewer("org_1", "ou_1", "post", [])).resolves.toEqual([]);
    expect(statements).toHaveLength(0);
  });
});
