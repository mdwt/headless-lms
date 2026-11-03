import { describe, it, expect } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { DrizzleChatRepository } from "./chats.js";

const at = "2026-01-01T00:00:00.000Z";

function chatUserRow() {
  return ["org1", "cmy_1", "cht_1", "ou_1", at, null, null, at, at];
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
  it("reads each chat's last message through a lateral limit-1 join and pages the inbox", async () => {
    const chatRow = ["org1", "cht_1", "cmy_1", "direct", "open", "ou_1", null, null, at, at];
    const { repo, statements } = sequencedClient([
      [[...chatRow, null, 2, "msg_9", "ou_2", "Latest", at, null]],
      [[1]],
      [chatUserRow()],
    ]);
    const page = await repo.listForUser("org1", "cmy_1", "ou_1", { page: 1, pageSize: 20 });
    expect(page).toMatchObject({ total: 1, page: 1, pageSize: 20 });
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0]).toMatchObject({
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
    expect(statements[0]?.text).toMatch(
      /left join lateral \(select "id", "org_user_id", "body", "created_at", "deleted_at" from "messages" where \("messages"\."org_id" = "chats"\."org_id" and "messages"\."chat_id" = "chats"\."id"\) order by "messages"\."created_at" desc, "messages"\."id" desc limit \$\d+\) "last_message" on true/,
    );
    expect(statements[0]?.text).toMatch(
      /order by "chats"."updated_at" desc, "chats"."id" desc limit \$\d+$/,
    );
    expect(statements[0]?.text).not.toMatch(/distinct on/);
  });

  it("counts unread the way unreadFor does: others' standing messages after the read marker", async () => {
    const chatRow = ["org1", "cht_1", "cmy_1", "direct", "open", "ou_1", null, null, at, at];
    const { repo, statements } = sequencedClient([
      [[...chatRow, null, 0, null, null, null, null, null]],
      [[1]],
      [],
    ]);
    await repo.listForUser("org1", "cmy_1", "ou_1", { page: 1, pageSize: 20 });
    const text = statements[0]!.text.replace(/\s+/g, " ");
    expect(text).toContain("and m.org_user_id <> $");
    expect(text).toContain("and m.deleted_at is null");
  });

  it("serves a null last message for a chat with no messages", async () => {
    const chatRow = ["org1", "cht_1", "cmy_1", "direct", "open", "ou_1", null, null, at, at];
    const { repo } = sequencedClient([
      [[...chatRow, null, 0, null, null, null, null, null]],
      [[1]],
      [],
    ]);
    const page = await repo.listForUser("org1", "cmy_1", "ou_1", { page: 1, pageSize: 20 });
    expect(page.rows[0]?.lastMessage).toBeNull();
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
    await expect(
      repo.reactionsOf("org1", ["msg_1", "msg_2", "msg_3", "msg_1"], "ou_1"),
    ).resolves.toEqual({
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

describe("DrizzleChatRepository.unreadFor", () => {
  it("counts others' standing messages after the person's read marker and reads the newest", async () => {
    const { repo, statements } = sequencedClient([[[3, "msg_9", "ou_2", "Latest"]]]);
    await expect(repo.unreadFor("org1", "cht_1", "ou_1")).resolves.toEqual({
      count: 3,
      latest: { messageId: "msg_9", senderOrgUserId: "ou_2", body: "Latest" },
    });
    expect(statements).toHaveLength(1);
    const text = statements[0]!.text.replace(/\s+/g, " ");
    expect(text).toMatch(
      /^select cast\(count\(\*\) over \(\) as int\), "id", "org_user_id", "body" from "messages"/,
    );
    expect(text).toContain('"messages"."org_user_id" <> $');
    expect(text).toContain('"messages"."deleted_at" is null');
    expect(text).toContain(
      "join messages lr on lr.org_id = cu.org_id and lr.id = cu.last_read_message_id",
    );
    expect(text).toContain("'-infinity'::timestamptz");
    expect(text).toMatch(
      /order by "messages"\."created_at" desc, "messages"\."id" desc limit \$\d+$/,
    );
  });

  it("answers nothing unread when no message qualifies", async () => {
    const { repo } = sequencedClient([[]]);
    await expect(repo.unreadFor("org1", "cht_1", "ou_1")).resolves.toEqual({
      count: 0,
      latest: null,
    });
  });
});
