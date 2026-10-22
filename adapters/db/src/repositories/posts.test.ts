import { describe, it, expect } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { DrizzlePostRepository } from "./posts.js";

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
