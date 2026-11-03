import { describe, it, expect } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { DrizzleChatRepository } from "./chats.js";
import { DrizzleDiscussionRepository } from "./discussion.js";
import { DrizzlePostRepository } from "./posts.js";

function client(rows: unknown[][]) {
  const statements: string[] = [];
  const db = drizzle({
    client: {
      async query(config: string | { text: string }) {
        statements.push(typeof config === "string" ? config : config.text);
        return { rows, rowCount: rows.length };
      },
    } as never,
  });
  return { db, statements };
}

describe("reaction writes", () => {
  const writes = [
    {
      table: "post_reactions",
      write: (rows: unknown[][]) => {
        const { db, statements } = client(rows);
        const repo = new DrizzlePostRepository(db);
        return {
          statements,
          run: (emoji: string | null) => repo.setReaction("o", "p", "u", emoji),
        };
      },
    },
    {
      table: "comment_reactions",
      write: (rows: unknown[][]) => {
        const { db, statements } = client(rows);
        const repo = new DrizzleDiscussionRepository(db);
        return {
          statements,
          run: (emoji: string | null) => repo.setReaction("o", "c", "u", emoji),
        };
      },
    },
    {
      table: "message_reactions",
      write: (rows: unknown[][]) => {
        const { db, statements } = client(rows);
        const repo = new DrizzleChatRepository(db);
        return {
          statements,
          run: (emoji: string | null) => repo.setReaction("o", "cmy", "m", "u", emoji),
        };
      },
    },
  ];

  it.each(writes)(
    "$table reports whether the upsert inserted a new row",
    async ({ table, write }) => {
      const inserted = write([[true]]);
      await expect(inserted.run("👍")).resolves.toBe(true);
      expect(inserted.statements[0]).toMatch(
        new RegExp(
          `^insert into "${table}" .* on conflict .* do update set .* returning \\(xmax = 0\\)$`,
        ),
      );
      await expect(write([[false]]).run("🎉")).resolves.toBe(false);
    },
  );

  it.each(writes)("$table reports no new reaction when one is removed", async ({ write }) => {
    const removed = write([]);
    await expect(removed.run(null)).resolves.toBe(false);
    expect(removed.statements[0]).toMatch(/^delete from /);
  });
});
