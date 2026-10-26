import { describe, it, expect } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { DrizzlePostRepository } from "./posts.js";

describe("DrizzlePostRepository.listPublished", () => {
  it("pages by offset and size, pinned first, then newest published, then id", async () => {
    const statements: { text: string; params: unknown[] }[] = [];
    const client = {
      async query(config: string | { text: string }, params: unknown[] = []) {
        const text = typeof config === "string" ? config : config.text;
        statements.push({ text, params });
        return text.includes("count(*)") ? { rows: [[7]], rowCount: 1 } : { rows: [], rowCount: 0 };
      },
    };
    const repo = new DrizzlePostRepository(drizzle({ client: client as never }));
    await expect(
      repo.listPublished("org1", ["spc_1"], { page: 3, pageSize: 5, topicId: "tpc_1" }),
    ).resolves.toEqual({ rows: [], total: 7, page: 3, pageSize: 5 });
    expect(statements).toHaveLength(2);
    expect(statements[0]?.text).toMatch(
      /order by "posts"\."pinned" desc, "posts"\."published_at" desc, "posts"\."id" desc limit \$\d+ offset \$\d+$/,
    );
    expect(statements[0]?.params).toEqual(
      expect.arrayContaining(["org1", "spc_1", "published", "tpc_1", 5, 10]),
    );
    expect(statements[1]?.text).toMatch(/^select cast\(count\(\*\) as int\) .*from "posts" where /);
  });

  it("returns an empty page without a query when there are no spaces", async () => {
    const client = {
      async query() {
        throw new Error("no query expected");
      },
    };
    const repo = new DrizzlePostRepository(drizzle({ client: client as never }));
    await expect(repo.listPublished("org1", [], { page: 1, pageSize: 20 })).resolves.toEqual({
      rows: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
  });
});

describe("DrizzlePostRepository.hasDue", () => {
  it("asks for the existence of one due post instead of loading them", async () => {
    const statements: { text: string; params: unknown[] }[] = [];
    const client = {
      async query(config: string | { text: string }, params: unknown[] = []) {
        statements.push({ text: typeof config === "string" ? config : config.text, params });
        return { rows: [{ due: true }], rowCount: 1 };
      },
    };
    const repo = new DrizzlePostRepository(drizzle({ client: client as never }));
    const now = new Date("2026-10-21T09:00:00.000Z");
    await expect(repo.hasDue("org1", now)).resolves.toBe(true);
    expect(statements).toHaveLength(1);
    expect(statements[0]?.text).toMatch(
      /^select exists \(\(select "id" from "posts" where .* limit \$\d+\)\) as due$/,
    );
    expect(statements[0]?.params).toEqual(
      expect.arrayContaining(["org1", "scheduled", now.toISOString()]),
    );
  });
});
