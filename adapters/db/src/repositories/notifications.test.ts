import { describe, it, expect } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NewNotification } from "@headless-lms/core/automations";
import { DrizzleNotificationsRepository } from "./notifications.js";

function capture(answers: (text: string) => unknown[][] = () => []) {
  const statements: { text: string; params: unknown[] }[] = [];
  const client = {
    async query(config: string | { text: string; values?: unknown[] }, params: unknown[] = []) {
      const text = typeof config === "string" ? config : config.text;
      const values = typeof config === "string" ? params : (config.values ?? params);
      statements.push({ text, params: values });
      const rows = answers(text);
      return { rows, rowCount: rows.length };
    },
  };
  return {
    statements,
    repo: new DrizzleNotificationsRepository(drizzle({ client: client as never })),
  };
}

const at = new Date("2026-11-03T12:00:00.000Z");

function row(over: Partial<NewNotification> = {}): NewNotification {
  return {
    id: "ntf_1",
    userId: "usr_1",
    sourceEventId: "evt_1",
    type: "mention",
    scope: "space",
    reasons: ["post_author", "mentioned"],
    matchedReason: "mentioned",
    category: "mentions",
    communityId: "cmy_1",
    spaceId: "spc_1",
    actorOrgUserId: "ou_2",
    subject: { type: "comment", id: "cmt_1" },
    parent: { type: "post", id: "pst_1" },
    display: { authorName: "James" },
    inApp: true,
    createdAt: at,
    ...over,
  };
}

describe("DrizzleNotificationsRepository.insert", () => {
  it("skips stored notifications and inserts deliveries only for the new ones, in one transaction", async () => {
    const { repo, statements } = capture((text) =>
      text.startsWith('insert into "notifications"') ? [["ntf_1"]] : [],
    );
    await repo.insert(
      "org_1",
      [row(), row({ id: "ntf_2", userId: "usr_2" })],
      [
        { id: "ndl_1", notificationId: "ntf_1", channel: "push" },
        { id: "ndl_2", notificationId: "ntf_2", channel: "email" },
      ],
    );
    const texts = statements.map((s) => s.text);
    expect(texts[0]).toBe("begin");
    expect(texts[1]).toContain('insert into "notifications"');
    expect(texts[1]).toContain("on conflict do nothing");
    expect(texts[1]).toContain('returning "id"');
    expect(statements[1]?.params).toEqual(
      expect.arrayContaining(["comment", "cmt_1", "post", "pst_1", "evt_1"]),
    );
    expect(texts[2]).toContain('insert into "notification_deliveries"');
    expect(statements[2]?.params).toEqual(
      expect.arrayContaining(["ndl_1", "ntf_1", "push", "pending"]),
    );
    expect(statements[2]?.params).not.toContain("ndl_2");
    expect(texts.at(-1)).toBe("commit");
  });

  it("inserts no delivery when every notification was stored already", async () => {
    const { repo, statements } = capture();
    await repo.insert(
      "org_1",
      [row()],
      [{ id: "ndl_1", notificationId: "ntf_1", channel: "push" }],
    );
    expect(statements.some((s) => s.text.includes("notification_deliveries"))).toBe(false);
  });

  it("asks nothing for no rows", async () => {
    const { repo, statements } = capture();
    await repo.insert("org_1", [], []);
    expect(statements).toEqual([]);
  });
});

describe("DrizzleNotificationsRepository deliveries", () => {
  it("reads the pending deliveries of every notification of an event", async () => {
    const { repo, statements } = capture(() => [["ndl_1"]]);
    await expect(repo.pendingDeliveriesForEvent("org_1", "evt_1")).resolves.toEqual([
      { id: "ndl_1" },
    ]);
    expect(statements[0]?.text).toContain('inner join "notifications"');
    expect(statements[0]?.text).toContain('"notifications"."source_event_id" = $');
    expect(statements[0]?.params).toEqual(["org_1", "evt_1", "pending"]);
  });

  it("changes only a pending delivery", async () => {
    const { repo, statements } = capture();
    await repo.markSent("org_1", "ndl_1", at);
    await repo.recordError("org_1", "ndl_1", "smtp 451");
    await repo.markFailed("org_1", "ndl_1", "no address");
    for (const statement of statements) {
      expect(statement.text).toContain('"notification_deliveries"."status" = $');
      expect(statement.params.at(-1)).toBe("pending");
    }
    expect(statements[0]?.params.slice(0, 2)).toEqual(["sent", at.toISOString()]);
    expect(statements[1]?.params[0]).toBe("smtp 451");
    expect(statements[2]?.params.slice(0, 2)).toEqual(["failed", "no address"]);
  });
});

