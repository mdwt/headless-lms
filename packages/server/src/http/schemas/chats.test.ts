import { describe, expect, it } from 'vitest';
import { ChatListItem, MuteChat, ResolveMessageFlags } from './chats.js';

describe('chat schemas', () => {
  it('accepts only a dismissal when resolving message flags', () => {
    expect(ResolveMessageFlags.safeParse({ resolution: 'dismissed' }).success).toBe(true);
    expect(ResolveMessageFlags.safeParse({ resolution: 'deleted' }).success).toBe(false);
    expect(ResolveMessageFlags.safeParse({ resolution: 'locked' }).success).toBe(false);
  });

  it('mutes until unmuted when no time is given and refuses an explicit null', () => {
    expect(MuteChat.parse({})).toEqual({});
    expect(MuteChat.parse({ until: '2030-01-01T00:00:00Z' }).until).toEqual(
      new Date('2030-01-01T00:00:00Z'),
    );
    expect(MuteChat.parse({ until: '2030-01-01T02:00:00+02:00' }).until).toEqual(
      new Date('2030-01-01T00:00:00Z'),
    );
    expect(MuteChat.safeParse({ until: null }).success).toBe(false);
    expect(MuteChat.safeParse({ until: 0 }).success).toBe(false);
    expect(MuteChat.safeParse({ until: 'tomorrow' }).success).toBe(false);
  });

  it('carries a mute as its own shape with no sentinel time', () => {
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
    const item = { chat, participantIds: [], lastReadMessageId: null, unread: 0 };
    expect(ChatListItem.parse({ ...item, mute: null }).mute).toBeNull();
    expect(ChatListItem.parse({ ...item, mute: { until: null } }).mute).toEqual({ until: null });
    expect(ChatListItem.safeParse({ ...item, mutedUntil: null }).success).toBe(false);
  });
});
