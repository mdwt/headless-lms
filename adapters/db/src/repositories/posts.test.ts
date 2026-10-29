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

function capture(countRows: unknown[][] = [[0]]) {
  const statements: { text: string; params: unknown[] }[] = [];
  const client = {
    async query(config: string | { text: string }, params: unknown[] = []) {
      const text = typeof config === "string" ? config : config.text;
      statements.push({ text, params });
      return text.includes("count(*)")
        ? { rows: countRows, rowCount: countRows.length }
        : { rows: [], rowCount: 0 };
    },
  };
  return { statements, repo: new DrizzlePostRepository(drizzle({ client: client as never })) };
}

describe("DrizzlePostRepository.listByAuthor", () => {
  it("pages the author's posts newest first with a count", async () => {
    const { repo, statements } = capture([[4]]);
    await expect(
      repo.listByAuthor("org1", "ou_1", ["spc_1", "spc_2"], { page: 2, pageSize: 3 }),
    ).resolves.toEqual({ rows: [], total: 4, page: 2, pageSize: 3 });
    expect(statements).toHaveLength(2);
    expect(statements[0]?.text).toMatch(
      /where \("posts"\."org_id" = \$\d+ and "posts"\."org_user_id" = \$\d+ and "posts"\."space_id" in \(\$\d+, \$\d+\)\) order by "posts"\."created_at" desc, "posts"\."id" desc limit \$\d+ offset \$\d+$/,
    );
    expect(statements[0]?.params).toEqual(["org1", "ou_1", "spc_1", "spc_2", 3, 3]);
    expect(statements[1]?.text).toMatch(/^select cast\(count\(\*\) as int\) .*from "posts" where /);
  });

  it("returns an empty page without a query when there are no spaces", async () => {
    const { repo, statements } = capture();
    await expect(repo.listByAuthor("org1", "ou_1", [], { page: 1, pageSize: 20 })).resolves.toEqual(
      { rows: [], total: 0, page: 1, pageSize: 20 },
    );
    expect(statements).toHaveLength(0);
  });
});

describe("DrizzlePostRepository.listBookmarked", () => {
  it("pages newest bookmark first, keeping own posts and others' visible statuses", async () => {
    const { repo, statements } = capture([[9]]);
    await expect(
      repo.listBookmarked("org1", "ou_1", ["spc_1"], {
        page: 1,
        pageSize: 10,
        visibleStatuses: ["published", "pending"],
      }),
    ).resolves.toEqual({ rows: [], total: 9, page: 1, pageSize: 10 });
    expect(statements).toHaveLength(2);
    expect(statements[0]?.text).toMatch(
      /from "post_bookmarks" inner join "posts" on .* where \("post_bookmarks"\."org_id" = \$\d+ and "post_bookmarks"\."org_user_id" = \$\d+ and "posts"\."space_id" in \(\$\d+\) and \("posts"\."org_user_id" = \$\d+ or "posts"\."status" in \(\$\d+, \$\d+\)\)\) order by "post_bookmarks"\."created_at" desc, "posts"\."id" desc limit \$\d+$/,
    );
    expect(statements[0]?.params).toEqual([
      "org1",
      "ou_1",
      "spc_1",
      "ou_1",
      "published",
      "pending",
      10,
    ]);
    expect(statements[1]?.text).toMatch(
      /^select cast\(count\(\*\) as int\) .*from "post_bookmarks" inner join "posts" .* where /,
    );
    expect(statements[1]?.params).toEqual([
      "org1",
      "ou_1",
      "spc_1",
      "ou_1",
      "published",
      "pending",
    ]);
  });
});

