import { describe, expect, it } from 'vitest';
import {
  ChatListItem,
  ChatListQuery,
  ChatLiveEvent,
  ResolveMessageFlags,
  SendMessage,
} from './chats.js';
import { SetMute, SetPostSubscription } from './discussion.js';

describe('chat schemas', () => {
  it('accepts only a dismissal when resolving message flags', () => {
    expect(ResolveMessageFlags.safeParse({ resolution: 'dismissed' }).success).toBe(true);
    expect(ResolveMessageFlags.safeParse({ resolution: 'deleted' }).success).toBe(false);
    expect(ResolveMessageFlags.safeParse({ resolution: 'locked' }).success).toBe(false);
  });

  it('carries your mute as a subscription, or null', () => {
    const chat = {
      orgId: 'org-1',
      id: 'cht_1',
      communityId: 'cmy_1',
      kind: 'direct',
      status: 'open',
      createdBy: 'ou_1',
      lockedAt: null,
      lockedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const item = {
      chat,
      participantIds: [],
      participants: [],
      lastReadMessageId: null,
      unread: 0,
      lastMessage: null,
    };
    const parsed = ChatListItem.parse({
      ...item,
      subscription: { state: 'muted', mutedUntil: '2030-01-01T00:00:00Z' },
    });
    expect(parsed.subscription).toEqual({
      state: 'muted',
      mutedUntil: new Date('2030-01-01T00:00:00Z'),
    });
    expect(ChatListItem.parse({ ...item, subscription: null }).subscription).toBeNull();
    expect(ChatListItem.safeParse(item).success).toBe(false);
    expect(ChatListItem.safeParse({ ...item, subscription: { state: 'muted' } }).success).toBe(
      false,
    );
  });

  it('carries the participants with their profiles', () => {
    const sarah = {
      id: 'ou_sarah',
      firstName: 'Sarah',
      lastName: null,
      displayName: null,
      headline: 'Learning Spanish',
      image: null,
      imageAssetId: null,
      imageUrl: null,
      team: false,
      roleName: null,
    };
    const item = {
      chat: {
        orgId: 'org-1',
        id: 'cht_1',
        communityId: 'cmy_1',
        kind: 'direct',
        status: 'open',
        createdBy: 'ou_sarah',
        lockedAt: null,
        lockedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      participantIds: ['ou_sarah'],
      lastReadMessageId: null,
      subscription: null,
      unread: 0,
      lastMessage: null,
    };
    expect(ChatListItem.parse({ ...item, participants: [sarah] }).participants).toEqual([sarah]);
    expect(
      ChatListItem.safeParse({ ...item, participants: [{ ...sarah, headline: undefined }] })
        .success,
    ).toBe(false);
  });

  it('reads the requests filter as a boolean, and leaves it out when omitted', () => {
    expect(ChatListQuery.parse({ requests: 'true' })).toEqual({
      page: 1,
      pageSize: 20,
      requests: true,
    });
    expect(ChatListQuery.parse({ requests: 'false' }).requests).toBe(false);
    expect(ChatListQuery.parse({}).requests).toBeUndefined();
    expect(ChatListQuery.safeParse({ requests: 'maybe' }).success).toBe(false);
  });

  it('takes an optional UUID client id on send', () => {
    const clientId = '0f6c2a8e-3b1d-4c8e-9a51-6d2f0b7e4c13';
    expect(SendMessage.parse({ body: 'Hola', clientId }).clientId).toBe(clientId);
    expect(SendMessage.parse({ body: 'Hola' }).clientId).toBeUndefined();
    expect(SendMessage.safeParse({ body: 'Hola', clientId: 'msg-1' }).success).toBe(false);
  });

  it('discriminates live events by type', () => {
    expect(ChatLiveEvent.parse({ type: 'ready', heartbeatMs: 25000 })).toEqual({
      type: 'ready',
      heartbeatMs: 25000,
    });
    expect(
      ChatLiveEvent.parse({
        type: 'typing',
        chatId: 'cht_1',
        orgUserId: 'ou_1',
        until: '2026-11-05T09:00:05.000Z',
      }),
    ).toEqual({
      type: 'typing',
      chatId: 'cht_1',
      orgUserId: 'ou_1',
      until: new Date('2026-11-05T09:00:05.000Z'),
    });
    expect(ChatLiveEvent.safeParse({ type: 'closed', reason: 'other' }).success).toBe(false);
    expect(ChatLiveEvent.safeParse({ type: 'unknown' }).success).toBe(false);
  });
});

describe('subscription bodies', () => {
  it('mutes until changed when no time is given, and accepts an end time', () => {
    expect(SetMute.parse({ state: 'muted' })).toEqual({ state: 'muted' });
    expect(SetMute.parse({ state: 'muted', mutedUntil: null })).toEqual({
      state: 'muted',
      mutedUntil: null,
    });
    expect(SetMute.parse({ state: 'muted', mutedUntil: '2030-01-01T02:00:00+02:00' })).toEqual({
      state: 'muted',
      mutedUntil: new Date('2030-01-01T00:00:00Z'),
    });
    expect(SetMute.safeParse({ state: 'muted', mutedUntil: 'tomorrow' }).success).toBe(false);
  });

  it('takes an end time only with a mute, and following only on a post', () => {
    expect(SetMute.parse({ state: 'none' })).toEqual({ state: 'none' });
    expect(SetMute.safeParse({ state: 'none', mutedUntil: null }).success).toBe(false);
    expect(SetMute.safeParse({ state: 'following' }).success).toBe(false);
    expect(SetPostSubscription.parse({ state: 'following' })).toEqual({ state: 'following' });
    expect(
      SetPostSubscription.safeParse({ state: 'following', mutedUntil: '2030-01-01T00:00:00Z' })
        .success,
    ).toBe(false);
    expect(SetPostSubscription.safeParse({ state: 'subscribed' }).success).toBe(false);
  });
});
