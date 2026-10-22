import { describe, it, expect, vi } from 'vitest';
import { EntitlementsServiceImpl } from './service.js';
import type { EntitlementsRepository, EntitlementsUnitOfWork } from './ports.js';
import type { Entitlement, SpaceMember } from './model.js';
import type { NewDomainEvent, OutboxAppender } from '../shared/ports.js';
import type { Actor } from '../shared/actor.js';
import type { CommunityReader, SpaceDetail, SpaceRowLock } from '../content/index.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../shared/errors.js';
import { isStaffRole, type Role } from '../organizations/index.js';

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

const ROLES_BY_ID: Record<string, Role> = { ou_owner: 'owner', ou_mod: 'moderator' };

function fakeRepo(over?: Partial<EntitlementsRepository>): EntitlementsRepository {
  const findSpaceMember = over?.findSpaceMember ?? vi.fn().mockResolvedValue(null);
  const hasCommunityAccess = over?.hasCommunityAccess ?? vi.fn().mockResolvedValue(true);
  const accessAmong: EntitlementsRepository['accessAmong'] = async (
    orgId,
    communityId,
    spaceId,
    orgUserIds,
  ) =>
    Promise.all(
      orgUserIds.map(async (orgUserId) => {
        const role = ROLES_BY_ID[orgUserId] ?? 'student';
        const member =
          isStaffRole(role) || (await hasCommunityAccess(orgId, orgUserId, communityId));
        const row = spaceId ? await findSpaceMember(orgId, spaceId, orgUserId) : null;
        return { orgUserId, role, member, activeInSpace: row?.status === 'active' };
      }),
    );
  return {
    list: vi.fn().mockResolvedValue({ rows: [SAMPLE], total: 1, page: 1, pageSize: 20 }),
    insert: vi.fn().mockResolvedValue(SAMPLE),
    insertIfAbsent: vi.fn().mockResolvedValue(SAMPLE),
    lockGrant: vi.fn().mockResolvedValue(SAMPLE),
    setExpiresAt: vi.fn(async (_orgId, id, expiresAt) => ({ ...SAMPLE, id, expiresAt })),
    setStatus: vi.fn().mockResolvedValue(SAMPLE),
    hasCourseAccess: vi.fn().mockResolvedValue(true),
    hasCommunityAccess,
    communitiesOpenedBy: vi.fn().mockResolvedValue([]),
    accessAmong: vi.fn(accessAmong),
    findSpaceMember,
    lockSpaceMember: findSpaceMember,
    listSpaceMembers: vi.fn().mockResolvedValue([]),
    insertSpaceMember: vi.fn(async (_orgId, input) => ({ ...MEMBER, ...input })),
    updateSpaceMemberStatus: vi.fn(async (_orgId, id, status) => ({ ...MEMBER, id, status })),
    deleteSpaceMember: vi.fn().mockResolvedValue(undefined),
    countActiveSpaceMembers: vi.fn().mockResolvedValue(0),
    activeSpaceIds: vi.fn().mockResolvedValue([]),
    listGrantsExpiredBy: vi.fn().mockResolvedValue([]),
    listGrantsEndingBetween: vi.fn().mockResolvedValue([]),
    hasDueNotices: vi.fn().mockResolvedValue(false),
    claimNotice: vi.fn().mockResolvedValue(true),
    communityModeratorIds: vi.fn().mockResolvedValue([]),
    communityIdsOpenedFor: vi.fn().mockResolvedValue([]),
    ...over,
  };
}

function inviteContent(): CommunityReader {
  return fakeContent({
    getSpace: vi.fn().mockResolvedValue({ ...SPACE, accessRule: 'by_invite' }),
  });
}