describe("DrizzlePostRepository viewer state", () => {
  it("groups reaction counts by post and emoji for the whole page in one query", async () => {
    const statements: { text: string; params: unknown[] }[] = [];
    const client = {
      async query(config: string | { text: string }, params: unknown[] = []) {
        statements.push({ text: typeof config === "string" ? config : config.text, params });
        return {
          rows: [
            ["pst_1", "👍", 2, true],
            ["pst_1", "🎉", 1, false],
            ["pst_3", "👍", 1, false],
          ],
          rowCount: 3,
        };
      },
    };
    const repo = new DrizzlePostRepository(drizzle({ client: client as never }));
    await expect(repo.reactionsOf("org1", ["pst_1", "pst_2", "pst_3"], "ou_1")).resolves.toEqual({
      pst_1: { reactions: { "👍": 2, "🎉": 1 }, viewerReaction: "👍" },
      pst_3: { reactions: { "👍": 1 } },
    });
    expect(statements).toHaveLength(1);
    expect(statements[0]?.text).toMatch(
      /^select "post_id", "emoji", cast\(count\(\*\) as int\), bool_or\("org_user_id" = \$\d+\) from "post_reactions" where \("post_reactions"\."org_id" = \$\d+ and "post_reactions"\."post_id" in \(\$\d+, \$\d+, \$\d+\)\) group by "post_reactions"\."post_id", "post_reactions"\."emoji"$/,
    );
    expect(statements[0]?.params).toEqual(["ou_1", "org1", "pst_1", "pst_2", "pst_3"]);
  });

  it("reads the viewer's follows and bookmarks among a page of posts in one query each", async () => {
    const { repo, statements } = capture();
    await repo.followedAmong("org1", ["pst_1", "pst_2"], "ou_1");
    await repo.bookmarkedAmong("org1", ["pst_1", "pst_2"], "ou_1");
    expect(statements).toHaveLength(2);
    expect(statements[0]?.text).toMatch(
      /^select "post_id" from "post_follows" where \("post_follows"\."org_id" = \$\d+ and "post_follows"\."org_user_id" = \$\d+ and "post_follows"\."post_id" in \(\$\d+, \$\d+\)\)$/,
    );
    expect(statements[1]?.text).toMatch(
      /^select "post_id" from "post_bookmarks" where \("post_bookmarks"\."org_id" = \$\d+ and "post_bookmarks"\."org_user_id" = \$\d+ and "post_bookmarks"\."post_id" in \(\$\d+, \$\d+\)\)$/,
    );
    for (const statement of statements) {
      expect(statement.params).toEqual(["org1", "ou_1", "pst_1", "pst_2"]);
    }
  });

  it("skips the query for an empty page", async () => {
    const { repo, statements } = capture();
    await expect(repo.reactionsOf("org1", [], "ou_1")).resolves.toEqual({});
    await expect(repo.followedAmong("org1", [], "ou_1")).resolves.toEqual([]);
    await expect(repo.bookmarkedAmong("org1", [], "ou_1")).resolves.toEqual([]);
    expect(statements).toHaveLength(0);
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

describe("DrizzlePostRepository.listDue", () => {
  it("reads one bounded batch of due posts after the last id", async () => {
    const { repo, statements } = capture();
    const now = new Date("2026-10-21T09:00:00.000Z");
    await expect(repo.listDue("org1", now, 100, "pst_9")).resolves.toEqual([]);
    expect(statements[0]?.text).toMatch(
      /"posts"\."id" > \$\d+\) order by "posts"\."id" asc limit \$\d+$/,
    );
    expect(statements[0]?.params).toEqual(
      expect.arrayContaining(["org1", "scheduled", now.toISOString(), "pst_9", 100]),
    );
  });
});

describe("DrizzlePostRepository queue lists", () => {
  it("caps pending posts and open flags at the limit, oldest first", async () => {
    const { repo, statements } = capture();
    await repo.listPending("org1", "spc_1", 100);
    await repo.listOpenFlags("org1", "spc_1", 100);
    expect(statements.map((s) => s.text)).toEqual([
      expect.stringMatching(/order by "posts"\."created_at" asc, "posts"\."id" asc limit \$\d+$/),
      expect.stringMatching(
        /order by "post_flags"\."created_at" asc, "post_flags"\."id" asc limit \$\d+$/,
      ),
    ]);
  });
});