describe("DrizzleNotificationsRepository list", () => {
  it("filters in-app rows by scope, community, categories, reasons, types and unread, newest first", async () => {
    const { repo, statements } = capture((text) => (text.includes("count(*)") ? [[4, 1]] : []));
    await expect(
      repo.page(
        "org_1",
        "usr_1",
        {
          scope: "community",
          communityId: "cmy_1",
          category: ["mentions"],
          reason: ["comment_author", "thread_participant"],
          type: ["mention"],
          unread: true,
        },
        { page: 2, pageSize: 10 },
      ),
    ).resolves.toEqual({ items: [], total: 4, unreadCount: 1 });
    const list = statements.find((s) => s.text.includes("order by"))!;
    expect(list.text).toContain('"notifications"."in_app" = $');
    expect(list.text).toContain('"notifications"."community_id" is not null');
    expect(list.text).toContain('"notifications"."reasons" && $');
    expect(list.text).toContain('"notifications"."read_at" is null');
    expect(list.text).toContain(
      'order by "notifications"."created_at" desc, "notifications"."id" desc',
    );
    expect(list.params).toEqual(
      expect.arrayContaining(["org_1", "usr_1", "cmy_1", "mentions", "mention", 10, 10]),
    );
    const counts = statements.find((s) => s.text.includes("count(*)"))!;
    expect(counts.text).toContain('"notifications"."reasons" && $');
  });

  it("reads the org list as the rows with no community", async () => {
    const { repo, statements } = capture();
    await repo.page("org_1", "usr_1", { scope: "org" }, { page: 1, pageSize: 20 });
    expect(statements[0]?.text).toContain('"notifications"."community_id" is null');
    expect(statements[0]?.text).not.toContain('"notifications"."read_at" is null');
  });

  it("maps a row to its subject and parent", async () => {
    const { repo } = capture((text) =>
      text.includes("order by")
        ? [
            [
              "org_1",
              "ntf_1",
              "usr_1",
              "evt_1",
              "mention",
              "space",
              ["mentioned"],
              "mentioned",
              "mentions",
              "cmy_1",
              "spc_1",
              "ou_2",
              "comment",
              "cmt_1",
              null,
              null,
              { authorName: "James" },
              true,
              at,
              null,
            ],
          ]
        : [[1, 1]],
    );
    const page = await repo.page("org_1", "usr_1", {}, { page: 1, pageSize: 20 });
    expect(page.items[0]).toEqual({
      id: "ntf_1",
      orgId: "org_1",
      userId: "usr_1",
      type: "mention",
      scope: "space",
      reasons: ["mentioned"],
      matchedReason: "mentioned",
      category: "mentions",
      communityId: "cmy_1",
      spaceId: "spc_1",
      actorOrgUserId: "ou_2",
      subject: { type: "comment", id: "cmt_1" },
      parent: null,
      display: { authorName: "James" },
      createdAt: at,
      readAt: null,
    });
  });

  it("counts unread rows in the org list and per community", async () => {
    const { repo, statements } = capture((text) =>
      text.includes("group by") ? [["cmy_1", 2]] : [[5]],
    );
    await expect(repo.unreadCounts("org_1", "usr_1", ["cmy_1", "cmy_2"])).resolves.toEqual({
      org: 5,
      communities: [{ communityId: "cmy_1", unread: 2 }],
    });
    expect(statements[0]?.text).toContain('"notifications"."community_id" is null');
    expect(statements[1]?.text).toContain('group by "notifications"."community_id"');
  });

  it("marks one in-app row of the person read, keeping its first read time", async () => {
    const { repo, statements } = capture(() => [["ntf_1"]]);
    await expect(repo.markRead("org_1", "usr_1", "ntf_1", at)).resolves.toBe(true);
    expect(statements[0]?.text).toContain('coalesce("notifications"."read_at"');
    expect(statements[0]?.text).toContain('"notifications"."user_id" = $');
    expect(statements[0]?.text).toContain('"notifications"."in_app" = $');
  });

  it("answers false when the notification is not the person's", async () => {
    const { repo } = capture();
    await expect(repo.markRead("org_1", "usr_1", "ntf_x", at)).resolves.toBe(false);
  });

  it("marks the unread rows matching the filters read", async () => {
    const { repo, statements } = capture(() => [["ntf_1"], ["ntf_2"]]);
    await expect(
      repo.markAllRead("org_1", "usr_1", { category: ["followed_posts", "new_posts"] }, at),
    ).resolves.toBe(2);
    expect(statements[0]?.text).toContain('"notifications"."category" in ($');
    expect(statements[0]?.text).toContain('"notifications"."read_at" is null');
    expect(statements[0]?.params).toEqual(expect.arrayContaining(["followed_posts", "new_posts"]));
  });
});
