import { describe, it, expect, vi } from 'vitest';
import { EntitlementsServiceImpl } from './service.js';
import type { EntitlementsRepository, EntitlementsUnitOfWork } from './ports.js';
import type { Entitlement, SpaceMember } from './model.js';
import type { NewDomainEvent, OutboxAppender } from '../shared/ports.js';
import type { Actor } from '../shared/actor.js';
import type { CommunityReader, SpaceDetail, SpaceRowLock } from '../content/index.js';
import { ConflictError, ForbiddenError } from '../shared/errors.js';

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

const MEMBER: SpaceMember = {
  orgId: 'org-1',
  id: 'spm_1',
  communityId: 'cmy_1',
  spaceId: 'spc_1',
  orgUserId: 'ou_member',
  status: 'requested',
  source: 'request',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const SPACE: SpaceDetail = {
  orgId: 'org-1',
  id: 'spc_1',
  communityId: 'cmy_1',
  name: 'Founders',
  description: '',
  seq: 0,
  accessRule: 'by_request',
  capacity: null,
  settings: { comments: true, reactions: true, requireReview: false },
  topics: [],
  links: [],
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const student: Actor = { id: 'ou_member', role: 'student' };
const owner: Actor = { id: 'ou_owner', role: 'owner' };
const moderator: Actor = { id: 'ou_mod', role: 'moderator' };

function fakeRepo(over?: Partial<EntitlementsRepository>): EntitlementsRepository {
  return {
    list: vi.fn().mockResolvedValue({ rows: [SAMPLE], total: 1, page: 1, pageSize: 20 }),
    insert: vi.fn().mockResolvedValue(SAMPLE),
    setStatus: vi.fn().mockResolvedValue(SAMPLE),
    hasCourseAccess: vi.fn().mockResolvedValue(true),
    hasCommunityAccess: vi.fn().mockResolvedValue(true),
    grantOpensCommunity: vi.fn().mockResolvedValue(false),
    communitiesOpenedBy: vi.fn().mockResolvedValue([]),
    findSpaceMember: vi.fn().mockResolvedValue(null),
    listSpaceMembers: vi.fn().mockResolvedValue([]),
    insertSpaceMember: vi.fn(async (_orgId, input) => ({ ...MEMBER, ...input })),
    updateSpaceMemberStatus: vi.fn(async (_orgId, id, status) => ({ ...MEMBER, id, status })),
    deleteSpaceMember: vi.fn().mockResolvedValue(undefined),
    countActiveSpaceMembers: vi.fn().mockResolvedValue(0),
    activeSpaceIds: vi.fn().mockResolvedValue([]),
    listGrantsExpiredBy: vi.fn().mockResolvedValue([]),
    listGrantsEndingBetween: vi.fn().mockResolvedValue([]),
    outboxHas: vi.fn().mockResolvedValue(false),
    ...over,
  };
}

function fakeContent(over?: Partial<CommunityReader>): CommunityReader {
  return {
    getSpace: vi.fn().mockResolvedValue(SPACE),
    listSpaces: vi.fn().mockResolvedValue([SPACE]),
    getDmSettings: vi.fn().mockResolvedValue(null),
    ...over,
  };
}

/** Pass-through unit of work: runs the callback with the fake repo as the
 *  tx-bound scope plus a capturing outbox appender. */
function fakeUow(repo: EntitlementsRepository, spaces?: SpaceRowLock) {
  const appended: NewDomainEvent[] = [];
  const append = vi.fn(async (events: NewDomainEvent[]) => {
    appended.push(...events);
  });
  const outbox: OutboxAppender = { append };
  const lock: SpaceRowLock = spaces ?? {
    lockSpace: vi.fn().mockResolvedValue(SPACE),
  };
  const uow: EntitlementsUnitOfWork = {
    run: (fn) => fn({ entitlements: repo, spaces: lock, outbox }),
  };
  return { uow, append, appended, lock };
}

function build(repo = fakeRepo(), content = fakeContent(), spaces?: SpaceRowLock) {
  const { uow, append, appended, lock } = fakeUow(repo, spaces);
  const svc = new EntitlementsServiceImpl({ repo, content, uow });
  return { svc, repo, content, append, appended, lock };
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

  it('reports course access when the repository finds an active entitlement', async () => {
    const { svc, repo } = build(fakeRepo({ hasCourseAccess: vi.fn().mockResolvedValue(true) }));
    const allowed = await svc.hasCourseAccess('org-1', 's1', 'c1');
    expect(allowed).toBe(true);
    expect(repo.hasCourseAccess).toHaveBeenCalledWith('org-1', 's1', 'c1');
  });

  it('reports no course access when the entitlement is revoked', async () => {
    const { svc } = build(fakeRepo({ hasCourseAccess: vi.fn().mockResolvedValue(false) }));
    const allowed = await svc.hasCourseAccess('org-1', 's1', 'c1');
    expect(allowed).toBe(false);
  });

  it('reports no course access when there is no entitlement at all', async () => {
    const { svc } = build(fakeRepo({ hasCourseAccess: vi.fn().mockResolvedValue(false) }));
    const allowed = await svc.hasCourseAccess('org-1', 'nobody', 'c1');
    expect(allowed).toBe(false);
  });
});

describe('logging', () => {
  it('logs grant and status changes at info', async () => {
    const { createCapturingLogger } = await import('../shared/logger.js');
    const { logger, entries } = createCapturingLogger();
    const repo = fakeRepo();
    const { uow } = fakeUow(repo);
    const svc = new EntitlementsServiceImpl({ repo, content: fakeContent(), uow, logger });

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

describe('community access', () => {
  it('treats staff as a community member without a grant', async () => {
    const repo = fakeRepo({ hasCommunityAccess: vi.fn().mockResolvedValue(false) });
    const { svc } = build(repo);
    await expect(svc.isCommunityMember('org-1', owner, 'cmy_1')).resolves.toBe(true);
    expect(repo.hasCommunityAccess).not.toHaveBeenCalled();
  });

  it('requires a grant for a student and a moderator', async () => {
    const repo = fakeRepo({ hasCommunityAccess: vi.fn().mockResolvedValue(false) });
    const { svc } = build(repo);
    await expect(svc.isCommunityMember('org-1', student, 'cmy_1')).resolves.toBe(false);
    await expect(svc.isCommunityMember('org-1', moderator, 'cmy_1')).resolves.toBe(false);
  });

  it('lets a member open an all-members space and a space they have joined', async () => {
    const joined = { ...SPACE, id: 'spc_joined', accessRule: 'by_invite' as const };
    const hidden = { ...SPACE, id: 'spc_hidden', accessRule: 'by_request' as const };
    const open = { ...SPACE, id: 'spc_open', accessRule: 'all_members' as const };
    const repo = fakeRepo({
      activeSpaceIds: vi.fn().mockResolvedValue(['spc_joined']),
      findSpaceMember: vi.fn(async (_orgId, spaceId) =>
        spaceId === 'spc_joined' ? { ...MEMBER, spaceId, status: 'active' as const } : null,
      ),
    });
    const { svc } = build(
      repo,
      fakeContent({
        getSpace: vi.fn(async (_orgId, id: string) =>
          id === 'spc_hidden' ? hidden : id === 'spc_joined' ? joined : open,
        ),
        listSpaces: vi.fn().mockResolvedValue([open, joined, hidden]),
      }),
    );
    await expect(svc.canOpenSpace('org-1', student, 'spc_open')).resolves.toBe(true);
    await expect(svc.canOpenSpace('org-1', student, 'spc_joined')).resolves.toBe(true);
    await expect(svc.canOpenSpace('org-1', student, 'spc_hidden')).resolves.toBe(false);
    await expect(svc.openSpaceIds('org-1', student, 'cmy_1')).resolves.toEqual([
      'spc_open',
      'spc_joined',
    ]);
  });

  it('lets a moderator with a grant open every space', async () => {
    const hidden = { ...SPACE, id: 'spc_hidden', accessRule: 'by_invite' as const };
    const { svc } = build(
      fakeRepo(),
      fakeContent({ listSpaces: vi.fn().mockResolvedValue([SPACE, hidden]) }),
    );
    await expect(svc.canOpenSpace('org-1', moderator, 'spc_1')).resolves.toBe(true);
    await expect(svc.openSpaceIds('org-1', moderator, 'cmy_1')).resolves.toEqual([
      'spc_1',
      'spc_hidden',
    ]);
  });

  it('refuses a moderator who holds no grant', async () => {
    const { svc } = build(fakeRepo({ hasCommunityAccess: vi.fn().mockResolvedValue(false) }));
    await expect(svc.canOpenSpace('org-1', moderator, 'spc_1')).resolves.toBe(false);
    await expect(svc.openSpaceIds('org-1', moderator, 'cmy_1')).resolves.toEqual([]);
  });

  it('lets staff open a space without a grant or a space membership', async () => {
    const { svc, repo } = build(fakeRepo({ hasCommunityAccess: vi.fn().mockResolvedValue(false) }));
    await expect(svc.canOpenSpace('org-1', owner, 'spc_1')).resolves.toBe(true);
    expect(repo.hasCommunityAccess).not.toHaveBeenCalled();
  });
});

describe('space members', () => {
  it('shows a member only the active rows and shows staff and moderators every status', async () => {
    const rows: SpaceMember[] = [
      MEMBER,
      { ...MEMBER, id: 'spm_2', status: 'invited' },
      { ...MEMBER, id: 'spm_3', status: 'active' },
      { ...MEMBER, id: 'spm_4', status: 'revoked' },
    ];
    const repo = fakeRepo({ listSpaceMembers: vi.fn().mockResolvedValue(rows) });
    const content = fakeContent({
      getSpace: vi.fn().mockResolvedValue({ ...SPACE, accessRule: 'all_members' }),
    });
    const { svc } = build(repo, content);
    await expect(svc.listSpaceMembers('org-1', student, 'spc_1')).resolves.toEqual([
      expect.objectContaining({ id: 'spm_3', status: 'active' }),
    ]);
    await expect(svc.listSpaceMembers('org-1', moderator, 'spc_1')).resolves.toEqual(rows);
    await expect(svc.listSpaceMembers('org-1', owner, 'spc_1')).resolves.toEqual(rows);
  });

  it('records a join request from a community member', async () => {
    const { svc, appended } = build();
    const row = await svc.requestJoin('org-1', student, 'spc_1');
    expect(row).toMatchObject({ status: 'requested', source: 'request', orgUserId: 'ou_member' });
    expect(appended).toEqual([
      expect.objectContaining({
        type: 'entitlement.space_member.created',
        data: expect.objectContaining({ status: 'requested' }),
        metadata: { actorOrgUserId: 'ou_member' },
      }),
    ]);
  });

  it('refuses a request from staff, a moderator, or someone without a grant', async () => {
    const { svc } = build(fakeRepo({ hasCommunityAccess: vi.fn().mockResolvedValue(false) }));
    await expect(svc.requestJoin('org-1', owner, 'spc_1')).rejects.toBeInstanceOf(ForbiddenError);
    const granted = build();
    await expect(granted.svc.requestJoin('org-1', moderator, 'spc_1')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(svc.requestJoin('org-1', student, 'spc_1')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses a request for an all-members space or a by-invite space', async () => {
    const all = build(
      fakeRepo(),
      fakeContent({ getSpace: vi.fn().mockResolvedValue({ ...SPACE, accessRule: 'all_members' }) }),
    );
    await expect(all.svc.requestJoin('org-1', student, 'spc_1')).rejects.toThrow(
      'An all-members space has no space members',
    );
    const invited = build(
      fakeRepo(),
      fakeContent({ getSpace: vi.fn().mockResolvedValue({ ...SPACE, accessRule: 'by_invite' }) }),
    );
    await expect(invited.svc.requestJoin('org-1', student, 'spc_1')).rejects.toThrow(
      'This space is by invitation',
    );
  });

  it('invites a community member and rejects a second row', async () => {
    const repo = fakeRepo({
      findSpaceMember: vi.fn().mockResolvedValue({ ...MEMBER, status: 'requested' }),
    });
    const { svc } = build(repo);
    await expect(svc.invite('org-1', owner, 'spc_1', 'ou_member')).rejects.toBeInstanceOf(
      ConflictError,
    );
    const open = build();
    const row = await open.svc.invite('org-1', moderator, 'spc_1', 'ou_member');
    expect(row).toMatchObject({ status: 'invited', source: 'invite' });
  });

  it('refuses an invite from a student or for someone who is not a member', async () => {
    const { svc } = build();
    await expect(svc.invite('org-1', student, 'spc_1', 'ou_other')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    const outsider = build(fakeRepo({ hasCommunityAccess: vi.fn().mockResolvedValue(false) }));
    await expect(outsider.svc.invite('org-1', owner, 'spc_1', 'ou_other')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('accepts an invitation when the space has room and records the previous status', async () => {
    const repo = fakeRepo({
      findSpaceMember: vi
        .fn()
        .mockResolvedValue({ ...MEMBER, status: 'invited', source: 'invite' }),
    });
    const { svc, lock, appended } = build(repo);
    const row = await svc.accept('org-1', student, 'spc_1');
    expect(lock.lockSpace).toHaveBeenCalledWith('org-1', 'spc_1');
    expect(row.status).toBe('active');
    expect(appended[0]).toMatchObject({
      type: 'entitlement.space_member.updated',
      metadata: { actorOrgUserId: 'ou_member', previousStatus: 'invited' },
    });
  });

  it('rejects acceptance when the space is full', async () => {
    const repo = fakeRepo({
      findSpaceMember: vi.fn().mockResolvedValue({ ...MEMBER, status: 'invited' }),
      countActiveSpaceMembers: vi.fn().mockResolvedValue(2),
    });
    const { svc, appended } = build(repo, fakeContent(), {
      lockSpace: vi.fn().mockResolvedValue({ ...SPACE, capacity: 2 }),
    });
    await expect(svc.accept('org-1', student, 'spc_1')).rejects.toThrow('This space is full');
    expect(appended).toEqual([]);
    expect(repo.updateSpaceMemberStatus).not.toHaveBeenCalled();
  });

  it('approves a request and declines one by deleting it', async () => {
    const requested = { ...MEMBER, status: 'requested' as const };
    const repo = fakeRepo({ findSpaceMember: vi.fn().mockResolvedValue(requested) });
    const approved = build(repo);
    const row = await approved.svc.approve('org-1', owner, 'spc_1', 'ou_member');
    expect(row.status).toBe('active');
    expect(approved.appended[0]).toMatchObject({
      metadata: { previousStatus: 'requested' },
    });
    const declined = build(repo);
    const gone = await declined.svc.decline('org-1', moderator, 'spc_1', 'ou_member');
    expect(gone.status).toBe('requested');
    expect(repo.deleteSpaceMember).toHaveBeenCalledWith('org-1', 'spm_1');
    expect(declined.appended[0]).toMatchObject({
      type: 'entitlement.space_member.deleted',
      metadata: { actorOrgUserId: 'ou_mod', previousStatus: 'requested' },
    });
  });

  it('lets the invited person refuse and an active member leave', async () => {
    const invited = fakeRepo({
      findSpaceMember: vi.fn().mockResolvedValue({ ...MEMBER, status: 'invited' }),
    });
    const refusal = build(invited);
    await refusal.svc.refuse('org-1', student, 'spc_1');
    expect(refusal.appended[0]).toMatchObject({
      type: 'entitlement.space_member.deleted',
      metadata: { previousStatus: 'invited' },
    });
    const active = fakeRepo({
      findSpaceMember: vi.fn().mockResolvedValue({ ...MEMBER, status: 'active' }),
    });
    const left = build(active);
    await left.svc.leave('org-1', student, 'spc_1');
    expect(left.appended[0]).toMatchObject({ metadata: { previousStatus: 'active' } });
  });

  it('removes a member by revoking the row', async () => {
    const repo = fakeRepo({
      findSpaceMember: vi.fn().mockResolvedValue({ ...MEMBER, status: 'active' }),
    });
    const { svc, appended } = build(repo);
    const row = await svc.remove('org-1', owner, 'spc_1', 'ou_member');
    expect(row.status).toBe('revoked');
    expect(repo.deleteSpaceMember).not.toHaveBeenCalled();
    expect(appended[0]).toMatchObject({
      type: 'entitlement.space_member.updated',
      data: expect.objectContaining({ status: 'revoked' }),
      metadata: { previousStatus: 'active' },
    });
  });

  it('adds a person directly when the space has room', async () => {
    const { svc, appended } = build();
    const row = await svc.addSpaceMember('org-1', owner, 'spc_1', 'ou_member');
    expect(row).toMatchObject({ status: 'active', source: 'manual' });
    expect(appended[0]).toMatchObject({ type: 'entitlement.space_member.created' });
  });
});

describe('expireDue', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  const grant = { ...SAMPLE, id: 'ent_1', expiresAt: new Date('2026-05-01T00:00:00Z') };

  it('emits entitlement.expired once per due grant and skips a grant already emitted', async () => {
    const repo = fakeRepo({
      listGrantsExpiredBy: vi.fn().mockResolvedValue([grant, { ...grant, id: 'ent_2' }]),
      outboxHas: vi.fn(async (_orgId, _type, grantId: string) => grantId === 'ent_2'),
    });
    const { svc, appended } = build(repo);
    await svc.expireDue('org-1', now);
    expect(appended).toEqual([
      expect.objectContaining({
        type: 'entitlement.expired',
        data: expect.objectContaining({ id: 'ent_1' }),
      }),
    ]);
    expect(appended[0]).not.toHaveProperty('metadata');
  });

  it('emits ending_soon once per community a grant opens, with that community as contentId', async () => {
    const bundle = {
      ...SAMPLE,
      id: 'ent_b',
      contentId: null,
      bundleId: 'bnd_1',
      expiresAt: new Date('2026-06-04T00:00:00Z'),
    };
    const repo = fakeRepo({
      listGrantsEndingBetween: vi.fn().mockResolvedValue([bundle]),
      communitiesOpenedBy: vi.fn().mockResolvedValue(['cmy_1', 'cmy_2']),
      outboxHas: vi.fn(
        async (_orgId, _type, _grantId, communityId?: string) => communityId === 'cmy_2',
      ),
    });
    const { svc, appended } = build(repo);
    await svc.expireDue('org-1', now);
    expect(appended).toEqual([
      expect.objectContaining({
        type: 'entitlement.ending_soon',
        data: expect.objectContaining({ id: 'ent_b', contentId: 'cmy_1' }),
      }),
    ]);
  });
});
