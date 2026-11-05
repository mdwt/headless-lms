import { describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../../shared/errors.js';
import type { NotificationsRepository } from '../ports.js';
import { NotificationsServiceImpl } from './service.js';
import { actorWith } from '../../organizations/index.js';

const ACTOR = { ...actorWith({ id: 'ou_1', orgId: 'org_1' }), userId: 'usr_1' };

function fakeRepo(over: Partial<NotificationsRepository> = {}): NotificationsRepository {
  return {
    insert: vi.fn(async () => {}),
    pendingDeliveriesForEvent: vi.fn(async () => []),
    findDelivery: vi.fn(async () => null),
    markSent: vi.fn(async () => {}),
    recordError: vi.fn(async () => {}),
    markFailed: vi.fn(async () => {}),
    page: vi.fn(async () => ({ items: [], total: 0, unreadCount: 0 })),
    find: vi.fn(async () => null),
    unreadCounts: vi.fn(async () => ({ org: 0, communities: [] })),
    markRead: vi.fn(async () => true),
    markAllRead: vi.fn(async () => 0),
    ...over,
  };
}

describe('NotificationsService', () => {
  it('lists through the repository with the filter and page', async () => {
    const repo = fakeRepo();
    const svc = new NotificationsServiceImpl({ repo });
    await svc.list({ category: ['mentions'] }, { page: 1, pageSize: 20 }, ACTOR);
    expect(repo.page).toHaveBeenCalledWith(
      'org_1',
      'usr_1',
      { category: ['mentions'] },
      { page: 1, pageSize: 20 },
    );
  });

  it('reads one notification of the person through the repository', async () => {
    const repo = fakeRepo();
    const svc = new NotificationsServiceImpl({ repo });
    await expect(svc.get('ntf_1', ACTOR)).resolves.toBeNull();
    expect(repo.find).toHaveBeenCalledWith('org_1', 'usr_1', 'ntf_1');
  });

  it('reads only the acting member’s notifications, never another member’s', async () => {
    const repo = fakeRepo({
      find: vi.fn(async (_orgId, userId, id) =>
        userId === 'usr_james' && id === 'ntf_james' ? ({ id } as never) : null,
      ),
      markRead: vi.fn(async (_orgId, userId, id) => userId === 'usr_james' && id === 'ntf_james'),
    });
    const svc = new NotificationsServiceImpl({ repo });
    const sarah = { ...actorWith({ id: 'ou_sarah', orgId: 'org_1' }), userId: 'usr_sarah' };
    await expect(svc.get('ntf_james', sarah)).resolves.toBeNull();
    expect(repo.find).toHaveBeenCalledTimes(1);
    expect(repo.find).toHaveBeenCalledWith('org_1', 'usr_sarah', 'ntf_james');
    await expect(svc.markRead('ntf_james', sarah)).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.markRead).toHaveBeenCalledWith('org_1', 'usr_sarah', 'ntf_james', expect.any(Date));
  });

  it('answers a count for every community asked, zero when none is unread', async () => {
    const repo = fakeRepo({
      unreadCounts: vi.fn(async () => ({
        org: 2,
        communities: [{ communityId: 'cmy_2', unread: 4 }],
      })),
    });
    const svc = new NotificationsServiceImpl({ repo });
    await expect(svc.unreadCounts(['cmy_1', 'cmy_2', 'cmy_1'], ACTOR)).resolves.toEqual({
      org: 2,
      communities: [
        { communityId: 'cmy_1', unread: 0 },
        { communityId: 'cmy_2', unread: 4 },
      ],
    });
    expect(repo.unreadCounts).toHaveBeenCalledWith('org_1', 'usr_1', ['cmy_1', 'cmy_2']);
  });

  it('marks one read, and throws NotFoundError when it is not the person’s', async () => {
    const repo = fakeRepo({ markRead: vi.fn(async (_o, _u, id) => id === 'ntf_1') });
    const svc = new NotificationsServiceImpl({ repo });
    await expect(svc.markRead('ntf_1', ACTOR)).resolves.toBeUndefined();
    await expect(svc.markRead('ntf_x', ACTOR)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('marks the notifications matching the filter read', async () => {
    const repo = fakeRepo({ markAllRead: vi.fn(async () => 3) });
    const svc = new NotificationsServiceImpl({ repo });
    await expect(
      svc.markAllRead({ reason: ['comment_author', 'thread_participant'] }, ACTOR),
    ).resolves.toEqual({ marked: 3 });
    expect(repo.markAllRead).toHaveBeenCalledWith(
      'org_1',
      'usr_1',
      { reason: ['comment_author', 'thread_participant'] },
      expect.any(Date),
    );
  });
});
