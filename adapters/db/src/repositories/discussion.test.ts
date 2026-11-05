import { describe, it, expect } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { DrizzleDiscussionRepository } from "./discussion.js";

function capture(rows: unknown[][] = []) {
  const statements: { text: string; params: unknown[] }[] = [];
  const client = {
    async query(config: string | { text: string }, params: unknown[] = []) {
      statements.push({ text: typeof config === "string" ? config : config.text, params });
      return { rows, rowCount: rows.length };
    },
  };
  return {
    statements,
    repo: new DrizzleDiscussionRepository(drizzle({ client: client as never })),
  };
}

const at = "2026-01-01T00:00:00.000Z";

describe("DrizzleDiscussionRepository.listOpenFlagsForSpace", () => {
  it("serves each open flag on the space with the flagged comment", async () => {
    const { repo, statements } = capture([
      [
        "org1",
        "crp_1",
        "cmt_1",
        "ou_reporter",
        "spam",
        null,
        null,
        null,
        at,
        at,
        "cmt_1",
        "pst_1",
        "Buy now",
        "ou_author",
        "published",
      ],
    ]);
    const flags = await repo.listOpenFlagsForSpace("org1", "spc_1", 100);
    expect(flags).toEqual([
      {
        id: "crp_1",
        orgId: "org1",
        commentId: "cmt_1",
        orgUserId: "ou_reporter",
        reason: "spam",
        resolvedAt: null,
        resolution: null,
        resolvedBy: null,
        createdAt: new Date(at),
        updatedAt: new Date(at),
        comment: {
          id: "cmt_1",
          postId: "pst_1",
          body: "Buy now",
          orgUserId: "ou_author",
          status: "published",
        },
      },
    ]);
    expect(statements).toHaveLength(1);
    expect(statements[0]?.text).toMatch(
      /^select "comment_flags"\."org_id", "comment_flags"\."id", .*"comments"\."id", "posts"\."id", "comments"\."body", "comments"\."org_user_id", "comments"\."status" from "comment_flags" inner join "comments" on .* inner join "posts" on .* where \("comment_flags"\."org_id" = \$\d+ and "posts"\."space_id" = \$\d+ and "comment_flags"\."resolved_at" is null\) order by "comment_flags"\."created_at" asc, "comment_flags"\."id" asc limit \$\d+$/,
    );
    expect(statements[0]?.params).toEqual(["org1", "spc_1", 100]);
  });
});

describe("DrizzleDiscussionRepository.publishedCommentCounts", () => {
  it("counts published comments per post for the whole page in one query", async () => {
    const { repo, statements } = capture([
      ["pst_1", 3],
      ["pst_3", 1],
    ]);
    await expect(repo.publishedCommentCounts("org1", ["pst_1", "pst_2", "pst_3"])).resolves.toEqual(
      { pst_1: 3, pst_3: 1 },
    );
    expect(statements).toHaveLength(1);
    expect(statements[0]?.text).toMatch(
      /^select "post_id", cast\(count\(\*\) as int\) from "comments" where \("comments"\."org_id" = \$\d+ and "comments"\."post_id" in \(\$\d+, \$\d+, \$\d+\) and "comments"\."status" = \$\d+\) group by "comments"\."post_id"$/,
    );
    expect(statements[0]?.params).toEqual(["org1", "pst_1", "pst_2", "pst_3", "published"]);
  });

  it("skips the query for an empty page", async () => {
    const { repo, statements } = capture();
    await expect(repo.publishedCommentCounts("org1", [])).resolves.toEqual({});
    expect(statements).toHaveLength(0);
  });
});

describe("DrizzleDiscussionRepository.listThreadsByPost", () => {
  it("pages top-level comments the viewer can see and counts them", async () => {
    const { repo, statements } = capture();
    await expect(
      repo.listThreadsByPost("org1", "pst_1", {
        page: 2,
        pageSize: 10,
        viewerId: "ou_1",
        seesHeld: false,
      }),
    ).resolves.toEqual({ rows: [], total: 0, page: 2, pageSize: 10 });
    expect(statements).toHaveLength(2);
    const [roots, count] = statements;
    expect(roots?.text).toContain('"comments"."parent_id" is null');
    expect(roots?.text).toContain('rep.parent_id = "comments"."id"');
    expect(roots?.text).toContain("(rep.status = 'published' or rep.org_user_id = $");
    expect(roots?.text).toMatch(
      /order by "comments"\."created_at" asc, "comments"\."id" asc limit \$\d+ offset \$\d+$/,
    );
    expect(roots?.params).toEqual(expect.arrayContaining(["ou_1", 10, 10]));
    expect(count?.text).toMatch(/^select cast\(count\(\*\) as int\) from "comments"/);
  });

  it("shows held comments to a moderator without a viewer filter", async () => {
    const { repo, statements } = capture();
    await repo.listThreadsByPost("org1", "pst_1", {
      page: 1,
      pageSize: 10,
      viewerId: "ou_mod",
      seesHeld: true,
    });
    expect(statements[0]?.text).not.toContain("rep.org_user_id");
    expect(statements[0]?.params).not.toContain("ou_mod");
  });
});

describe("DrizzleDiscussionRepository.commenterIds", () => {
  it("lists the authors of published comments on a post", async () => {
    const { repo, statements } = capture([["ou_emma"], ["ou_sarah"]]);
    await expect(repo.commenterIds("org1", { postId: "pst_1" })).resolves.toEqual([
      "ou_emma",
      "ou_sarah",
    ]);
    expect(statements[0]?.text).toMatch(/^select distinct "org_user_id" from "comments"/);
    expect(statements[0]?.text).toContain('"comments"."post_id" = $');
    expect(statements[0]?.params).toEqual(["org1", "pst_1", "published"]);
  });

  it("lists the authors of published comments on a course activity", async () => {
    const { repo, statements } = capture();
    await repo.commenterIds("org1", { activityId: "act_1" });
    expect(statements[0]?.text).toContain('"comments"."activity_id" = $');
    expect(statements[0]?.params).toEqual(["org1", "act_1", "published"]);
  });
});

describe("DrizzleDiscussionRepository.listComments", () => {
  const query = { page: 1, pageSize: 20 };

  it("limits the rows to the courses passed in", async () => {
    const { repo, statements } = capture();
    await repo.listComments("org1", query, ["crs_1", "crs_2"]);
    expect(statements[0]?.text).toContain('"activities"."course_id" in ($');
    expect(statements[0]?.params).toEqual(expect.arrayContaining(["crs_1", "crs_2"]));
  });

  it("reads every course when no list is passed", async () => {
    const { repo, statements } = capture();
    await repo.listComments("org1", query);
    expect(statements[0]?.text).not.toContain('"activities"."course_id" in');
  });

  it("reads nothing for an empty course list", async () => {
    const { repo, statements } = capture();
    await expect(repo.listComments("org1", query, [])).resolves.toEqual({
      rows: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
    expect(statements).toEqual([]);
  });
});

describe("DrizzleDiscussionRepository.authorsOf", () => {
  it("reads no role from org_users", async () => {
    const { repo, statements } = capture();
    await repo.authorsOf("org1", ["ou_1"]);
    expect(statements[0]?.text).not.toContain('"org_users"."role"');
  });
});
