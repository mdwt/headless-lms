import { describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../shared/errors.js';
import { notificationKindSchema } from '../types/schemas/identity.js';
import type { Notification, NotificationPreference } from './model.js';
import { NotificationServiceImpl } from './notifications.js';
import type { NotificationsRepository } from './ports.js';

function fakeRepo(stored: (NotificationPreference & { userId: string })[] = []) {
  const rows: Notification[] = [];
  const repo: NotificationsRepository = {
    insert: vi.fn(async (_orgId, inserted) => {
      rows.push(...inserted);
    }),
    page: vi.fn(async () => ({ rows, total: rows.length, unreadCount: rows.length })),
    markRead: vi.fn(async () => null),
    markAllRead: vi.fn(async () => 0),
    preferences: vi.fn(async (_orgId, userIds) =>
      stored.filter((row) => userIds.includes(row.userId)),
    ),
    upsertPreferences: vi.fn(async () => {}),
  };
  return { repo, rows };
}

const about = {
  actorOrgUserId: 'ou_sarah',
  communityId: 'cmy_1',
  spaceId: 'spc_1',
  postId: 'pst_1',
  commentId: null,
  chatId: null,
  messageId: null,
};

describe('NotificationServiceImpl', () => {
  it('stores each notification unread for its person', async () => {
    const { repo, rows } = fakeRepo();
    const svc = new NotificationServiceImpl({ repo });

    await svc.notify('o1', [{ ...about, userId: 'usr_james', kind: 'newPostInSpace' }]);

    expect(rows).toEqual([
      expect.objectContaining({
        ...about,
        orgId: 'o1',
        userId: 'usr_james',
        kind: 'newPostInSpace',
        readAt: null,
        id: expect.stringMatching(/^ntf_/),
      }),
    ]);
  });

  it('tells a person in the app and by email until they turn it off', async () => {
    const { repo } = fakeRepo([
      { userId: 'usr_emma', kind: 'newPostInSpace', inApp: false, email: false },
      { userId: 'usr_emma', kind: 'newMessage', inApp: true, email: false },
    ]);
    const svc = new NotificationServiceImpl({ repo });

    expect(await svc.preferencesFor('o1', ['usr_james', 'usr_emma'], 'newPostInSpace')).toEqual({
      usr_james: { kind: 'newPostInSpace', inApp: true, email: true },
      usr_emma: { kind: 'newPostInSpace', inApp: false, email: false },
    });
  });

  it('lists a preference for every kind', async () => {
    const { repo } = fakeRepo([
      { userId: 'usr_emma', kind: 'newMessage', inApp: true, email: false },
    ]);
    const svc = new NotificationServiceImpl({ repo });

    const preferences = await svc.notificationPreferences('o1', 'usr_emma');

    expect(preferences.map((pref) => pref.kind)).toEqual(notificationKindSchema.options);
    expect(preferences.find((pref) => pref.kind === 'newMessage')).toEqual({
      kind: 'newMessage',
      inApp: true,
      email: false,
    });
  });

  it('refuses to mark read a notification that is not the person’s', async () => {
    const { repo } = fakeRepo();
    const svc = new NotificationServiceImpl({ repo });

    await expect(svc.markNotificationRead('o1', 'usr_james', 'ntf_other')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
