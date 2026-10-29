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

    await repo.directory("org1", "cmy_1");

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

describe("DrizzleMemberRepository.spaceMemberCounts", () => {
  it("counts seated holders of the published community, and the community's holders for an all-members space", async () => {
    const { repo, statements } = capture();
    await repo.spaceMemberCounts("org1", "cmy_1");
    const [statement] = statements;
    expect(statements).toHaveLength(1);
    expect(statement?.text).toMatch(/from "spaces"/);
    expect(statement?.text).toMatch(/case when (?:"spaces"\.)?"access_rule" = 'all_members' then/);
    expect(statement?.text).toContain(
      'pc.id = "spaces"."community_id" and pc.status = \'published\'',
    );
    expect(statement?.text).toContain('"space_members"."status" = \'active\'');
    expect(statement?.text).toContain('ca.org_user_id = "space_members"."org_user_id"');
  });
});
