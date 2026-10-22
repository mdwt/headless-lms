import { describe, it, expect } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { DrizzleChatRepository } from "./chats.js";

function fakeClient(rows: unknown[][] = []) {
  const statements: { text: string; params: unknown[] }[] = [];
  const client = {
    async query(config: string | { text: string; values?: unknown[] }, params: unknown[] = []) {
      const text = typeof config === "string" ? config : config.text;
      const values = typeof config === "string" ? params : (config.values ?? params);
      statements.push({ text, params: values });
      return { rows, rowCount: rows.length };
    },
  };
  return { statements, repo: new DrizzleChatRepository(drizzle({ client: client as never })) };
}

const at = "2026-01-01T00:00:00.000Z";

function chatUserRow(mutedUntil: string | null) {
  return ["org1", "cmy_1", "cht_1", "ou_1", at, null, null, mutedUntil, at, at];
}

describe("DrizzleChatRepository mutes", () => {
  it("reads 'infinity' as a mute until unmuted and a time as a mute until then", async () => {
    const { repo } = fakeClient([
      chatUserRow(null),
      chatUserRow("infinity"),
      chatUserRow("2030-01-01T00:00:00.000Z"),
    ]);
    const users = await repo.participants("org1", "cht_1");
    expect(users.map((user) => user.mute)).toEqual([
      null,
      { until: null },
      { until: new Date("2030-01-01T00:00:00.000Z") },
    ]);
  });

  it("writes a mute until unmuted as 'infinity' and no mute as null", async () => {
    const { repo, statements } = fakeClient();
    await repo.setMuted("org1", "cht_1", "ou_1", { until: null });
    await repo.setMuted("org1", "cht_1", "ou_1", null);
    await repo.setMuted("org1", "cht_1", "ou_1", { until: new Date(at) });
    expect(statements[0]?.text).toMatch(/"muted_until" = 'infinity'::timestamptz/);
    expect(statements[1]?.text).toMatch(/"muted_until" = \$1/);
    expect(statements[1]?.params[0]).toBeNull();
    expect(statements[2]?.params[0]).toBe(at);
  });
});
