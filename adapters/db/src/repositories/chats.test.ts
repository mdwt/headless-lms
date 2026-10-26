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

function chatUserRow(muted: boolean, mutedUntil: string | null) {
  return ["org1", "cmy_1", "cht_1", "ou_1", at, null, null, muted, mutedUntil, at, at];
}

describe("DrizzleChatRepository mutes", () => {
  it("reads the mute flag and its optional end time as they are stored", async () => {
    const { repo } = fakeClient([
      chatUserRow(false, null),
      chatUserRow(true, null),
      chatUserRow(true, "2030-01-01T00:00:00.000Z"),
    ]);
    const users = await repo.participants("org1", "cht_1");
    expect(users.map((user) => [user.muted, user.mutedUntil])).toEqual([
      [false, null],
      [true, null],
      [true, new Date("2030-01-01T00:00:00.000Z")],
    ]);
  });

  it("writes the flag and the end time as two plain columns", async () => {
    const { repo, statements } = fakeClient();
    await repo.setMuted("org1", "cht_1", "ou_1", true, null);
    await repo.setMuted("org1", "cht_1", "ou_1", false, null);
    await repo.setMuted("org1", "cht_1", "ou_1", true, new Date(at));
    for (const statement of statements) {
      expect(statement.text).toMatch(/"muted" = \$1, "muted_until" = \$2/);
      expect(statement.text).not.toMatch(/infinity/);
    }
    expect(statements[0]?.params.slice(0, 2)).toEqual([true, null]);
    expect(statements[1]?.params.slice(0, 2)).toEqual([false, null]);
    expect(statements[2]?.params.slice(0, 2)).toEqual([true, at]);
  });
});
