import { describe, expect, it } from 'vitest';
import { ForbiddenError, InvalidInputError, NotFoundError } from '../shared/errors.js';
import type { Actor } from '../shared/actor.js';
import type { Chat, ChatUser, Subscription } from '../types/index.js';
import { SubscriptionServiceImpl } from './subscriptions.js';
import type { SubscriptionsRepository } from './ports.js';

const ORG = 'org-1';
const sarah: Actor = { id: 'ou_sarah', role: 'student' };
const james: Actor = { id: 'ou_james', role: 'student' };
const emma: Actor = { id: 'ou_emma', role: 'student' };
const outsider: Actor = { id: 'ou_out', role: 'student' };
const AT = new Date('2026-11-03T12:00:00.000Z');

function subscriptionStore() {
  const rows: Subscription[] = [];
  const same = (row: Subscription, orgUserId: string, itemType: string, itemId: string) =>
    row.orgUserId === orgUserId && row.itemType === itemType && row.itemId === itemId;
  const repo: SubscriptionsRepository = {
    async upsert(_orgId, subscription) {
      const index = rows.findIndex((row) =>
        same(row, subscription.orgUserId, subscription.itemType, subscription.itemId),
      );
      if (index >= 0) {
        rows[index] = {
          ...rows[index]!,
          state: subscription.state,
          mutedUntil: subscription.mutedUntil,
        };
        return;
      }
      rows.push({ ...subscription });
    },
    async remove(_orgId, orgUserId, itemType, itemId) {
      const index = rows.findIndex((row) => same(row, orgUserId, itemType, itemId));
      if (index >= 0) {
        rows.splice(index, 1);
      }
    },
    async forViewer(_orgId, orgUserId, itemType, itemIds) {
      return rows.filter(
        (row) =>
          row.orgUserId === orgUserId && row.itemType === itemType && itemIds.includes(row.itemId),
      );
    },
    async ofItem(_orgId, itemType, itemId) {
      return rows.filter((row) => row.itemType === itemType && row.itemId === itemId);
    },
    async followerIds(_orgId, postId) {
      return rows
        .filter(
          (row) => row.itemType === 'post' && row.itemId === postId && row.state === 'following',
        )
        .map((row) => row.orgUserId);
    },
    async mutedAmong(_orgId, itemType, itemId, orgUserIds, at) {
      return rows
        .filter(
          (row) =>
            row.itemType === itemType &&
            row.itemId === itemId &&
            row.state === 'muted' &&
            orgUserIds.includes(row.orgUserId) &&
            (row.mutedUntil === null || row.mutedUntil > at),
        )
        .map((row) => row.orgUserId);
    },
  };
  return { rows, repo };
}

function chatUser(orgUserId: string, leftAt: Date | null = null): ChatUser {
  return {
    orgId: ORG,
    communityId: 'cmy_1',
    chatId: 'cht_1',
    orgUserId,
    joinedAt: AT,
    leftAt,
    lastReadMessageId: null,
    createdAt: AT,
    updatedAt: AT,
  };
}

function harness() {
  const store = subscriptionStore();
  const svc = new SubscriptionServiceImpl({
    repo: store.repo,
    access: {
      async canOpenSpace(_orgId, actor, spaceId) {
        return spaceId === 'spc_1' && actor.id !== outsider.id;
      },
      async isCommunityMember(_orgId, actor) {
        return actor.id !== outsider.id;
      },
    },
    posts: {
      async visible(_orgId, actor, postId) {
        if (postId !== 'pst_1' || actor.id === outsider.id) {
          throw new NotFoundError('Post', postId);
        }
        return { post: {} as never, space: {} as never };
      },
    },
    chats: {
      async chatSummary(_orgId, chatId) {
        if (chatId !== 'cht_1') {
          return null;
        }
        return {
          chat: { communityId: 'cmy_1' } as Chat,
          participants: [chatUser(sarah.id), chatUser(james.id), chatUser(emma.id, AT)],
        };
      },
    },
  });
  return { svc, rows: store.rows };
}

const rowOf = (rows: Subscription[], orgUserId: string, itemType: string, itemId: string) =>
  rows.find(
    (row) => row.orgUserId === orgUserId && row.itemType === itemType && row.itemId === itemId,
  );

