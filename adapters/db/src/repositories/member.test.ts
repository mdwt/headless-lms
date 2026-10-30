import { describe, it, expect } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { DrizzleMemberRepository } from "./member.js";

describe("DrizzleMemberRepository.directory", () => {
  it("projects a profile photo only when it was uploaded in the same org", async () => {
    const statements: { text: string; params: unknown[] }[] = [];
    const client = {
      async query(config: string | { text: string }, params: unknown[] = []) {
        statements.push({ text: typeof config === "string" ? config : config.text, params });
        return { rows: [], rowCount: 0 };
      },
    };
    const repo = new DrizzleMemberRepository(drizzle({ client: client as never }));

    await repo.directory("org1", "cmy_1", { page: 1, pageSize: 20 });

    const [statement] = statements;
    const photo = statement?.text.match(
      /case when "user_profiles"."image_asset_org_id" = \$(\d+) then "user_profiles"."image_asset_id" end/,
    );
    expect(photo).not.toBeNull();
    expect(statement?.params[Number(photo?.[1]) - 1]).toBe("org1");
  });
});

function capture() {
  const statements: { text: string; params: unknown[] }[] = [];
  const client = {
    async query(config: string | { text: string }, params: unknown[] = []) {
      statements.push({ text: typeof config === "string" ? config : config.text, params });
      return { rows: [], rowCount: 0 };
    },
  };
  return { repo: new DrizzleMemberRepository(drizzle({ client: client as never })), statements };
}

describe("DrizzleMemberRepository.directory paging", () => {
  it("pages the directory, counts it, and filters by display name", async () => {
    const { repo, statements } = capture();
    await expect(
      repo.directory("org1", "cmy_1", { page: 3, pageSize: 10, search: "sar" }),
    ).resolves.toEqual({ rows: [], total: 0, page: 3, pageSize: 10 });
    expect(statements).toHaveLength(2);
    expect(statements[0]?.text).toMatch(/ilike \$\d+\) order by .* limit \$\d+ offset \$\d+$/);
    expect(statements[0]?.params).toEqual(expect.arrayContaining(["%sar%", 10, 20]));
    expect(statements[1]?.text).toMatch(/^select cast\(count\(\*\) as int\) from "org_users"/);
    expect(statements[1]?.params).toEqual(expect.arrayContaining(["%sar%"]));
  });
});

describe("DrizzleMemberRepository.spaceMemberCounts", () => {
  it("counts the community's holders from content_access once and groups seated holders per space", async () => {
    const { repo, statements } = capture();
    await repo.spaceMemberCounts("org1", "cmy_1");
    const [statement] = statements;
    expect(statements).toHaveLength(1);
    expect(statement?.text).toMatch(
      /^with "holders" as \(select distinct "org_user_id" from "content_access"/,
    );
    expect(statement?.text).toContain("pc.status = 'published'");
    expect(statement?.text).toMatch(
      /"seated" as \(select "space_members"\."space_id", cast\(count\(\*\) as int\) as "count" from "space_members" inner join "holders"/,
    );
    expect(statement?.text).toContain('"space_members"."status" = $');
    expect(statement?.text).toMatch(/group by "space_members"\."space_id"\)/);
    expect(statement?.text).toMatch(
      /case when "spaces"\."access_rule" = 'all_members' then \(select cast\(count\(\*\) as int\) from "holders"\) else coalesce\("seated"\."count", 0\) end/,
    );
    expect(statement?.text).toMatch(/from "spaces" left join "seated"/);
    expect(statement?.text).not.toContain('from "org_users"');
  });
});
