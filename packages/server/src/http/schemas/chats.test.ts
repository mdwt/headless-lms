import { describe, expect, it } from 'vitest';
import { ChatListItem, ResolveMessageFlags } from './chats.js';
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
