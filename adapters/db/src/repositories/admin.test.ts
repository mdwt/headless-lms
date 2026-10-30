import { describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { DrizzleAdminRepository } from "./admin.js";

function capture() {
  const statements: { text: string; params: unknown[] }[] = [];
  const client = {
    async query(config: string | { text: string }, params: unknown[] = []) {
      const text = typeof config === "string" ? config : config.text;
      statements.push({ text, params });
      return { rows: text.includes("count(*)") ? [{ total: 0 }] : [], rowCount: 0 };
    },
  };
  return {
    repo: new DrizzleAdminRepository(drizzle({ client: client as never })),
    statements,
  };
}

describe("DrizzleAdminRepository students", () => {
  it("hides an invited student's name and avatar unless the profile is the org's own", async () => {
    const { repo, statements } = capture();
    await repo.listStudents("org1", { page: 1, pageSize: 20, search: "ada" });
    const list = statements.find((s) => s.text.includes("limit"));
    const guard =
      /case when \("org_users"\."status" <> 'invited' or \("users"\."external_id" is null and not exists/;
    expect(list?.text).toMatch(new RegExp(`${guard.source}[^]*then "users"\\."first_name" end`));
    expect(list?.text).toMatch(new RegExp(`${guard.source}[^]*then "ba_user"\\."image" end`));
    for (const statement of statements) {
      expect(statement.text).not.toMatch(/"users"\."first_name" ilike/);
    }
  });
});
