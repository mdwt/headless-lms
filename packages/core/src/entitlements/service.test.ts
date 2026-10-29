import { describe, it, expect, vi } from 'vitest';
import { EntitlementsServiceImpl } from './service.js';
import type { EntitlementsRepository, EntitlementsUnitOfWork } from './ports.js';
import type { Entitlement } from './model.js';
import type { NewDomainEvent, OutboxAppender } from '../shared/ports.js';

const SAMPLE: Entitlement = {
  orgId: 'org-1',
  id: 'e1',
  orgUserId: 's1',
  bundleId: null,
  contentId: 'c1',
  status: 'active',
  grantedAt: new Date('2026-01-01T00:00:00Z'),
  expiresAt: null,
  source: 'manual',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

function fakeRepo(over?: Partial<EntitlementsRepository>): EntitlementsRepository {
  return {
    list: vi.fn().mockResolvedValue({ rows: [SAMPLE], total: 1, page: 1, pageSize: 20 }),
    insert: vi.fn().mockResolvedValue(SAMPLE),
    setStatus: vi.fn().mockResolvedValue(SAMPLE),
    hasAccess: vi.fn().mockResolvedValue(true),
    listAccessibleContent: vi.fn().mockResolvedValue(['c1']),
    ...over,
  };
}

/** Pass-through unit of work: runs the callback with the fake repo as the
 *  tx-bound scope plus a capturing outbox appender. */
function fakeUow(repo: EntitlementsRepository) {
  const appended: NewDomainEvent[] = [];
  const append = vi.fn(async (events: NewDomainEvent[]) => {
    appended.push(...events);
  });
  const outbox: OutboxAppender = { append };
  const uow: EntitlementsUnitOfWork = {
    run: (fn) => fn({ entitlements: repo, outbox }),
  };
  return { uow, append, appended };
}

function build(repo = fakeRepo()) {
  const { uow, append, appended } = fakeUow(repo);
  const svc = new EntitlementsServiceImpl({ repo, uow });
  return { svc, repo, append, appended };
}

describe('EntitlementsService', () => {
  it('lists entitlements via the read repository without appending events', async () => {
    const { svc, repo, append } = build();
    const page = await svc.list('org-1', { page: 1, pageSize: 20 });
    expect(page.rows).toHaveLength(1);
    expect(repo.list).toHaveBeenCalledWith('org-1', { page: 1, pageSize: 20 });
    expect(append).not.toHaveBeenCalled();
  });

  it('grants an entitlement (insert) and returns it', async () => {
    const { svc, repo } = build();
    const result = await svc.grant('org-1', { orgUserId: 's1', contentId: 'c1', expiresAt: null });
    expect(result.id).toBe('e1');
    expect(repo.insert).toHaveBeenCalledWith('org-1', {
      orgUserId: 's1',
      contentId: 'c1',
      expiresAt: null,
    });
  });

  it('appends entitlement.created (org + full snapshot) inside the unit of work', async () => {
    const { svc, appended } = build();
    await svc.grant('org-1', { orgUserId: 's1', contentId: 'c1', expiresAt: null });
    expect(appended).toEqual([
      expect.objectContaining({
        type: 'entitlement.created',
        orgId: 'org-1',
        data: SAMPLE,
      }),
    ]);
  });

  it('sets status (revoke/reactivate) via the tx-bound repository', async () => {
    const { svc, repo } = build();
    await svc.setStatus('org-1', 'e1', 'revoked');
    expect(repo.setStatus).toHaveBeenCalledWith('org-1', 'e1', 'revoked');
  });

  it('appends entitlement.deleted on revoke', async () => {
    const { svc, appended } = build();
    await svc.setStatus('org-1', 'e1', 'revoked');
    expect(appended).toEqual([
      expect.objectContaining({
        type: 'entitlement.deleted',
        orgId: 'org-1',
        data: SAMPLE,
      }),
    ]);
  });

  it('appends entitlement.updated on reactivation', async () => {
    const { svc, appended } = build();
    await svc.setStatus('org-1', 'e1', 'active');
    expect(appended).toEqual([
      expect.objectContaining({
        type: 'entitlement.updated',
        orgId: 'org-1',
        data: SAMPLE,
      }),
    ]);
  });

  it('appends nothing when setStatus finds no entitlement', async () => {
    const { svc, append } = build(fakeRepo({ setStatus: vi.fn().mockResolvedValue(null) }));
    const result = await svc.setStatus('org-1', 'missing', 'revoked');
    expect(result).toBeNull();
    expect(append).not.toHaveBeenCalled();
  });

  it('does not append when the write fails — the error propagates out of run', async () => {
    const { svc, append } = build(
      fakeRepo({ insert: vi.fn().mockRejectedValue(new Error('boom')) }),
    );
    await expect(
      svc.grant('org-1', { orgUserId: 's1', contentId: 'c1', expiresAt: null }),
    ).rejects.toThrow('boom');
    expect(append).not.toHaveBeenCalled();
  });

  it('reports access when the repository resolves it', async () => {
    const { svc, repo } = build(fakeRepo({ hasAccess: vi.fn().mockResolvedValue(true) }));
    const allowed = await svc.hasAccess('org-1', 's1', 'c1');
    expect(allowed).toBe(true);
    expect(repo.hasAccess).toHaveBeenCalledWith('org-1', 's1', 'c1');
  });

  it('reports no access when the repository resolves none', async () => {
    const { svc } = build(fakeRepo({ hasAccess: vi.fn().mockResolvedValue(false) }));
    const allowed = await svc.hasAccess('org-1', 'nobody', 'c1');
    expect(allowed).toBe(false);
  });

  it('lists accessible content through the repository, passing the type filter', async () => {
    const { svc, repo } = build();
    const ids = await svc.listAccessibleContent('org-1', 's1', 'course');
    expect(ids).toEqual(['c1']);
    expect(repo.listAccessibleContent).toHaveBeenCalledWith('org-1', 's1', 'course');
  });
});

describe('logging', () => {
  it('logs grant and status changes at info', async () => {
    const { createCapturingLogger } = await import('../shared/logger.js');
    const { logger, entries } = createCapturingLogger();
    const repo = fakeRepo();
    const { uow } = fakeUow(repo);
    const svc = new EntitlementsServiceImpl({ repo, uow, logger });

    const entitlement = await svc.grant('org-1', {
      orgUserId: 's1',
      contentId: 'c1',
      expiresAt: null,
    });
    await svc.setStatus('org-1', entitlement.id, 'revoked');

    expect(entries.map((e) => [e.level, e.msg])).toEqual([
      ['info', 'entitlement granted'],
      ['info', 'entitlement status changed'],
    ]);
    expect(entries[0]?.meta).toMatchObject({
      orgId: 'org-1',
      entitlementId: entitlement.id,
      orgUserId: 's1',
      contentId: 'c1',
    });
    expect(entries[1]?.meta).toMatchObject({
      orgId: 'org-1',
      entitlementId: entitlement.id,
      status: 'revoked',
    });
  });
});
