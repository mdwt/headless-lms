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

function sequencedClient(answers: unknown[][][]) {
  const statements: { text: string; params: unknown[] }[] = [];
  const client = {
    async query(config: string | { text: string; values?: unknown[] }, params: unknown[] = []) {
      const text = typeof config === "string" ? config : config.text;
      const values = typeof config === "string" ? params : (config.values ?? params);
      statements.push({ text, params: values });
      const rows = answers[statements.length - 1] ?? [];
      return { rows, rowCount: rows.length };
    },
  };
  return { statements, repo: new DrizzleChatRepository(drizzle({ client: client as never })) };
}

describe("DrizzleChatRepository.listForUser", () => {
  it("loads the last message of every chat in the inbox with one distinct-on query", async () => {
    const chatRow = ["org1", "cht_1", "cmy_1", "direct", "open", "ou_1", null, null, at, at];
    const { repo, statements } = sequencedClient([
      [[...chatRow, null, false, null, 2]],
      [chatUserRow(false, null)],
      [["cht_1", "msg_9", "ou_2", "Latest", at, null]],
    ]);
    const items = await repo.listForUser("org1", "cmy_1", "ou_1");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      participantIds: ["ou_1"],
      unread: 2,
      lastMessage: {
        id: "msg_9",
        orgUserId: "ou_2",
        body: "Latest",
        createdAt: new Date(at),
        deletedAt: null,
      },
    });
    expect(statements).toHaveLength(3);
    expect(statements[2]?.text).toMatch(
      /^select distinct on \("messages"\."chat_id"\) "chat_id", "id", "org_user_id", "body", "created_at", "deleted_at" from "messages" where \("messages"\."org_id" = \$\d+ and "messages"\."chat_id" in \(\$\d+\)\) order by "messages"\."chat_id" asc, "messages"\."created_at" desc, "messages"\."id" desc$/,
    );
    expect(statements[2]?.params).toEqual(["org1", "cht_1"]);
  });

  it("serves a null last message for a chat with no messages", async () => {
    const chatRow = ["org1", "cht_1", "cmy_1", "direct", "open", "ou_1", null, null, at, at];
    const { repo } = sequencedClient([[[...chatRow, null, false, null, 0]], [], []]);
    const items = await repo.listForUser("org1", "cmy_1", "ou_1");
    expect(items[0]?.lastMessage).toBeNull();
  });
});

describe("DrizzleChatRepository.listMessages", () => {
  it("pages newest first with a count", async () => {
    const { repo, statements } = sequencedClient([[], [[3]]]);
    await expect(repo.listMessages("org1", "cht_1", { page: 2, pageSize: 2 })).resolves.toEqual({
      rows: [],
      total: 3,
      page: 2,
      pageSize: 2,
    });
    expect(statements).toHaveLength(2);
    expect(statements[0]?.text).toMatch(
      /from "messages" where \("messages"\."org_id" = \$\d+ and "messages"\."chat_id" = \$\d+\) order by "messages"\."created_at" desc, "messages"\."id" desc limit \$\d+ offset \$\d+$/,
    );
    expect(statements[0]?.params).toEqual(["org1", "cht_1", 2, 2]);
    expect(statements[1]?.text).toMatch(
      /^select cast\(count\(\*\) as int\) .*from "messages" where /,
    );
  });
});

describe("DrizzleChatRepository.reactionsOf", () => {
  it("groups reaction counts by message and emoji for the whole page in one query", async () => {
    const { repo, statements } = sequencedClient([
      [
        ["msg_1", "👍", 2, true],
        ["msg_1", "🎉", 1, false],
        ["msg_3", "👍", 1, false],
      ],
    ]);
    await expect(repo.reactionsOf("org1", ["msg_1", "msg_2", "msg_3", "msg_1"], "ou_1")).resolves.toEqual({
      msg_1: { reactions: { "👍": 2, "🎉": 1 }, viewerReaction: "👍" },
      msg_3: { reactions: { "👍": 1 } },
    });
    expect(statements).toHaveLength(1);
    expect(statements[0]?.text).toMatch(
      /^select "message_id", "emoji", cast\(count\(\*\) as int\), bool_or\("org_user_id" = \$\d+\) from "message_reactions" where \("message_reactions"\."org_id" = \$\d+ and "message_reactions"\."message_id" in \(\$\d+, \$\d+, \$\d+\)\) group by "message_reactions"\."message_id", "message_reactions"\."emoji"$/,
    );
    expect(statements[0]?.params).toEqual(["ou_1", "org1", "msg_1", "msg_2", "msg_3"]);
  });

  it("skips the query for an empty page", async () => {
    const { repo, statements } = sequencedClient([]);
    await expect(repo.reactionsOf("org1", [], "ou_1")).resolves.toEqual({});
    expect(statements).toHaveLength(0);
  });
});

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
