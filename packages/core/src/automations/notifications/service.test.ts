import { describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../../shared/errors.js';
import type { NotificationsRepository } from '../ports.js';
import { NotificationsServiceImpl } from './service.js';
import { actorWith } from '../../organizations/index.js';

const ACTOR = actorWith({ id: 'ou_1', orgId: 'org_1' });

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
    await svc.list('usr_1', { category: ['mentions'] }, { page: 1, pageSize: 20 }, ACTOR);
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
    await expect(svc.get('usr_1', 'ntf_1', ACTOR)).resolves.toBeNull();
    expect(repo.find).toHaveBeenCalledWith('org_1', 'usr_1', 'ntf_1');
  });

  it('answers a count for every community asked, zero when none is unread', async () => {
    const repo = fakeRepo({
      unreadCounts: vi.fn(async () => ({
        org: 2,
        communities: [{ communityId: 'cmy_2', unread: 4 }],
      })),
    });
    const svc = new NotificationsServiceImpl({ repo });
    await expect(svc.unreadCounts('usr_1', ['cmy_1', 'cmy_2', 'cmy_1'], ACTOR)).resolves.toEqual({
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
    await expect(svc.markRead('usr_1', 'ntf_1', ACTOR)).resolves.toBeUndefined();
    await expect(svc.markRead('usr_1', 'ntf_x', ACTOR)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('marks the notifications matching the filter read', async () => {
    const repo = fakeRepo({ markAllRead: vi.fn(async () => 3) });
    const svc = new NotificationsServiceImpl({ repo });
    await expect(
      svc.markAllRead('usr_1', { reason: ['comment_author', 'thread_participant'] }, ACTOR),
    ).resolves.toEqual({ marked: 3 });
    expect(repo.markAllRead).toHaveBeenCalledWith(
      'org_1',
      'usr_1',
      { reason: ['comment_author', 'thread_participant'] },
      expect.any(Date),
    );
  });
});
