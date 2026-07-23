import { describe, it, expect, vi } from 'vitest';
import { EntitlementsServiceImpl } from './service.js';
import type { EntitlementsRepository, EntitlementsUnitOfWork } from './ports.js';
import type { Entitlement } from './model.js';
import type { NewDomainEvent, OutboxAppender } from '../shared/ports.js';

const SAMPLE: Entitlement = {
  id: 'e1',
  studentId: 's1',
  firstName: 'Bob',
  lastName: 'Smith',
  studentEmail: 'bob@example.com',
  content: { id: 'c1', type: 'course', title: 'Intro' },
  status: 'active',
  grantedAt: '2026-01-01T00:00:00Z',
  expiresAt: null,
  source: 'manual',
};

function fakeRepo(over?: Partial<EntitlementsRepository>): EntitlementsRepository {
  return {
    list: vi.fn().mockResolvedValue({ rows: [SAMPLE], total: 1, page: 1, pageSize: 20 }),
    insert: vi.fn().mockResolvedValue(SAMPLE),
    setStatus: vi.fn().mockResolvedValue(SAMPLE),
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
  const svc = new EntitlementsServiceImpl(repo, uow);
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
    const result = await svc.grant('org-1', { studentId: 's1', contentId: 'c1', expiresAt: null });
    expect(result.id).toBe('e1');
    expect(repo.insert).toHaveBeenCalledWith('org-1', {
      studentId: 's1',
      contentId: 'c1',
      expiresAt: null,
    });
  });

  it('appends entitlement.created (org + full snapshot) inside the unit of work', async () => {
    const { svc, appended } = build();
    await svc.grant('org-1', { studentId: 's1', contentId: 'c1', expiresAt: null });
    expect(appended).toEqual([{ type: 'entitlement.created', orgId: 'org-1', entitlement: SAMPLE }]);
  });

  it('sets status (revoke/reactivate) via the tx-bound repository', async () => {
    const { svc, repo } = build();
    await svc.setStatus('org-1', 'e1', 'revoked');
    expect(repo.setStatus).toHaveBeenCalledWith('org-1', 'e1', 'revoked');
  });

  it('appends entitlement.deleted on revoke', async () => {
    const { svc, appended } = build();
    await svc.setStatus('org-1', 'e1', 'revoked');
    expect(appended).toEqual([{ type: 'entitlement.deleted', orgId: 'org-1', entitlement: SAMPLE }]);
  });

  it('appends entitlement.updated on reactivation', async () => {
    const { svc, appended } = build();
    await svc.setStatus('org-1', 'e1', 'active');
    expect(appended).toEqual([{ type: 'entitlement.updated', orgId: 'org-1', entitlement: SAMPLE }]);
  });

  it('appends nothing when setStatus finds no entitlement', async () => {
    const { svc, append } = build(fakeRepo({ setStatus: vi.fn().mockResolvedValue(null) }));
    const result = await svc.setStatus('org-1', 'missing', 'revoked');
    expect(result).toBeNull();
    expect(append).not.toHaveBeenCalled();
  });

  it('sends the accessGranted email after a grant when a mailer is configured', async () => {
    const repo = fakeRepo();
    const { uow } = fakeUow(repo);
    const send = vi.fn().mockResolvedValue(undefined);
    const svc = new EntitlementsServiceImpl(repo, uow, undefined, { send }, {
      studentPortalUrl: 'https://learn.example.com',
    });
    await svc.grant('org-1', { studentId: 's1', contentId: 'c1', expiresAt: null });
    expect(send).toHaveBeenCalledWith('bob@example.com', 'accessGranted', {
      contentTitle: 'Intro',
      contentUrl: 'https://learn.example.com/courses/c1',
    });
  });

  it('grant succeeds when the accessGranted email fails to send', async () => {
    const repo = fakeRepo();
    const { uow } = fakeUow(repo);
    const send = vi.fn().mockRejectedValue(new Error('smtp down'));
    const svc = new EntitlementsServiceImpl(repo, uow, undefined, { send }, {
      studentPortalUrl: 'https://learn.example.com',
    });
    const result = await svc.grant('org-1', { studentId: 's1', contentId: 'c1', expiresAt: null });
    expect(result.id).toBe('e1');
  });

  it('sends no email without a configured mailer', async () => {
    const { svc } = build();
    await expect(
      svc.grant('org-1', { studentId: 's1', contentId: 'c1', expiresAt: null }),
    ).resolves.toBeTruthy();
  });

  it('does not append when the write fails — the error propagates out of run', async () => {
    const { svc, append } = build(
      fakeRepo({ insert: vi.fn().mockRejectedValue(new Error('boom')) }),
    );
    await expect(
      svc.grant('org-1', { studentId: 's1', contentId: 'c1', expiresAt: null }),
    ).rejects.toThrow('boom');
    expect(append).not.toHaveBeenCalled();
  });
});

describe('logging', () => {
  it('logs grant and status changes at info', async () => {
    const { createCapturingLogger } = await import('../shared/logger.js');
    const { logger, entries } = createCapturingLogger();
    const repo = fakeRepo();
    const { uow } = fakeUow(repo);
    const svc = new EntitlementsServiceImpl(repo, uow, logger);

    const entitlement = await svc.grant('org-1', {
      studentId: 's1',
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
      studentId: 's1',
      contentId: 'c1',
      contentType: 'course',
    });
    expect(entries[1]?.meta).toMatchObject({
      orgId: 'org-1',
      entitlementId: entitlement.id,
      status: 'revoked',
    });
  });
});
