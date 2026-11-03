import { describe, it, expect } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { DrizzleNotificationSettingsRepository } from "./notification-settings.js";

function capture(rows: unknown[][] = []) {
  const statements: { text: string; params: unknown[] }[] = [];
  const client = {
    async query(config: string | { text: string; values?: unknown[] }, params: unknown[] = []) {
      const text = typeof config === "string" ? config : config.text;
      const values = typeof config === "string" ? params : (config.values ?? params);
      statements.push({ text, params: values });
      return { rows: /^select/.test(text) ? rows : [], rowCount: rows.length };
    },
  };
  return {
    statements,
    repo: new DrizzleNotificationSettingsRepository(drizzle({ client: client as never })),
  };
}

const at = new Date("2026-11-03T12:00:00.000Z");

describe("DrizzleNotificationSettingsRepository", () => {
  it("reads people's settings in one community, narrowed to categories", async () => {
    const { repo, statements } = capture([["usr_1", "cmy_1", null, "mentions", "email", false]]);
    await expect(repo.forUsers("org_1", ["usr_1"], "cmy_1", ["mentions"])).resolves.toEqual([
      {
        userId: "usr_1",
        communityId: "cmy_1",
        spaceId: null,
        category: "mentions",
        channel: "email",
        enabled: false,
      },
    ]);
    expect(statements[0]?.text).toContain(
      `coalesce("notification_settings"."community_id", '') = $`,
    );
    expect(statements[0]?.text).toContain(`"notification_settings"."category" in ($`);
    expect(statements[0]?.params).toEqual(["org_1", "usr_1", "cmy_1", "mentions"]);
  });

  it("reads org settings as the rows with no community", async () => {
    const { repo, statements } = capture();
    await repo.forUsers("org_1", ["usr_1"], null, null);
    expect(statements[0]?.params).toEqual(["org_1", "usr_1", ""]);
    expect(statements[0]?.text).not.toContain(`"category" in`);
  });

  it("asks nothing for no people or no categories", async () => {
    const { repo, statements } = capture();
    await expect(repo.forUsers("org_1", [], "cmy_1", null)).resolves.toEqual([]);
    await expect(repo.forUsers("org_1", ["usr_1"], "cmy_1", [])).resolves.toEqual([]);
    await repo.apply("org_1", "usr_1", [], [], at);
    expect(statements).toEqual([]);
  });

  it("deletes and upserts in one transaction against the expression key", async () => {
    const { repo, statements } = capture();
    await repo.apply(
      "org_1",
      "usr_1",
      [
        {
          communityId: "cmy_1",
          spaceId: "spc_1",
          category: "new_posts",
          channel: "push",
          enabled: true,
        },
      ],
      [{ communityId: "cmy_1", spaceId: null, category: "mentions", channel: "email" }],
      at,
    );
    const texts = statements.map((statement) => statement.text);
    expect(texts[0]).toBe("begin");
    expect(texts[1]).toMatch(/^delete from "notification_settings" where/);
    expect(texts[2]).toContain(
      "on conflict (org_id, user_id, coalesce(community_id, ''), coalesce(space_id, ''), category, channel) do update set enabled = excluded.enabled, updated_at = excluded.updated_at",
    );
    expect(statements[2]?.params).toEqual(
      expect.arrayContaining(["org_1", "usr_1", "cmy_1", "spc_1", "new_posts", "push", true]),
    );
    expect(texts[3]).toBe("commit");
  });

  it("lists the org users with a setting switched on at the space or all spaces", async () => {
    const { repo, statements } = capture([["ou_1"]]);
    await expect(repo.switchedOn("org_1", "cmy_1", "new_posts", "spc_1")).resolves.toEqual([
      "ou_1",
    ]);
    expect(statements[0]?.text).toMatch(
      /^select distinct "org_users"."id" from "notification_settings" inner join "org_users"/,
    );
    expect(statements[0]?.text).toContain(`coalesce("notification_settings"."space_id", '') in ($`);
    expect(statements[0]?.text).toMatch(/and "notification_settings"."enabled"\)$/);
    expect(statements[0]?.params).toEqual(["org_1", "cmy_1", "new_posts", "spc_1", ""]);
    await repo.switchedOn("org_1", "cmy_1", "new_posts", null);
    expect(statements[1]?.params).toEqual(["org_1", "cmy_1", "new_posts", ""]);
  });
});