describe('subscriptions', () => {
  it('follows, mutes and clears a post for someone who can read it', async () => {
    const { svc, rows } = harness();
    await svc.setPost(ORG, emma, 'pst_1', { state: 'following' });
    expect(rowOf(rows, emma.id, 'post', 'pst_1')).toMatchObject({
      state: 'following',
      mutedUntil: null,
    });
    const until = new Date('2030-01-01T00:00:00.000Z');
    await svc.setPost(ORG, emma, 'pst_1', { state: 'muted', mutedUntil: until });
    expect(rowOf(rows, emma.id, 'post', 'pst_1')).toMatchObject({
      state: 'muted',
      mutedUntil: until,
    });
    expect(rows).toHaveLength(1);
    await svc.setPost(ORG, emma, 'pst_1', { state: 'none' });
    expect(rows).toHaveLength(0);
  });

  it('refuses a post the person cannot read as missing', async () => {
    const { svc, rows } = harness();
    await expect(
      svc.setPost(ORG, outsider, 'pst_1', { state: 'following' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(svc.setPost(ORG, emma, 'pst_x', { state: 'none' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(rows).toHaveLength(0);
  });

  it('mutes a space the person can open and refuses one they cannot as missing', async () => {
    const { svc, rows } = harness();
    await svc.setSpace(ORG, james, 'spc_1', { state: 'muted' });
    expect(rowOf(rows, james.id, 'space', 'spc_1')).toMatchObject({
      state: 'muted',
      mutedUntil: null,
    });
    await expect(svc.setSpace(ORG, outsider, 'spc_1', { state: 'muted' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(svc.setSpace(ORG, james, 'spc_2', { state: 'muted' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await svc.setSpace(ORG, james, 'spc_1', { state: 'none' });
    expect(rows).toHaveLength(0);
  });

  it('mutes a chat only for a participant who has not left it', async () => {
    const { svc, rows } = harness();
    const until = new Date('2030-01-01T00:00:00.000Z');
    await svc.setChat(ORG, james, 'cht_1', { state: 'muted', mutedUntil: until });
    expect(rowOf(rows, james.id, 'chat', 'cht_1')).toMatchObject({
      state: 'muted',
      mutedUntil: until,
    });
    await expect(svc.setChat(ORG, emma, 'cht_1', { state: 'muted' })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(svc.setChat(ORG, outsider, 'cht_1', { state: 'muted' })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(svc.setChat(ORG, james, 'cht_x', { state: 'muted' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('follows only a post', async () => {
    const { svc } = harness();
    await expect(
      svc.setSpace(ORG, james, 'spc_1', { state: 'following' } as never),
    ).rejects.toBeInstanceOf(InvalidInputError);
  });

  it('answers who among a list has an active mute, honouring the end time', async () => {
    const { svc } = harness();
    await svc.setChat(ORG, sarah, 'cht_1', { state: 'muted' });
    await svc.setChat(ORG, james, 'cht_1', {
      state: 'muted',
      mutedUntil: new Date('2026-11-03T13:00:00.000Z'),
    });
    await svc.setPost(ORG, emma, 'pst_1', { state: 'following' });
    const chat = { type: 'chat' as const, id: 'cht_1' };
    expect(await svc.mutedAmong(ORG, chat, [sarah.id, james.id, emma.id], AT)).toEqual([
      sarah.id,
      james.id,
    ]);
    expect(
      await svc.mutedAmong(ORG, chat, [sarah.id, james.id], new Date('2026-11-03T13:00:00.000Z')),
    ).toEqual([sarah.id]);
    expect(await svc.mutedAmong(ORG, { type: 'post', id: 'pst_1' }, [emma.id], AT)).toEqual([]);
    expect(await svc.mutedAmong(ORG, { type: 'comment', id: 'cmt_1' }, [sarah.id], AT)).toEqual([]);
    expect(await svc.mutedAmong(ORG, chat, [], AT)).toEqual([]);
  });

  it('lists followers and an item’s subscriptions, and a viewer’s active ones', async () => {
    const { svc } = harness();
    await svc.setPost(ORG, emma, 'pst_1', { state: 'following' });
    await svc.setPost(ORG, james, 'pst_1', { state: 'muted' });
    await svc.setSpace(ORG, james, 'spc_1', {
      state: 'muted',
      mutedUntil: new Date('2026-11-03T11:00:00.000Z'),
    });
    expect(await svc.followerIds(ORG, 'pst_1')).toEqual([emma.id]);
    expect(
      (await svc.itemSubscriptions(ORG, { type: 'post', id: 'pst_1' })).map((row) => [
        row.orgUserId,
        row.state,
      ]),
    ).toEqual([
      [emma.id, 'following'],
      [james.id, 'muted'],
    ]);
    expect(await svc.viewerSubscriptions(ORG, james.id, 'post', ['pst_1', 'pst_2'], AT)).toEqual({
      pst_1: { state: 'muted', mutedUntil: null },
    });
    expect(await svc.viewerSubscriptions(ORG, james.id, 'space', ['spc_1'], AT)).toEqual({});
  });
});
