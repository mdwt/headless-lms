import { describe, it, expect } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { DrizzleContentRepository } from "./content.js";

type Statement = { text: string; params: unknown[] };

const AT = new Date("2026-01-01T00:00:00.000Z");

function fakeClient(existingTopicIds: string[]) {
  const statements: Statement[] = [];
  const client = {
    async query(config: string | { text: string }, params: unknown[] = []) {
      const text = typeof config === "string" ? config : config.text;
      statements.push({ text, params });
      if (/^select "id" from "space_topics" .* for update$/.test(text)) {
        return { rows: existingTopicIds.map((id) => [id]), rowCount: existingTopicIds.length };
      }
      if (/^select .* from "spaces"/.test(text)) {
        const row = [
          "org1",
          "spc_1",
          "cmy_1",
          "General",
          "",
          0,
          "all_members",
          null,
          { comments: true, reactions: true, requireReview: false },
          AT,
          AT,
        ];
        return { rows: [row], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  return { client, statements };
}

function repoOver(existingTopicIds: string[]) {
  const { client, statements } = fakeClient(existingTopicIds);
  const db = drizzle({ client: client as never });
  return { repo: new DrizzleContentRepository(db), statements };
}

describe("DrizzleContentRepository.setSpaceTopics", () => {
  it("renames kept topics in place without writing a temporary name", async () => {
    const { repo, statements } = repoOver(["top_a", "top_b"]);

    await repo.setSpaceTopics("org1", "spc_1", {
      topics: [
        { id: "top_b", name: "Wins" },
        { id: "top_a", name: "Help" },
      ],
    });

    const names = statements
      .filter((s) => s.text.startsWith('update "space_topics"'))
      .map((s) => s.params[0]);
    expect(names).toEqual(["Wins", "Help"]);
    for (const statement of statements) {
      for (const param of statement.params) {
        expect(typeof param === "string" && param.includes("\u0000")).toBe(false);
      }
    }
  });

  it("runs the lock, delete, updates and inserts in one transaction", async () => {
    const { repo, statements } = repoOver(["top_a", "top_b"]);

    await repo.setSpaceTopics("org1", "spc_1", {
      topics: [{ id: "top_a", name: "Wins" }, { name: "Events" }],
    });

    const texts = statements.map((s) => s.text);
    const begin = texts.indexOf("begin");
    const commit = texts.indexOf("commit");
    expect(begin).toBe(0);
    const writes = texts
      .map((text, i) => ({ text, i }))
      .filter(({ text }) => /^(select "id" from "space_topics"|delete|update|insert)/.test(text));
    expect(writes.map(({ text }) => text.split(" ")[0])).toEqual([
      "select",
      "delete",
      "update",
      "insert",
    ]);
    for (const { i } of writes) {
      expect(i).toBeGreaterThan(begin);
      expect(i).toBeLessThan(commit);
    }
  });
});
