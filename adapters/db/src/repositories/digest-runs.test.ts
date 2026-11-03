import { describe, it, expect } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { DrizzleDigestRunRepository } from "./digest-runs.js";

function capture(returned: unknown[][]) {
  const statements: { text: string; params: unknown[] }[] = [];
  const client = {
    async query(config: string | { text: string }, params: unknown[] = []) {
      statements.push({ text: typeof config === "string" ? config : config.text, params });
      return { rows: returned, rowCount: returned.length };
    },
  };
  return {
    statements,
    repo: new DrizzleDigestRunRepository(drizzle({ client: client as never })),
  };
}

describe("DrizzleDigestRunRepository.advance", () => {
  const dueAt = new Date("2026-11-05T06:00:00.000Z");

  it("moves the row only forward with one conditional upsert, and reports the move", async () => {
    const { repo, statements } = capture([["org_1"]]);
    await expect(repo.advance("org_1", "cmy_1", dueAt)).resolves.toBe(true);
    expect(statements).toHaveLength(1);
    expect(statements[0]?.text).toMatch(
      /^insert into "digest_runs" \("org_id", "community_id", "last_due_at"\) values \(\$1, \$2, \$3\) on conflict \("org_id","community_id"\) do update set "last_due_at" = excluded\.last_due_at where "digest_runs"\."last_due_at" < excluded\.last_due_at returning "org_id"$/,
    );
    expect(statements[0]?.params).toEqual(["org_1", "cmy_1", dueAt.toISOString()]);
  });

  it("reports no move when the stored due time is not older", async () => {
    const { repo } = capture([]);
    await expect(repo.advance("org_1", "cmy_1", dueAt)).resolves.toBe(false);
  });
});

describe("DrizzleDigestRunRepository.listRuns", () => {
  it("reads every community's last due time across orgs", async () => {
    const at = new Date("2026-11-05T06:00:00.000Z");
    const { repo, statements } = capture([["org_1", "cmy_1", at.toISOString()]]);
    await expect(repo.listRuns()).resolves.toEqual([
      { orgId: "org_1", communityId: "cmy_1", lastDueAt: at },
    ]);
    expect(statements[0]?.text).toBe(
      'select "org_id", "community_id", "last_due_at" from "digest_runs"',
    );
  });
});
