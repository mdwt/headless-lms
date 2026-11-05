import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { ConflictError } from "@headless-lms/core/shared/errors";
import { genId } from "@headless-lms/core/shared/id";
import type { Chat, Message } from "@headless-lms/core/types";
import { runMigrations } from "../migrate.js";
import { DrizzleChatRepository } from "./chats.js";
import { DrizzleSubscriptionsRepository } from "./subscriptions.js";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("DrizzleChatRepository on Postgres", () => {
  let pool: pg.Pool;
  let repo: DrizzleChatRepository;
  let subscriptions: DrizzleSubscriptionsRepository;
  const org = genId("organization");
  const community = genId("community");
  const sarah = genId("orgUser");
  const james = genId("orgUser");
  const emma = genId("orgUser");
  let clock = Date.parse("2026-11-05T09:00:00.000Z");
  const tick = () => new Date((clock += 1000));

  beforeAll(async () => {
    await runMigrations(url!);
    pool = new pg.Pool({ connectionString: url, max: 2 });
    const db = drizzle(pool);
    repo = new DrizzleChatRepository(db);
    subscriptions = new DrizzleSubscriptionsRepository(db);
    const owner = genId("user");
    await pool.query("insert into users (id, email) values ($1, $2)", [owner, `${owner}@test`]);
    await pool.query(
      "insert into organizations (id, name, slug, owner_id) values ($1, 'Spanish in 90 Days', $1, $2)",
      [org, owner],
    );
    for (const orgUserId of [sarah, james, emma]) {
      const user = genId("user");
      await pool.query("insert into users (id, email) values ($1, $2)", [user, `${user}@test`]);
      await pool.query("insert into org_users (org_id, id, user_id) values ($1, $2, $3)", [
        org,
        orgUserId,
        user,
      ]);
    }
    await pool.query("insert into content_items (org_id, id, type) values ($1, $2, 'community')", [
      org,
      community,
    ]);
    await pool.query(
      "insert into communities (org_id, id, title, slug) values ($1, $2, 'Spring cohort', $2)",
      [org, community],
    );
  });

  afterAll(async () => {
    await pool?.end();
  });

  async function chat(
    kind: Chat["kind"],
    status: Chat["status"],
    createdBy: string,
    people: string[],
  ): Promise<Chat> {
    const now = tick();
    const saved = await repo.insertChat(org, {
      orgId: org,
      id: genId("chat"),
      communityId: community,
      kind,
      status,
      createdBy,
      lockedAt: null,
      lockedBy: null,
      createdAt: now,
      updatedAt: now,
    });
    for (const orgUserId of people) {
      await repo.join(org, {
        orgId: org,
        communityId: community,
        chatId: saved.id,
        orgUserId,
        joinedAt: now,
        leftAt: null,
        lastReadMessageId: null,
        createdAt: now,
        updatedAt: now,
      });
    }
    return saved;
  }

  async function send(chatId: string, orgUserId: string, clientId: string | null = null) {
    const now = tick();
    return repo.insertMessage(org, {
      orgId: org,
      id: genId("message"),
      communityId: community,
      chatId,
      orgUserId,
      body: "Hola",
      replyToId: null,
      clientId,
      editedAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    } satisfies Message);
  }

  it("stores a client id once per member and chat, and finds the message by it", async () => {
    const direct = await chat("direct", "open", sarah, [sarah, james]);
    const clientId = "0f6c3a52-8f1e-4d8a-9a3b-4f1b2c3d4e5f";
    const sent = await send(direct.id, sarah, clientId);
    expect(sent.clientId).toBe(clientId);
    await expect(send(direct.id, sarah, clientId)).rejects.toBeInstanceOf(ConflictError);
    await expect(send(direct.id, james, clientId)).resolves.toMatchObject({ clientId });
    await send(direct.id, sarah);
    await send(direct.id, sarah);
    expect(await repo.findByClientId(org, direct.id, sarah, clientId)).toMatchObject({
      id: sent.id,
    });
    expect(await repo.findByClientId(org, direct.id, emma, clientId)).toBeNull();
  });

  it("moves a read mark only forward", async () => {
    const direct = await chat("direct", "open", sarah, [sarah, james]);
    const first = await send(direct.id, james);
    const second = await send(direct.id, james);
    expect(await repo.setRead(org, direct.id, sarah, first.id)).toBe(true);
    expect(await repo.setRead(org, direct.id, sarah, second.id)).toBe(true);
    expect(await repo.setRead(org, direct.id, sarah, first.id)).toBe(false);
    expect(await repo.setRead(org, direct.id, sarah, second.id)).toBe(false);
    const [mark] = (await repo.participants(org, direct.id)).filter(
      (user) => user.orgUserId === sarah,
    );
    expect(mark?.lastReadMessageId).toBe(second.id);
  });

  it("reports whether a reaction was inserted and whether it changed", async () => {
    const direct = await chat("direct", "open", sarah, [sarah, james]);
    const message = await send(direct.id, james);
    const set = (emoji: string | null) =>
      repo.setReaction(org, community, message.id, sarah, emoji);
    expect(await set("👍")).toEqual({ inserted: true, changed: true });
    expect(await set("👍")).toEqual({ inserted: false, changed: false });
    expect(await set("🎉")).toEqual({ inserted: false, changed: true });
    expect(await set(null)).toEqual({ inserted: false, changed: true });
    expect(await set(null)).toEqual({ inserted: false, changed: false });
  });

  it("filters the inbox to requests, reads one row, and totals unread past mutes", async () => {
    const request = await chat("direct", "pending", james, [sarah, james]);
    await send(request.id, james);
    const group = await chat("group", "open", sarah, [sarah, james, emma]);
    await send(group.id, james);
    await send(group.id, emma);
    const quiet = await chat("group", "open", emma, [sarah, james, emma]);
    await send(quiet.id, emma);
    await subscriptions.upsert(org, {
      orgId: org,
      orgUserId: sarah,
      itemType: "chat",
      itemId: quiet.id,
      state: "muted",
      mutedUntil: null,
      createdAt: new Date(),
    });
    await repo.markLeft(org, group.id, emma, tick());

    const page = { page: 1, pageSize: 50 };
    const requests = await repo.listForUser(org, community, sarah, { ...page, requests: true });
    expect(requests.rows.map((row) => row.chat.id)).toEqual([request.id]);
    expect(requests.total).toBe(1);
    const rest = await repo.listForUser(org, community, sarah, { ...page, requests: false });
    expect(rest.rows.map((row) => row.chat.id)).not.toContain(request.id);
    expect(rest.rows.map((row) => row.chat.id)).toEqual(
      expect.arrayContaining([group.id, quiet.id]),
    );
    expect(
      (await repo.listForUser(org, community, james, { ...page, requests: true })).rows,
    ).toEqual([]);

    expect(await repo.inboxRow(org, group.id, sarah)).toMatchObject({
      chat: { id: group.id },
      participantIds: [sarah, james].sort(),
      unread: 2,
      lastMessage: { orgUserId: emma },
    });
    expect(await repo.inboxRow(org, group.id, emma)).toBeNull();
    expect(await repo.activeParticipants(org, group.id)).toEqual([sarah, james].sort());

    const [states] = await repo.memberStates(org, community, [sarah], new Date());
    const before = (await repo.listForUser(org, community, sarah, page)).rows.filter(
      (row) => row.chat.id !== request.id && row.chat.id !== quiet.id,
    );
    const expected = before.reduce((sum, row) => sum + row.unread, 0) + 1;
    expect(states?.unread).toEqual({ unread: expected, requests: 1 });
    expect(states?.chats.find((state) => state.chatId === quiet.id)).toMatchObject({
      unread: 1,
      subscription: { state: "muted", mutedUntil: null },
    });
    expect(await repo.unreadSummary(org, community, sarah, new Date())).toEqual(states?.unread);
    expect(await repo.unreadSummary(org, community, james, new Date())).toEqual({
      unread: expect.any(Number),
      requests: 0,
    });
    expect(await repo.memberStates(org, community, [], new Date())).toEqual([]);
  });
});