function inviteLock(): SpaceRowLock {
  return { lockSpace: vi.fn().mockResolvedValue({ ...SPACE, accessRule: 'by_invite' }) };
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
  const svc = new EntitlementsServiceImpl({
    repo,
    content,
    uow,
  });
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
    const svc = new EntitlementsServiceImpl({
      repo,
      content: fakeContent(),
      uow,
      logger,
    });

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
  it('takes community membership from the one membership answer of the repository', async () => {
    const accessAmong = vi.fn(
      async (_orgId: string, _communityId: string, _spaceId: string | null, ids: string[]) =>
        ids.map((orgUserId) => ({
          orgUserId,
          role: 'student' as const,
          member: orgUserId === 'ou_member',
          activeInSpace: false,
        })),
    );
    const repo = fakeRepo({ accessAmong, hasCommunityAccess: vi.fn().mockResolvedValue(true) });
    const { svc } = build(repo);
    await expect(svc.isCommunityMember('org-1', student, 'cmy_1')).resolves.toBe(true);
    await expect(svc.isCommunityMember('org-1', moderator, 'cmy_1')).resolves.toBe(false);
    expect(accessAmong).toHaveBeenCalledWith('org-1', 'cmy_1', null, ['ou_member']);
    expect(repo.hasCommunityAccess).not.toHaveBeenCalled();
  });

  it('treats staff as a community member without a grant', async () => {
    const repo = fakeRepo({ hasCommunityAccess: vi.fn().mockResolvedValue(false) });
    const { svc } = build(repo);
    await expect(svc.isCommunityMember('org-1', owner, 'cmy_1')).resolves.toBe(true);
  });

  it('requires a grant for a student and a moderator', async () => {
    const repo = fakeRepo({ hasCommunityAccess: vi.fn().mockResolvedValue(false) });
    const { svc } = build(repo);
    await expect(svc.isCommunityMember('org-1', student, 'cmy_1')).resolves.toBe(false);
    await expect(svc.isCommunityMember('org-1', moderator, 'cmy_1')).resolves.toBe(false);
  });

  it('refuses someone the repository does not know', async () => {
    const { svc } = build(fakeRepo({ accessAmong: vi.fn().mockResolvedValue([]) }));
    await expect(svc.isCommunityMember('org-1', owner, 'cmy_1')).resolves.toBe(false);
    await expect(svc.canOpenSpace('org-1', owner, 'spc_1')).resolves.toBe(false);
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
    const { svc } = build(fakeRepo({ hasCommunityAccess: vi.fn().mockResolvedValue(false) }));
    await expect(svc.canOpenSpace('org-1', owner, 'spc_1')).resolves.toBe(true);
    await expect(svc.openSpaceIds('org-1', owner, 'cmy_1')).resolves.toEqual(['spc_1']);
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
    await expect(svc.listSpaceMembers('org-1', student, 'cmy_1', 'spc_1')).resolves.toEqual([
      expect.objectContaining({ id: 'spm_3', status: 'active' }),
    ]);
    await expect(svc.listSpaceMembers('org-1', moderator, 'cmy_1', 'spc_1')).resolves.toEqual(rows);
    await expect(svc.listSpaceMembers('org-1', owner, 'cmy_1', 'spc_1')).resolves.toEqual(rows);
  });

  it('rejects a space that belongs to another community', async () => {
    const { svc, repo } = build();
    await expect(svc.requestJoin('org-1', student, 'cmy_other', 'spc_1')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(svc.leave('org-1', student, 'cmy_other', 'spc_1')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(repo.insertSpaceMember).not.toHaveBeenCalled();
    expect(repo.deleteSpaceMember).not.toHaveBeenCalled();
  });

  it('records a join request from a community member', async () => {
    const { svc, appended } = build();
    const row = await svc.requestJoin('org-1', student, 'cmy_1', 'spc_1');
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
    await expect(svc.requestJoin('org-1', owner, 'cmy_1', 'spc_1')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    const granted = build();
    await expect(
      granted.svc.requestJoin('org-1', moderator, 'cmy_1', 'spc_1'),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(svc.requestJoin('org-1', student, 'cmy_1', 'spc_1')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('refuses a request for an all-members space or a by-invite space', async () => {
    const all = build(
      fakeRepo(),
      fakeContent({ getSpace: vi.fn().mockResolvedValue({ ...SPACE, accessRule: 'all_members' }) }),
    );
    await expect(all.svc.requestJoin('org-1', student, 'cmy_1', 'spc_1')).rejects.toThrow(
      'An all-members space has no space members',
    );
    const invited = build(
      fakeRepo(),
      fakeContent({ getSpace: vi.fn().mockResolvedValue({ ...SPACE, accessRule: 'by_invite' }) }),
    );
    await expect(invited.svc.requestJoin('org-1', student, 'cmy_1', 'spc_1')).rejects.toThrow(
      'This space is by invitation',
    );
  });

  it('invites a community member and rejects a second row', async () => {
    const repo = fakeRepo({
      findSpaceMember: vi.fn().mockResolvedValue({ ...MEMBER, status: 'requested' }),
    });
    const { svc } = build(repo, inviteContent());
    await expect(svc.invite('org-1', owner, 'cmy_1', 'spc_1', 'ou_member')).rejects.toBeInstanceOf(
      ConflictError,
    );
    const open = build(fakeRepo(), inviteContent());
    const row = await open.svc.invite('org-1', moderator, 'cmy_1', 'spc_1', 'ou_member');
    expect(row).toMatchObject({ status: 'invited', source: 'invite' });
  });

  it('refuses an invite from a student or for someone who is not a member', async () => {
    const { svc } = build(fakeRepo(), inviteContent());
    await expect(svc.invite('org-1', student, 'cmy_1', 'spc_1', 'ou_other')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    const outsider = build(
      fakeRepo({ hasCommunityAccess: vi.fn().mockResolvedValue(false) }),
      inviteContent(),
    );
    await expect(
      outsider.svc.invite('org-1', owner, 'cmy_1', 'spc_1', 'ou_other'),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('accepts an invitation when the space has room and records the previous status', async () => {
    const repo = fakeRepo({
      findSpaceMember: vi
        .fn()
        .mockResolvedValue({ ...MEMBER, status: 'invited', source: 'invite' }),
    });
    const { svc, lock, appended } = build(repo, inviteContent(), inviteLock());
    const row = await svc.accept('org-1', student, 'cmy_1', 'spc_1');
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
    const { svc, appended } = build(repo, inviteContent(), {
      lockSpace: vi.fn().mockResolvedValue({ ...SPACE, accessRule: 'by_invite', capacity: 2 }),
    });
    await expect(svc.accept('org-1', student, 'cmy_1', 'spc_1')).rejects.toThrow(
      'This space is full',
    );
    expect(appended).toEqual([]);
    expect(repo.updateSpaceMemberStatus).not.toHaveBeenCalled();
  });

  it('approves a request and declines one by deleting it', async () => {
    const requested = { ...MEMBER, status: 'requested' as const };
    const repo = fakeRepo({ findSpaceMember: vi.fn().mockResolvedValue(requested) });
    const approved = build(repo);
    const row = await approved.svc.approve('org-1', owner, 'cmy_1', 'spc_1', 'ou_member');
    expect(row.status).toBe('active');
    expect(approved.appended[0]).toMatchObject({
      metadata: { previousStatus: 'requested' },
    });
    const declined = build(repo);
    const gone = await declined.svc.decline('org-1', moderator, 'cmy_1', 'spc_1', 'ou_member');
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
    const refusal = build(invited, inviteContent());
    await refusal.svc.refuse('org-1', student, 'cmy_1', 'spc_1');
    expect(refusal.appended[0]).toMatchObject({
      type: 'entitlement.space_member.deleted',
      metadata: { previousStatus: 'invited' },
    });
    const active = fakeRepo({
      findSpaceMember: vi.fn().mockResolvedValue({ ...MEMBER, status: 'active' }),
    });
    const left = build(active);
    await left.svc.leave('org-1', student, 'cmy_1', 'spc_1');
    expect(left.appended[0]).toMatchObject({ metadata: { previousStatus: 'active' } });
  });

  it('removes a member by revoking the row', async () => {
    const repo = fakeRepo({
      findSpaceMember: vi.fn().mockResolvedValue({ ...MEMBER, status: 'active' }),
    });
    const { svc, appended } = build(repo);
    const row = await svc.remove('org-1', owner, 'cmy_1', 'spc_1', 'ou_member');
    expect(row.status).toBe('revoked');
    expect(repo.deleteSpaceMember).not.toHaveBeenCalled();
    expect(appended[0]).toMatchObject({
      type: 'entitlement.space_member.updated',
      data: expect.objectContaining({ status: 'revoked' }),
      metadata: { previousStatus: 'active' },
    });
  });

  it('refuses a removal in an all-members space, also when the rule changed before the lock', async () => {
    const repo = fakeRepo({
      findSpaceMember: vi.fn().mockResolvedValue({ ...MEMBER, status: 'active' }),
    });
    const allMembers = { ...SPACE, accessRule: 'all_members' as const, capacity: null };
    const before = build(repo, fakeContent({ getSpace: vi.fn().mockResolvedValue(allMembers) }));
    await expect(
      before.svc.remove('org-1', owner, 'cmy_1', 'spc_1', 'ou_member'),
    ).rejects.toBeInstanceOf(ConflictError);
    const changed = build(repo, fakeContent(), {
      lockSpace: vi.fn().mockResolvedValue(allMembers),
    });
    await expect(
      changed.svc.remove('org-1', owner, 'cmy_1', 'spc_1', 'ou_member'),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(changed.lock.lockSpace).toHaveBeenCalledWith('org-1', 'spc_1');
    expect(repo.updateSpaceMemberStatus).not.toHaveBeenCalled();
    expect(before.appended).toEqual([]);
    expect(changed.appended).toEqual([]);
  });

  it('adds a person directly when the space has room', async () => {
    const { svc, appended } = build();
    const row = await svc.addSpaceMember('org-1', owner, 'cmy_1', 'spc_1', 'ou_member');
    expect(row).toMatchObject({ status: 'active', source: 'manual' });
    expect(appended[0]).toMatchObject({ type: 'entitlement.space_member.created' });
  });
});

describe('expireDue', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  const grant = { ...SAMPLE, id: 'ent_1', expiresAt: new Date('2026-05-01T00:00:00Z') };

  it('claims an expiry notice per term and emits entitlement.expired only for a claimed one', async () => {
    const repo = fakeRepo({
      listGrantsExpiredBy: vi.fn().mockResolvedValue([grant, { ...grant, id: 'ent_2' }]),
      claimNotice: vi.fn(async (_orgId, notice) => notice.entitlementId === 'ent_1'),
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
    expect(repo.claimNotice).toHaveBeenCalledWith(
      'org-1',
      { kind: 'expired', entitlementId: 'ent_1' },
      now,
      new Date('2026-06-08T00:00:00Z'),
    );
  });

  it('emits ending_soon once per community a grant opens, keyed by the term', async () => {
    const bundle = {
      ...SAMPLE,
      id: 'ent_b',
      contentId: null,
      bundleId: 'bnd_1',
      expiresAt: new Date('2026-06-04T00:00:00Z'),
    };
    const repo = fakeRepo({
      listGrantsEndingBetween: vi.fn().mockResolvedValue([
        { grant: bundle, communityId: 'cmy_1' },
        { grant: bundle, communityId: 'cmy_2' },
      ]),
      claimNotice: vi.fn(
        async (_orgId, notice) => notice.kind === 'ending_soon' && notice.communityId === 'cmy_1',
      ),
    });
    const { svc, appended } = build(repo);
    await svc.expireDue('org-1', now);
    expect(repo.listGrantsEndingBetween).toHaveBeenCalledWith(
      'org-1',
      now,
      new Date('2026-06-08T00:00:00Z'),
    );
    expect(repo.claimNotice).toHaveBeenCalledWith(
      'org-1',
      { kind: 'ending_soon', entitlementId: 'ent_b', communityId: 'cmy_1' },
      now,
      new Date('2026-06-08T00:00:00Z'),
    );
    expect(appended).toEqual([
      expect.objectContaining({
        type: 'entitlement.ending_soon',
        data: expect.objectContaining({
          id: 'ent_b',
          contentId: null,
          bundleId: 'bnd_1',
          communityId: 'cmy_1',
        }),
      }),
    ]);
  });

  it('appends nothing when every notice was already claimed', async () => {
    const repo = fakeRepo({
      listGrantsExpiredBy: vi.fn().mockResolvedValue([grant]),
      claimNotice: vi.fn().mockResolvedValue(false),
    });
    const { svc, append } = build(repo);
    await svc.expireDue('org-1', now);
    expect(append).not.toHaveBeenCalled();
  });

  it('reports due notices over the seven-day window', async () => {
    const repo = fakeRepo({ hasDueNotices: vi.fn().mockResolvedValue(true) });
    const { svc } = build(repo);
    await expect(svc.hasDueNotices('org-1', now)).resolves.toBe(true);
    expect(repo.hasDueNotices).toHaveBeenCalledWith('org-1', now, new Date('2026-06-08T00:00:00Z'));
  });
});

describe('membership among many', () => {
  it('keeps the people the repository answers as members, staff included', async () => {
    const repo = fakeRepo({
      accessAmong: vi.fn().mockResolvedValue([
        { orgUserId: 'ou_owner', role: 'owner', member: true, activeInSpace: false },
        { orgUserId: 'ou_member', role: 'student', member: true, activeInSpace: false },
        { orgUserId: 'ou_mod', role: 'moderator', member: false, activeInSpace: false },
      ]),
    });
    const { svc } = build(repo);
    await expect(
      svc.communityMembersAmong('org-1', 'cmy_1', ['ou_owner', 'ou_member', 'ou_mod']),
    ).resolves.toEqual(['ou_owner', 'ou_member']);
    expect(repo.accessAmong).toHaveBeenCalledWith('org-1', 'cmy_1', null, [
      'ou_owner',
      'ou_member',
      'ou_mod',
    ]);
  });

  it('answers who can open a space under the space-open rule', async () => {
    const repo = fakeRepo({
      accessAmong: vi.fn().mockResolvedValue([
        { orgUserId: 'ou_owner', role: 'owner', member: true, activeInSpace: false },
        { orgUserId: 'ou_joined', role: 'student', member: true, activeInSpace: true },
        { orgUserId: 'ou_asked', role: 'student', member: true, activeInSpace: false },
        { orgUserId: 'ou_mod', role: 'moderator', member: true, activeInSpace: false },
        { orgUserId: 'ou_lapsed', role: 'student', member: false, activeInSpace: true },
      ]),
    });
    const { svc } = build(repo);
    await expect(
      svc.spaceOpenersAmong('org-1', 'spc_1', [
        'ou_owner',
        'ou_joined',
        'ou_asked',
        'ou_mod',
        'ou_lapsed',
      ]),
    ).resolves.toEqual(['ou_owner', 'ou_joined', 'ou_mod']);
    expect(repo.accessAmong).toHaveBeenCalledWith('org-1', 'cmy_1', 'spc_1', expect.any(Array));
  });

  it('asks nothing for an empty list', async () => {
    const { svc, repo } = build();
    await expect(svc.communityMembersAmong('org-1', 'cmy_1', [])).resolves.toEqual([]);
    await expect(svc.spaceOpenersAmong('org-1', 'spc_1', [])).resolves.toEqual([]);
    expect(repo.accessAmong).not.toHaveBeenCalled();
  });
});

describe('open spaces', () => {
  it('returns the spaces a member can open, not their ids', async () => {
    const open = { ...SPACE, id: 'spc_open', accessRule: 'all_members' as const };
    const joined = { ...SPACE, id: 'spc_joined', accessRule: 'by_invite' as const };
    const repo = fakeRepo({ activeSpaceIds: vi.fn().mockResolvedValue(['spc_joined']) });
    const { svc } = build(
      repo,
      fakeContent({ listSpaces: vi.fn().mockResolvedValue([open, joined, SPACE]) }),
    );
    await expect(svc.openSpacesFor('org-1', student, 'cmy_1')).resolves.toEqual([open, joined]);
  });

  it('ignores space-member rows in an all-members space', async () => {
    const open = { ...SPACE, accessRule: 'all_members' as const };
    const repo = fakeRepo({
      findSpaceMember: vi.fn().mockResolvedValue({ ...MEMBER, status: 'revoked' }),
    });
    const { svc } = build(repo, fakeContent({ getSpace: vi.fn().mockResolvedValue(open) }));
    await expect(svc.canOpenSpace('org-1', student, 'spc_1')).resolves.toBe(true);
  });

  it('loads the space once when listing its members', async () => {
    const content = fakeContent({
      getSpace: vi.fn().mockResolvedValue({ ...SPACE, accessRule: 'all_members' }),
    });
    const { svc } = build(fakeRepo(), content);
    await svc.listSpaceMembers('org-1', student, 'cmy_1', 'spc_1');
    expect(content.getSpace).toHaveBeenCalledTimes(1);
  });
});

describe('space member transitions', () => {
  function tracked(row: SpaceMember | null) {
    let inTx = false;
    const lockedInTx: boolean[] = [];
    const repo = fakeRepo({
      lockSpaceMember: vi.fn(async () => {
        lockedInTx.push(inTx);
        return row;
      }),
      findSpaceMember: vi.fn().mockResolvedValue(null),
    });
    const appended: NewDomainEvent[] = [];
    const uow: EntitlementsUnitOfWork = {
      run: async (fn) => {
        inTx = true;
        try {
          return await fn({
            entitlements: repo,
            spaces: { lockSpace: vi.fn().mockResolvedValue(SPACE) },
            outbox: {
              append: async (events) => {
                appended.push(...events);
              },
            },
          });
        } finally {
          inTx = false;
        }
      },
    };
    const svc = new EntitlementsServiceImpl({ repo, content: fakeContent(), uow });
    return { svc, repo, appended, lockedInTx };
  }

  it('reads the row under lock inside the transaction when approving', async () => {
    const { svc, lockedInTx } = tracked({ ...MEMBER, status: 'requested' });
    await svc.approve('org-1', owner, 'cmy_1', 'spc_1', 'ou_member');
    expect(lockedInTx).toEqual([true]);
  });

  it('refuses a second approval and emits nothing', async () => {
    const { svc, repo, appended } = tracked({ ...MEMBER, status: 'active' });
    await expect(svc.approve('org-1', owner, 'cmy_1', 'spc_1', 'ou_member')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(repo.updateSpaceMemberStatus).not.toHaveBeenCalled();
    expect(appended).toEqual([]);
  });

  it('refuses a decline once the request was approved', async () => {
    const { svc, repo, appended, lockedInTx } = tracked({ ...MEMBER, status: 'active' });
    await expect(svc.decline('org-1', owner, 'cmy_1', 'spc_1', 'ou_member')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(lockedInTx).toEqual([true]);
    expect(repo.deleteSpaceMember).not.toHaveBeenCalled();
    expect(appended).toEqual([]);
  });

  it('refuses a removal of a row that is gone', async () => {
    const { svc, appended } = tracked(null);
    await expect(svc.remove('org-1', owner, 'cmy_1', 'spc_1', 'ou_member')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(appended).toEqual([]);
  });

  it('refuses to approve a requester who no longer holds a grant', async () => {
    const repo = fakeRepo({
      findSpaceMember: vi.fn().mockResolvedValue({ ...MEMBER, status: 'requested' }),
      hasCommunityAccess: vi.fn(async (_orgId, orgUserId: string) => orgUserId !== 'ou_member'),
    });
    const { svc, appended } = build(repo);
    await expect(svc.approve('org-1', moderator, 'cmy_1', 'spc_1', 'ou_member')).rejects.toThrow(
      'That person is not a member of this community',
    );
    expect(appended).toEqual([]);
  });
});

describe('access rule of the space', () => {
  it('refuses an invitation or an acceptance in a by-request space', async () => {
    const repo = fakeRepo({
      findSpaceMember: vi.fn().mockResolvedValue({ ...MEMBER, status: 'invited' }),
    });
    const { svc, appended } = build(repo);
    await expect(svc.invite('org-1', owner, 'cmy_1', 'spc_1', 'ou_member')).rejects.toThrow(
      'This space is by request',
    );
    await expect(svc.accept('org-1', student, 'cmy_1', 'spc_1')).rejects.toThrow(
      'This space is by request',
    );
    expect(appended).toEqual([]);
  });

  it('refuses an approval in a by-invite space', async () => {
    const repo = fakeRepo({
      findSpaceMember: vi.fn().mockResolvedValue({ ...MEMBER, status: 'requested' }),
    });
    const { svc, appended } = build(repo, inviteContent(), inviteLock());
    await expect(svc.approve('org-1', owner, 'cmy_1', 'spc_1', 'ou_member')).rejects.toThrow(
      'This space is by invitation',
    );
    expect(appended).toEqual([]);
  });

  it('refuses an acceptance when the rule changed before the lock', async () => {
    const repo = fakeRepo({
      findSpaceMember: vi.fn().mockResolvedValue({ ...MEMBER, status: 'invited' }),
    });
    const { svc, appended } = build(repo, inviteContent());
    await expect(svc.accept('org-1', student, 'cmy_1', 'spc_1')).rejects.toThrow(
      'This space is by request',
    );
    expect(repo.updateSpaceMemberStatus).not.toHaveBeenCalled();
    expect(appended).toEqual([]);
  });
});

describe('ensureGrant', () => {
  const input = {
    orgUserId: 's1',
    contentId: 'c1',
    expiresAt: new Date('2026-09-01T00:00:00Z'),
  };

  it('creates an absent grant and emits entitlement.created', async () => {
    const { svc, repo, appended } = build();
    await svc.ensureGrant('org-1', input);
    expect(repo.insertIfAbsent).toHaveBeenCalledWith('org-1', input);
    expect(repo.insert).not.toHaveBeenCalled();
    expect(appended).toEqual([expect.objectContaining({ type: 'entitlement.created' })]);
  });

  it('keeps an active grant whose expiry is already later and emits nothing', async () => {
    const repo = fakeRepo({
      insertIfAbsent: vi.fn().mockResolvedValue(null),
      lockGrant: vi.fn().mockResolvedValue({ ...SAMPLE, expiresAt: null }),
    });
    const { svc, append } = build(repo);
    const result = await svc.ensureGrant('org-1', input);
    expect(result.expiresAt).toBeNull();
    expect(repo.setExpiresAt).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it('extends an active grant to the later expiry and emits entitlement.updated', async () => {
    const repo = fakeRepo({
      insertIfAbsent: vi.fn().mockResolvedValue(null),
      lockGrant: vi
        .fn()
        .mockResolvedValue({ ...SAMPLE, expiresAt: new Date('2026-07-01T00:00:00Z') }),
    });
    const { svc, appended } = build(repo);
    await svc.ensureGrant('org-1', input);
    expect(repo.setExpiresAt).toHaveBeenCalledWith('org-1', 'e1', input.expiresAt);
    expect(appended).toEqual([
      expect.objectContaining({
        type: 'entitlement.updated',
        data: expect.objectContaining({ expiresAt: input.expiresAt }),
      }),
    ]);
  });

  it('extends a dated grant to lifetime when the action gives no expiry', async () => {
    const repo = fakeRepo({
      insertIfAbsent: vi.fn().mockResolvedValue(null),
      lockGrant: vi
        .fn()
        .mockResolvedValue({ ...SAMPLE, expiresAt: new Date('2026-07-01T00:00:00Z') }),
    });
    const { svc } = build(repo);
    await svc.ensureGrant('org-1', { ...input, expiresAt: null });
    expect(repo.setExpiresAt).toHaveBeenCalledWith('org-1', 'e1', null);
  });

  it('leaves a revoked grant revoked and emits nothing', async () => {
    const repo = fakeRepo({
      insertIfAbsent: vi.fn().mockResolvedValue(null),
      lockGrant: vi.fn().mockResolvedValue({ ...SAMPLE, status: 'revoked' }),
    });
    const { svc, append } = build(repo);
    const result = await svc.ensureGrant('org-1', input);
    expect(result.status).toBe('revoked');
    expect(repo.setExpiresAt).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });
});
