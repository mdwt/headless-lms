import { describe, it, expect, vi } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { DrizzleAutomationsRepository } from "./automations.js";

function capturingDb() {
  const queries: string[] = [];
  const query = vi.fn(async (q: string | { text: string }) => {
    queries.push(typeof q === "string" ? q : q.text);
    return { rows: [], rowCount: 0, fields: [] };
  });
  return { db: drizzle({ client: { query } as never }), queries };
}

describe("DrizzleAutomationsRepository.insertSeed", () => {
  it("inserts with on conflict do nothing and returns null when the seed already exists", async () => {
    const { db, queries } = capturingDb();
    const repo = new DrizzleAutomationsRepository(db);
    const result = await repo.insertSeed("org-1", {
      name: "Digest",
      triggers: ["schedule:0 7 * * *"],
      actions: [{ type: "sendDigest", input: {} }],
      filter: null,
      kind: "workflow",
      source: "system",
    });
    expect(result).toBeNull();
    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatch(/on conflict do nothing returning/i);
  });
});
