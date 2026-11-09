import { describe, it, expect, vi } from 'vitest';
import { EntitlementsServiceImpl } from './service.js';
import type {
  EntitlementsRepository,
  EntitlementsUnitOfWork,
  PermissionHolders,
  SpaceMembersQuery,
  ContentReader,
} from './ports.js';
import type { Entitlement, SpaceMember } from './model.js';
import type { NewDomainEvent, OutboxAppender } from '../shared/ports.js';
import type { Actor } from '../shared/actor.js';
import type { Event, SpaceDetail, SpaceRowLock } from '../content/index.js';
import type { Permission } from '../types/index.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../shared/errors.js';
import { actorWith } from '../organizations/index.js';

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
  coverAssetId: null,
  backgroundAssetId: null,
  iconAssetId: null,
  topics: [],
  links: [],
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const EVENT: Event = {
  orgId: 'org-1',
  id: 'evn_1',
  type: 'event',
  title: 'Conversation practice',
  description: '',
  thumbnailAssetId: null,
  status: 'published',
  startsAt: new Date('2099-05-12T16:00:00Z'),
  endsAt: new Date('2099-05-12T17:00:00Z'),
  timeZone: 'Europe/London',
  location: { venue: null, online: null },
  recording: null,
  settings: { type: 'public', capacity: null, notifications: true, replay: true },
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const student: Actor = actorWith({ id: 'ou_member', orgId: 'org-1' });
const owner: Actor = actorWith({ id: 'ou_owner', orgId: 'org-1', owner: true });
const moderator: Actor = actorWith({
  id: 'ou_mod',
  orgId: 'org-1',
  content: { cmy_1: ['communities:moderate'] },
});
const admin: Actor = actorWith({ id: 'ou_admin', orgId: 'org-1', org: ['access:write'] });
const SYSTEM: Actor = actorWith({ id: 'system', orgId: 'org-1', owner: true });

const HOLDERS: Partial<Record<Permission, string[]>> = {
  'communities:read': ['ou_owner'],
  'communities:moderate': ['ou_owner', 'ou_mod'],
};

function fakePermissions(over?: Partial<PermissionHolders>): PermissionHolders {
  return {
    holders: vi.fn(async (_orgId: string, permission: Permission) => HOLDERS[permission] ?? []),
    systemActor: vi.fn(() => SYSTEM),
    ...over,
  };
}

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
        const granted = await hasCommunityAccess(orgId, orgUserId, communityId);
        const row = spaceId ? await findSpaceMember(orgId, spaceId, orgUserId) : null;
        return { orgUserId, granted, activeInSpace: row?.status === 'active' };
      }),
    );
  return {
    list: vi.fn().mockResolvedValue({ rows: [SAMPLE], total: 1, page: 1, pageSize: 20 }),
    insert: vi.fn().mockResolvedValue(SAMPLE),
    lockGrant: vi.fn().mockResolvedValue(SAMPLE),
    setStatus: vi.fn().mockResolvedValue(SAMPLE),
    hasAccess: vi.fn().mockResolvedValue(true),
    listAccessibleContent: vi.fn().mockResolvedValue(['c1']),
    hasCommunityAccess,
    holdsAnyGrant: vi.fn().mockResolvedValue(false),
    contentTypeOf: vi.fn().mockResolvedValue('course'),
    communitiesOpenedBy: vi.fn().mockResolvedValue([]),
    accessAmong: vi.fn(accessAmong),
    findSpaceMember,
    lockSpaceMember: findSpaceMember,
    listSpaceMembers: vi.fn().mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 20 }),
    insertSpaceMember: vi.fn(async (_orgId, input) => ({ ...MEMBER, ...input })),
    updateSpaceMemberStatus: vi.fn(async (_orgId, id, status) => ({ ...MEMBER, id, status })),
    deleteSpaceMember: vi.fn().mockResolvedValue(undefined),
    countActiveSpaceMembers: vi.fn().mockResolvedValue(0),
    activeSpaceIds: vi.fn().mockResolvedValue([]),
    listGrantsExpiredBy: vi.fn().mockResolvedValue([]),
    listGrantsEndingBetween: vi.fn().mockResolvedValue([]),
    orgIdsWithDueNotices: vi.fn().mockResolvedValue(['org-1']),
    claimNotice: vi.fn().mockResolvedValue(true),
    communityMemberIds: vi.fn().mockResolvedValue([]),
    communityIdsOpenedFor: vi.fn().mockResolvedValue([]),
    openCommunityIds: vi.fn().mockResolvedValue([]),
    grantedOrgUserIds: vi.fn().mockResolvedValue([]),
    lockCapacity: vi.fn().mockResolvedValue(undefined),
    listSpaceMembersFor: vi.fn().mockResolvedValue([]),
    ...over,
  };
}

function inviteContent(): ContentReader {
  return fakeContent({
    getSpace: vi.fn().mockResolvedValue({ ...SPACE, accessRule: 'by_invite' }),
  });
}

function inviteLock(): SpaceRowLock {
  return { lockSpace: vi.fn().mockResolvedValue({ ...SPACE, accessRule: 'by_invite' }) };
}

function fakeContent(over?: Partial<ContentReader>): ContentReader {
  return {
    getSpace: vi.fn().mockResolvedValue(SPACE),
    listSpaces: vi.fn().mockResolvedValue([SPACE]),
    getEvent: vi.fn().mockResolvedValue(EVENT),
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

function build(
  repo = fakeRepo(),
  content = fakeContent(),
  spaces?: SpaceRowLock,
  permissions = fakePermissions(),
) {
  const { uow, append, appended, lock } = fakeUow(repo, spaces);
  const svc = new EntitlementsServiceImpl({
    repo,
    content,
    permissions,
    uow,
  });
  return { svc, repo, content, append, appended, lock, permissions };
}

describe('EntitlementsService', () => {
  it('lists entitlements via the read repository without appending events', async () => {
    const { svc, repo, append } = build();
    const page = await svc.list({ page: 1, pageSize: 20 }, admin);
    expect(page.rows).toHaveLength(1);
    expect(repo.list).toHaveBeenCalledWith('org-1', { page: 1, pageSize: 20 });
    expect(append).not.toHaveBeenCalled();
  });

  it('grants an entitlement (insert) and returns it', async () => {
    const { svc, repo } = build();
    const result = await svc.grant({ orgUserId: 's1', contentId: 'c1', expiresAt: null }, admin);
    expect(result.id).toBe('e1');
    expect(repo.insert).toHaveBeenCalledWith('org-1', {
      orgUserId: 's1',
      contentId: 'c1',
      expiresAt: null,
      source: 'manual',
    });
  });

  it('appends entitlement.created (org + full snapshot) inside the unit of work', async () => {
    const { svc, appended } = build();
    await svc.grant({ orgUserId: 's1', contentId: 'c1', expiresAt: null }, admin);
    expect(appended).toEqual([
      expect.objectContaining({
        type: 'entitlement.created',
        orgId: 'org-1',
        data: SAMPLE,
      }),
    ]);
  });

  it('revokes a direct grant to content via the tx-bound repository', async () => {
    const { svc, repo } = build();
    await svc.revoke({ orgUserId: 's1', contentId: 'c1' }, admin);
    expect(repo.lockGrant).toHaveBeenCalledWith('org-1', {
      orgUserId: 's1',
      contentId: 'c1',
      bundleId: null,
    });
    expect(repo.setStatus).toHaveBeenCalledWith('org-1', 'e1', 'revoked');
  });

  it('revokes a grant to a bundle without reading a content type', async () => {
    const bundleGrant = { ...SAMPLE, id: 'e2', contentId: null, bundleId: 'b1' };
    const { svc, repo } = build(fakeRepo({ lockGrant: vi.fn().mockResolvedValue(bundleGrant) }));
    await svc.revoke({ orgUserId: 's1', bundleId: 'b1' }, admin);
    expect(repo.contentTypeOf).not.toHaveBeenCalled();
    expect(repo.lockGrant).toHaveBeenCalledWith('org-1', {
      orgUserId: 's1',
      contentId: null,
      bundleId: 'b1',
    });
    expect(repo.setStatus).toHaveBeenCalledWith('org-1', 'e2', 'revoked');
  });

  it('appends entitlement.deleted on revoke', async () => {
    const { svc, appended } = build();
    await svc.revoke({ orgUserId: 's1', contentId: 'c1' }, admin);
    expect(appended).toEqual([
      expect.objectContaining({
        type: 'entitlement.deleted',
        orgId: 'org-1',
        data: SAMPLE,
      }),
    ]);
  });

  it('throws NotFoundError and appends nothing when revoke finds no grant to the bundle', async () => {
    const { svc, repo, append } = build(fakeRepo({ lockGrant: vi.fn().mockResolvedValue(null) }));
    await expect(svc.revoke({ orgUserId: 's1', bundleId: 'b1' }, admin)).rejects.toThrow(
      NotFoundError,
    );
    expect(repo.setStatus).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it('does not append when the write fails — the error propagates out of run', async () => {
    const { svc, append } = build(
      fakeRepo({ insert: vi.fn().mockRejectedValue(new Error('boom')) }),
    );
    await expect(
      svc.grant({ orgUserId: 's1', contentId: 'c1', expiresAt: null }, admin),
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
    expect(await svc.hasAccess('org-1', 'nobody', 'c1')).toBe(false);
  });

  it('lists accessible content through the repository, passing the type filter', async () => {
    const { svc, repo } = build();
    expect(await svc.listAccessibleContent('org-1', 's1', 'course')).toEqual(['c1']);
    expect(repo.listAccessibleContent).toHaveBeenCalledWith('org-1', 's1', 'course');
  });
});

describe('logging', () => {
  it('logs grant and revoke at info', async () => {
    const { createCapturingLogger } = await import('../shared/logger.js');
    const { logger, entries } = createCapturingLogger();
    const repo = fakeRepo();
    const { uow } = fakeUow(repo);
    const svc = new EntitlementsServiceImpl({
      repo,
      content: fakeContent(),
      permissions: fakePermissions(),
      uow,
      logger,
    });

    const entitlement = await svc.grant(
      {
        orgUserId: 's1',
        contentId: 'c1',
        expiresAt: null,
      },
      admin,
    );
    await svc.revoke({ orgUserId: 's1', contentId: 'c1' }, admin);

    expect(entries.map((e) => [e.level, e.msg])).toEqual([
      ['info', 'entitlement granted'],
      ['info', 'entitlement revoked'],
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
      orgUserId: 's1',
      contentId: 'c1',
    });
  });
});

describe('community access', () => {
  it('takes a grant from the repository for a person without communities:read', async () => {
    const repo = fakeRepo({ hasCommunityAccess: vi.fn(async (_o, id) => id === 'ou_member') });
    const { svc } = build(repo);
    await expect(svc.isCommunityMember('cmy_1', student)).resolves.toBe(true);
    await expect(svc.isCommunityMember('cmy_1', moderator)).resolves.toBe(false);
    expect(repo.hasCommunityAccess).toHaveBeenCalledWith('org-1', 'ou_member', 'cmy_1');
  });

  it('makes a holder of communities:read a member without a grant', async () => {
    const repo = fakeRepo({ hasCommunityAccess: vi.fn().mockResolvedValue(false) });
    const { svc } = build(repo);
    const reader = actorWith({ orgId: 'org-1', content: { cmy_1: ['communities:read'] } });
    await expect(svc.isCommunityMember('cmy_1', reader)).resolves.toBe(true);
    await expect(svc.isCommunityMember('cmy_2', reader)).resolves.toBe(false);
    await expect(svc.isCommunityMember('cmy_1', owner)).resolves.toBe(true);
    expect(repo.hasCommunityAccess).toHaveBeenCalledTimes(1);
  });

  it('requires a grant for a member and a moderator', async () => {
    const repo = fakeRepo({ hasCommunityAccess: vi.fn().mockResolvedValue(false) });
    const { svc } = build(repo);
    await expect(svc.isCommunityMember('cmy_1', student)).resolves.toBe(false);
    await expect(svc.isCommunityMember('cmy_1', moderator)).resolves.toBe(false);
  });

  it('refuses a space to someone the repository does not know', async () => {
    const { svc } = build(fakeRepo({ accessAmong: vi.fn().mockResolvedValue([]) }));
    await expect(svc.canOpenSpace('spc_1', student)).resolves.toBe(false);
  });

  it('reads the space as the system actor', async () => {
    const { svc, content } = build();
    await svc.canOpenSpace('spc_1', student);
    expect(content.getSpace).toHaveBeenCalledWith('spc_1', SYSTEM);
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
        getSpace: vi.fn(async (id: string) =>
          id === 'spc_hidden' ? hidden : id === 'spc_joined' ? joined : open,
        ),
        listSpaces: vi.fn().mockResolvedValue([open, joined, hidden]),
      }),
    );
    await expect(svc.canOpenSpace('spc_open', student)).resolves.toBe(true);
    await expect(svc.canOpenSpace('spc_joined', student)).resolves.toBe(true);
    await expect(svc.canOpenSpace('spc_hidden', student)).resolves.toBe(false);
    await expect(svc.openSpaceIds('cmy_1', student)).resolves.toEqual(['spc_open', 'spc_joined']);
  });

  it('lets a moderator with a grant open every space', async () => {
    const hidden = { ...SPACE, id: 'spc_hidden', accessRule: 'by_invite' as const };
    const { svc } = build(
      fakeRepo(),
      fakeContent({ listSpaces: vi.fn().mockResolvedValue([SPACE, hidden]) }),
    );
    await expect(svc.canOpenSpace('spc_1', moderator)).resolves.toBe(true);
    await expect(svc.openSpaceIds('cmy_1', moderator)).resolves.toEqual(['spc_1', 'spc_hidden']);
  });

  it('refuses a moderator who holds no grant', async () => {
    const { svc } = build(fakeRepo({ hasCommunityAccess: vi.fn().mockResolvedValue(false) }));
    await expect(svc.canOpenSpace('spc_1', moderator)).resolves.toBe(false);
    await expect(svc.openSpaceIds('cmy_1', moderator)).resolves.toEqual([]);
  });

  it('lets a holder of communities:read open every space without a grant or a place', async () => {
    const { svc } = build(fakeRepo({ hasCommunityAccess: vi.fn().mockResolvedValue(false) }));
    await expect(svc.canOpenSpace('spc_1', owner)).resolves.toBe(true);
    await expect(svc.openSpaceIds('cmy_1', owner)).resolves.toEqual(['spc_1']);
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
    const listSpaceMembers = vi.fn(
      async (_orgId: string, _spaceId: string, query: SpaceMembersQuery) => {
        const kept = rows.filter((row) => !query.statuses || query.statuses.includes(row.status));
        return { rows: kept, total: kept.length, page: query.page, pageSize: query.pageSize };
      },
    );
    const repo = fakeRepo({ listSpaceMembers });
    const content = fakeContent({
      getSpace: vi.fn().mockResolvedValue({ ...SPACE, accessRule: 'all_members' }),
    });
    const { svc } = build(repo, content);
    const page = { page: 1, pageSize: 20 };
    const own = await svc.listSpaceMembers('cmy_1', 'spc_1', page, student);
    expect(own.rows).toEqual([expect.objectContaining({ id: 'spm_3', status: 'active' })]);
    expect(own.total).toBe(1);
    expect(listSpaceMembers).toHaveBeenLastCalledWith('org-1', 'spc_1', {
      ...page,
      excluding: ['ou_owner', 'ou_mod'],
      statuses: ['active'],
    });
    await expect(svc.listSpaceMembers('cmy_1', 'spc_1', page, moderator)).resolves.toMatchObject({
      rows,
      total: 4,
    });
    await expect(svc.listSpaceMembers('cmy_1', 'spc_1', page, owner)).resolves.toMatchObject({
      rows,
      total: 4,
    });
  });

  it('rejects a space that belongs to another community', async () => {
    const { svc, repo } = build();
    await expect(svc.requestJoin('cmy_other', 'spc_1', student)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(svc.leave('cmy_other', 'spc_1', student)).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.insertSpaceMember).not.toHaveBeenCalled();
    expect(repo.deleteSpaceMember).not.toHaveBeenCalled();
  });

  it('records a join request from a community member', async () => {
    const { svc, appended } = build();
    const row = await svc.requestJoin('cmy_1', 'spc_1', student);
    expect(row).toMatchObject({ status: 'requested', source: 'request', orgUserId: 'ou_member' });
    expect(appended).toEqual([
      expect.objectContaining({
        type: 'entitlement.space_member.created',
        data: expect.objectContaining({ status: 'requested' }),
        metadata: { actorId: 'ou_member' },
      }),
    ]);
  });

  it('refuses a request from staff, a moderator, or someone without a grant', async () => {
    const { svc } = build(fakeRepo({ hasCommunityAccess: vi.fn().mockResolvedValue(false) }));
    await expect(svc.requestJoin('cmy_1', 'spc_1', owner)).rejects.toBeInstanceOf(ForbiddenError);
    const granted = build();
    await expect(granted.svc.requestJoin('cmy_1', 'spc_1', moderator)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(svc.requestJoin('cmy_1', 'spc_1', student)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses a request for an all-members space or a by-invite space', async () => {
    const all = build(
      fakeRepo(),
      fakeContent({ getSpace: vi.fn().mockResolvedValue({ ...SPACE, accessRule: 'all_members' }) }),
    );
    await expect(all.svc.requestJoin('cmy_1', 'spc_1', student)).rejects.toThrow(
      'An all-members space has no space members',
    );
    const hidden = build(
      fakeRepo(),
      fakeContent({ getSpace: vi.fn().mockResolvedValue({ ...SPACE, accessRule: 'by_invite' }) }),
    );
    await expect(hidden.svc.requestJoin('cmy_1', 'spc_1', student)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    const invited = build(
      fakeRepo({ findSpaceMember: vi.fn().mockResolvedValue({ ...MEMBER, status: 'invited' }) }),
      fakeContent({ getSpace: vi.fn().mockResolvedValue({ ...SPACE, accessRule: 'by_invite' }) }),
    );
    await expect(invited.svc.requestJoin('cmy_1', 'spc_1', student)).rejects.toThrow(
      'This space is by invitation',
    );
  });

  it('answers every space-member path on a hidden by-invite space as a missing space', async () => {
    const { svc } = build(fakeRepo(), inviteContent());
    const missing = build(fakeRepo(), fakeContent({ getSpace: vi.fn().mockResolvedValue(null) }));
    const paths = (service: typeof svc) => [
      service.requestJoin('cmy_1', 'spc_1', student),
      service.accept('cmy_1', 'spc_1', student),
      service.refuse('cmy_1', 'spc_1', student),
      service.leave('cmy_1', 'spc_1', student),
      service.invite('cmy_1', 'spc_1', 'ou_other', student),
      service.listSpaceMembers('cmy_1', 'spc_1', { page: 1, pageSize: 20 }, student),
    ];
    const messages = async (service: typeof svc) =>
      Promise.all(
        paths(service).map((run) =>
          run.then(
            () => null,
            (error: unknown) => (error instanceof NotFoundError ? error.message : error),
          ),
        ),
      );
    expect(await messages(svc)).toEqual(await messages(missing.svc));
  });

  it('invites a community member and rejects a second row', async () => {
    const repo = fakeRepo({
      findSpaceMember: vi.fn().mockResolvedValue({ ...MEMBER, status: 'requested' }),
    });
    const { svc } = build(repo, inviteContent());
    await expect(svc.invite('cmy_1', 'spc_1', 'ou_member', owner)).rejects.toBeInstanceOf(
      ConflictError,
    );
    const open = build(fakeRepo(), inviteContent());
    const row = await open.svc.invite('cmy_1', 'spc_1', 'ou_member', moderator);
    expect(row).toMatchObject({ status: 'invited', source: 'invite' });
  });

  it('refuses an invite from a student or for someone who is not a member', async () => {
    const { svc } = build(
      fakeRepo({ findSpaceMember: vi.fn().mockResolvedValue({ ...MEMBER, status: 'active' }) }),
      inviteContent(),
    );
    await expect(svc.invite('cmy_1', 'spc_1', 'ou_other', student)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    const outsider = build(
      fakeRepo({ hasCommunityAccess: vi.fn().mockResolvedValue(false) }),
      inviteContent(),
    );
    await expect(outsider.svc.invite('cmy_1', 'spc_1', 'ou_other', owner)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('accepts an invitation when the space has room and records the previous status', async () => {
    const repo = fakeRepo({
      findSpaceMember: vi
        .fn()
        .mockResolvedValue({ ...MEMBER, status: 'invited', source: 'invite' }),
    });
    const { svc, lock, appended } = build(repo, inviteContent(), inviteLock());
    const row = await svc.accept('cmy_1', 'spc_1', student);
    expect(lock.lockSpace).toHaveBeenCalledWith('org-1', 'spc_1');
    expect(row.status).toBe('active');
    expect(appended[0]).toMatchObject({
      type: 'entitlement.space_member.updated',
      metadata: { actorId: 'ou_member', previousStatus: 'invited' },
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
    await expect(svc.accept('cmy_1', 'spc_1', student)).rejects.toThrow('This space is full');
    expect(appended).toEqual([]);
    expect(repo.updateSpaceMemberStatus).not.toHaveBeenCalled();
  });

  it('approves a request and declines one by deleting it', async () => {
    const requested = { ...MEMBER, status: 'requested' as const };
    const repo = fakeRepo({ findSpaceMember: vi.fn().mockResolvedValue(requested) });
    const approved = build(repo);
    const row = await approved.svc.approve('cmy_1', 'spc_1', 'ou_member', owner);
    expect(row.status).toBe('active');
    expect(approved.appended[0]).toMatchObject({
      metadata: { previousStatus: 'requested' },
    });
    const declined = build(repo);
    const gone = await declined.svc.decline('cmy_1', 'spc_1', 'ou_member', moderator);
    expect(gone.status).toBe('requested');
    expect(repo.deleteSpaceMember).toHaveBeenCalledWith('org-1', 'spm_1');
    expect(declined.appended[0]).toMatchObject({
      type: 'entitlement.space_member.deleted',
      metadata: { actorId: 'ou_mod', previousStatus: 'requested' },
    });
  });

  it('lets the invited person refuse and an active member leave', async () => {
    const invited = fakeRepo({
      findSpaceMember: vi.fn().mockResolvedValue({ ...MEMBER, status: 'invited' }),
    });
    const refusal = build(invited, inviteContent());
    await refusal.svc.refuse('cmy_1', 'spc_1', student);
    expect(refusal.appended[0]).toMatchObject({
      type: 'entitlement.space_member.deleted',
      metadata: { previousStatus: 'invited' },
    });
    const active = fakeRepo({
      findSpaceMember: vi.fn().mockResolvedValue({ ...MEMBER, status: 'active' }),
    });
    const left = build(active);
    await left.svc.leave('cmy_1', 'spc_1', student);
    expect(left.appended[0]).toMatchObject({ metadata: { previousStatus: 'active' } });
  });

  it('removes a member by revoking the row', async () => {
    const repo = fakeRepo({
      findSpaceMember: vi.fn().mockResolvedValue({ ...MEMBER, status: 'active' }),
    });
    const { svc, appended } = build(repo);
    const row = await svc.remove('cmy_1', 'spc_1', 'ou_member', owner);
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
    await expect(before.svc.remove('cmy_1', 'spc_1', 'ou_member', owner)).rejects.toBeInstanceOf(
      ConflictError,
    );
    const changed = build(repo, fakeContent(), {
      lockSpace: vi.fn().mockResolvedValue(allMembers),
    });
    await expect(changed.svc.remove('cmy_1', 'spc_1', 'ou_member', owner)).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(changed.lock.lockSpace).toHaveBeenCalledWith('org-1', 'spc_1');
    expect(repo.updateSpaceMemberStatus).not.toHaveBeenCalled();
    expect(before.appended).toEqual([]);
    expect(changed.appended).toEqual([]);
  });

  it('adds a person directly when the space has room', async () => {
    const { svc, appended } = build();
    const row = await svc.addSpaceMember('cmy_1', 'spc_1', 'ou_member', owner);
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
    await svc.expireDueGrants(now);
    expect(appended).toEqual([
      expect.objectContaining({
        type: 'entitlement.expired',
        data: expect.objectContaining({ id: 'ent_1' }),
      }),
    ]);
    expect(appended[0]).not.toHaveProperty('metadata');
    expect(repo.claimNotice).toHaveBeenCalledWith(
      'org-1',
      { kind: 'expired', entitlementId: 'ent_1', expiresAt: grant.expiresAt },
      now,
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
    await svc.expireDueGrants(now);
    expect(repo.listGrantsEndingBetween).toHaveBeenCalledWith(
      'org-1',
      now,
      new Date('2026-06-08T00:00:00Z'),
      100,
      undefined,
    );
    expect(repo.claimNotice).toHaveBeenCalledWith(
      'org-1',
      {
        kind: 'ending_soon',
        entitlementId: 'ent_b',
        communityId: 'cmy_1',
        expiresAt: bundle.expiresAt,
      },
      now,
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

  it('works expired grants in bounded batches after the last grant of the previous one', async () => {
    const first = Array.from({ length: 100 }, (_, i) => ({
      ...grant,
      id: `ent_${String(i).padStart(3, '0')}`,
    }));
    const listGrantsExpiredBy = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce([{ ...grant, id: 'ent_100' }]);
    const repo = fakeRepo({ listGrantsExpiredBy });
    const { svc, appended } = build(repo);
    await svc.expireDueGrants(now);
    expect(listGrantsExpiredBy).toHaveBeenCalledTimes(2);
    expect(listGrantsExpiredBy).toHaveBeenNthCalledWith(1, 'org-1', now, 100, undefined);
    expect(listGrantsExpiredBy).toHaveBeenNthCalledWith(2, 'org-1', now, 100, 'ent_099');
    expect(appended).toHaveLength(101);
  });

  it('appends nothing when every notice was already claimed', async () => {
    const repo = fakeRepo({
      listGrantsExpiredBy: vi.fn().mockResolvedValue([grant]),
      claimNotice: vi.fn().mockResolvedValue(false),
    });
    const { svc, append } = build(repo);
    await svc.expireDueGrants(now);
    expect(append).not.toHaveBeenCalled();
  });

  it('expires due grants org by org across every org with due notices', async () => {
    const repo = fakeRepo({
      orgIdsWithDueNotices: vi.fn().mockResolvedValue(['org-1', 'org-2']),
      listGrantsExpiredBy: vi.fn(async (orgId: string) =>
        orgId === 'org-2' ? [{ ...grant, orgId, id: 'ent_2' }] : [grant],
      ),
    });
    const { svc, appended } = build(repo);
    await svc.expireDueGrants(now);
    expect(repo.orgIdsWithDueNotices).toHaveBeenCalledWith(now, new Date('2026-06-08T00:00:00Z'));
    expect(appended.map((event) => [event.type, event.orgId])).toEqual([
      ['entitlement.expired', 'org-1'],
      ['entitlement.expired', 'org-2'],
    ]);
  });

  it('keeps going past an org that fails, then fails the run so it is retried', async () => {
    const repo = fakeRepo({
      orgIdsWithDueNotices: vi.fn().mockResolvedValue(['org-1', 'org-2']),
      listGrantsExpiredBy: vi.fn(async (orgId: string) => {
        if (orgId === 'org-1') {
          throw new Error('db down');
        }
        return [{ ...grant, orgId, id: 'ent_2' }];
      }),
    });
    const { svc, appended } = build(repo);
    await expect(svc.expireDueGrants(now)).rejects.toThrow(
      'due grants of 1 orgs could not be expired',
    );
    expect(appended.map((event) => event.orgId)).toEqual(['org-2']);
  });
});

describe('membership among many', () => {
  it('keeps grant holders and holders of communities:read as members', async () => {
    const repo = fakeRepo({
      accessAmong: vi.fn().mockResolvedValue([
        { orgUserId: 'ou_owner', granted: false, activeInSpace: false },
        { orgUserId: 'ou_member', granted: true, activeInSpace: false },
        { orgUserId: 'ou_mod', granted: false, activeInSpace: false },
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
        { orgUserId: 'ou_owner', granted: false, activeInSpace: false },
        { orgUserId: 'ou_joined', granted: true, activeInSpace: true },
        { orgUserId: 'ou_asked', granted: true, activeInSpace: false },
        { orgUserId: 'ou_mod', granted: true, activeInSpace: false },
        { orgUserId: 'ou_lapsed', granted: false, activeInSpace: true },
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
    await expect(svc.openSpacesFor('cmy_1', student)).resolves.toEqual([open, joined]);
  });

  it('ignores space-member rows in an all-members space', async () => {
    const open = { ...SPACE, accessRule: 'all_members' as const };
    const repo = fakeRepo({
      findSpaceMember: vi.fn().mockResolvedValue({ ...MEMBER, status: 'revoked' }),
    });
    const { svc } = build(repo, fakeContent({ getSpace: vi.fn().mockResolvedValue(open) }));
    await expect(svc.canOpenSpace('spc_1', student)).resolves.toBe(true);
  });

  it('loads the space once when listing its members', async () => {
    const content = fakeContent({
      getSpace: vi.fn().mockResolvedValue({ ...SPACE, accessRule: 'all_members' }),
    });
    const { svc } = build(fakeRepo(), content);
    await svc.listSpaceMembers('cmy_1', 'spc_1', { page: 1, pageSize: 20 }, student);
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
    const svc = new EntitlementsServiceImpl({
      repo,
      content: fakeContent(),
      permissions: fakePermissions(),
      uow,
    });
    return { svc, repo, appended, lockedInTx };
  }

  it('reads the row under lock inside the transaction when approving', async () => {
    const { svc, lockedInTx } = tracked({ ...MEMBER, status: 'requested' });
    await svc.approve('cmy_1', 'spc_1', 'ou_member', owner);
    expect(lockedInTx).toEqual([true]);
  });

  it('refuses a second approval and emits nothing', async () => {
    const { svc, repo, appended } = tracked({ ...MEMBER, status: 'active' });
    await expect(svc.approve('cmy_1', 'spc_1', 'ou_member', owner)).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(repo.updateSpaceMemberStatus).not.toHaveBeenCalled();
    expect(appended).toEqual([]);
  });

  it('refuses a decline once the request was approved', async () => {
    const { svc, repo, appended, lockedInTx } = tracked({ ...MEMBER, status: 'active' });
    await expect(svc.decline('cmy_1', 'spc_1', 'ou_member', owner)).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(lockedInTx).toEqual([true]);
    expect(repo.deleteSpaceMember).not.toHaveBeenCalled();
    expect(appended).toEqual([]);
  });

  it('refuses a removal of a row that is gone', async () => {
    const { svc, appended } = tracked(null);
    await expect(svc.remove('cmy_1', 'spc_1', 'ou_member', owner)).rejects.toBeInstanceOf(
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
    await expect(svc.approve('cmy_1', 'spc_1', 'ou_member', moderator)).rejects.toThrow(
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
    await expect(svc.invite('cmy_1', 'spc_1', 'ou_member', owner)).rejects.toThrow(
      'This space is by request',
    );
    await expect(svc.accept('cmy_1', 'spc_1', student)).rejects.toThrow('This space is by request');
    expect(appended).toEqual([]);
  });

  it('refuses an approval in a by-invite space', async () => {
    const repo = fakeRepo({
      findSpaceMember: vi.fn().mockResolvedValue({ ...MEMBER, status: 'requested' }),
    });
    const { svc, appended } = build(repo, inviteContent(), inviteLock());
    await expect(svc.approve('cmy_1', 'spc_1', 'ou_member', owner)).rejects.toThrow(
      'This space is by invitation',
    );
    expect(appended).toEqual([]);
  });

  it('refuses an acceptance when the rule changed before the lock', async () => {
    const repo = fakeRepo({
      findSpaceMember: vi.fn().mockResolvedValue({ ...MEMBER, status: 'invited' }),
    });
    const { svc, appended } = build(repo, inviteContent());
    await expect(svc.accept('cmy_1', 'spc_1', student)).rejects.toThrow('This space is by request');
    expect(repo.updateSpaceMemberStatus).not.toHaveBeenCalled();
    expect(appended).toEqual([]);
  });
});

describe('grant from an automation', () => {
  const input = { orgUserId: 's1', contentId: 'c1', expiresAt: new Date('2026-09-01T00:00:00Z') };

  it('grants as the system actor with source automation and no actor in the metadata', async () => {
    const { svc, repo, appended } = build();
    await svc.grant(input, SYSTEM);
    expect(repo.insert).toHaveBeenCalledWith('org-1', { ...input, source: 'automation' });
    expect(appended).toEqual([
      expect.objectContaining({ type: 'entitlement.created', metadata: {} }),
    ]);
  });

  it('grants a revoked grant again, with the new expiry', async () => {
    const { svc, repo } = build(
      fakeRepo({ lockGrant: vi.fn().mockResolvedValue({ ...SAMPLE, status: 'revoked' }) }),
    );
    await svc.grant(input, SYSTEM);
    expect(repo.insert).toHaveBeenCalledWith('org-1', { ...input, source: 'automation' });
  });
});

describe('permission checks', () => {
  const nobody = actorWith({ id: 'ou_nobody', orgId: 'org-1' });
  const input = { orgUserId: 's1', contentId: 'c1', expiresAt: null };

  it('refuses grant and revoke without access:write', async () => {
    const { svc, append } = build();
    const reader = actorWith({ orgId: 'org-1', org: ['access:read'] });
    await expect(svc.grant(input, nobody)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(svc.grant(input, reader)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(svc.revoke({ orgUserId: 's1', contentId: 'c1' }, reader)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(svc.revoke({ orgUserId: 's1', bundleId: 'b1' }, reader)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(append).not.toHaveBeenCalled();
  });

  it('refuses every method a person can call to an actor who holds nothing', async () => {
    const { svc, repo, append } = build(
      fakeRepo({ findSpaceMember: vi.fn().mockResolvedValue(MEMBER) }),
      inviteContent(),
      inviteLock(),
    );
    const calls: Record<string, () => Promise<unknown>> = {
      list: () => svc.list({ page: 1, pageSize: 20 }, nobody),
      revoke: () => svc.revoke({ orgUserId: 's1', contentId: 'c1' }, nobody),
      invite: () => svc.invite('cmy_1', 'spc_1', 'ou_member', nobody),
      addSpaceMember: () => svc.addSpaceMember('cmy_1', 'spc_1', 'ou_member', nobody),
      approve: () => svc.approve('cmy_1', 'spc_1', 'ou_member', nobody),
      decline: () => svc.decline('cmy_1', 'spc_1', 'ou_member', nobody),
      remove: () => svc.remove('cmy_1', 'spc_1', 'ou_member', nobody),
    };
    for (const [name, call] of Object.entries(calls)) {
      await expect(call(), name).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(append).not.toHaveBeenCalled();
    expect(repo.list).not.toHaveBeenCalled();
    expect(repo.insertSpaceMember).not.toHaveBeenCalled();
  });

  it('refuses an Instructor on one course every grant action', async () => {
    const { svc, append } = build();
    const james = actorWith({
      id: 'ou_james',
      orgId: 'org-1',
      content: { crs_1: ['courses:read', 'courses:write', 'courses:moderate', 'progress:read'] },
    });
    const own = { orgUserId: 's1', contentId: 'crs_1', expiresAt: null };
    await expect(svc.grant(own, james)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(svc.revoke({ orgUserId: 's1', contentId: 'crs_1' }, james)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(svc.list({ page: 1, pageSize: 20 }, james)).rejects.toBeInstanceOf(ForbiddenError);
    expect(append).not.toHaveBeenCalled();
  });

  it('lets the system actor give a grant, as automations do', async () => {
    const { svc } = build();
    await expect(svc.grant(input, SYSTEM)).resolves.toMatchObject({ id: 'e1' });
  });

  it('refuses grant and revoke on content that is not an event before saying whether it exists', async () => {
    for (const type of ['course', null] as const) {
      const { svc } = build(fakeRepo({ contentTypeOf: vi.fn().mockResolvedValue(type) }));
      await expect(svc.grant(input, nobody)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(svc.revoke({ orgUserId: 's1', contentId: 'c1' }, nobody)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    }
  });

  it('lists every grant with access:read and refuses without it', async () => {
    const { svc, repo } = build();
    const reader = actorWith({ orgId: 'org-1', org: ['access:read'] });
    await expect(svc.list({ page: 1, pageSize: 20 }, reader)).resolves.toMatchObject({ total: 1 });
    await expect(svc.list({ page: 1, pageSize: 20 }, nobody)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(repo.list).toHaveBeenCalledTimes(1);
  });

  it("lists a course's learners with progress:read on that course only", async () => {
    const { svc, repo } = build();
    const james = actorWith({ orgId: 'org-1', content: { crs_1: ['progress:read'] } });
    const query = { page: 1, pageSize: 20 };
    await expect(svc.list({ ...query, contentId: 'crs_1' }, james)).resolves.toMatchObject({
      total: 1,
    });
    await expect(svc.list({ ...query, contentId: 'crs_2' }, james)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(svc.list(query, james)).rejects.toBeInstanceOf(ForbiddenError);
    expect(repo.list).toHaveBeenCalledWith('org-1', { ...query, contentId: 'crs_1' });
  });

  it('refuses progress:read on the org for an item that is not a course', async () => {
    const repo = fakeRepo({ contentTypeOf: vi.fn().mockResolvedValue('download') });
    const { svc } = build(repo);
    const viewer = actorWith({ orgId: 'org-1', org: ['progress:read'] });
    await expect(
      svc.list({ page: 1, pageSize: 20, contentId: 'dl_1' }, viewer),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('needs communities:moderate on that community, as its member, to manage space members', async () => {
    const elsewhere = actorWith({
      id: 'ou_mod',
      orgId: 'org-1',
      content: { cmy_2: ['communities:moderate'] },
    });
    const open = build(fakeRepo({ findSpaceMember: vi.fn().mockResolvedValue(null) }));
    await expect(
      open.svc.addSpaceMember('cmy_1', 'spc_1', 'ou_member', student),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      open.svc.addSpaceMember('cmy_1', 'spc_1', 'ou_member', elsewhere),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      open.svc.addSpaceMember('cmy_1', 'spc_1', 'ou_member', moderator),
    ).resolves.toMatchObject({ status: 'active' });
    const outside = build(
      fakeRepo({
        findSpaceMember: vi.fn().mockResolvedValue(null),
        hasCommunityAccess: vi.fn(async (_o, id) => id !== 'ou_mod'),
      }),
    );
    await expect(
      outside.svc.addSpaceMember('cmy_1', 'spc_1', 'ou_member', moderator),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('opening every space', () => {
  it('is communities:read on the community, or communities:moderate as its member', async () => {
    const { svc } = build(
      fakeRepo({ hasCommunityAccess: vi.fn(async (_o, id) => id === 'ou_mod') }),
    );
    const reader = actorWith({ orgId: 'org-1', content: { cmy_1: ['communities:read'] } });
    const lapsedMod = actorWith({
      id: 'ou_lapsed',
      orgId: 'org-1',
      content: { cmy_1: ['communities:moderate'] },
    });
    await expect(svc.opensEverySpace(reader, 'cmy_1')).resolves.toBe(true);
    await expect(svc.opensEverySpace(reader, 'cmy_2')).resolves.toBe(false);
    await expect(svc.opensEverySpace(moderator, 'cmy_1')).resolves.toBe(true);
    await expect(svc.opensEverySpace(moderator, 'cmy_2')).resolves.toBe(false);
    await expect(svc.opensEverySpace(lapsedMod, 'cmy_1')).resolves.toBe(false);
    await expect(svc.opensEverySpace(student, 'cmy_1')).resolves.toBe(false);
  });

  it('holds no place: no request, acceptance, refusal or departure', async () => {
    const reader = actorWith({ orgId: 'org-1', content: { cmy_1: ['communities:read'] } });
    const { svc, append } = build();
    const invited = build(fakeRepo(), inviteContent(), inviteLock());
    await expect(svc.requestJoin('cmy_1', 'spc_1', reader)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(svc.requestJoin('cmy_1', 'spc_1', moderator)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(invited.svc.accept('cmy_1', 'spc_1', reader)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(invited.svc.refuse('cmy_1', 'spc_1', moderator)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(svc.leave('cmy_1', 'spc_1', reader)).rejects.toBeInstanceOf(ForbiddenError);
    expect(append).not.toHaveBeenCalled();
  });

  it('refuses inviting or adding someone who opens every space', async () => {
    const invited = build(
      fakeRepo({ findSpaceMember: vi.fn().mockResolvedValue(null) }),
      inviteContent(),
      inviteLock(),
    );
    await expect(invited.svc.invite('cmy_1', 'spc_1', 'ou_mod', owner)).rejects.toThrow(
      'That person opens every space in this community and holds no place in them',
    );
    await expect(
      invited.svc.addSpaceMember('cmy_1', 'spc_1', 'ou_owner', moderator),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('ignores the place rows of someone who opens every space', async () => {
    const repo = fakeRepo({
      listSpaceMembersFor: vi.fn().mockResolvedValue([{ ...MEMBER, status: 'active' }]),
    });
    const { svc } = build(repo);
    await expect(svc.spaceStandings('cmy_1', moderator)).resolves.toEqual({});
    await expect(svc.spaceStandings('cmy_1', student)).resolves.toEqual({
      spc_1: 'active',
    });
  });

  it('leaves those who open every space out of the counts', async () => {
    const { svc, repo } = build();
    await expect(svc.everySpaceOpeners('org-1', 'cmy_1')).resolves.toEqual(['ou_owner', 'ou_mod']);
    await svc.countActiveSpaceMembers('org-1', 'spc_1');
    expect(repo.countActiveSpaceMembers).toHaveBeenCalledWith('org-1', 'spc_1', [
      'ou_owner',
      'ou_mod',
    ]);
  });
});

describe('holders passed to the repository', () => {
  it('passes the holders of communities:read as members of the community', async () => {
    const { svc, repo, permissions } = build();
    await svc.communityMemberIds('org-1', 'cmy_1');
    expect(permissions.holders).toHaveBeenCalledWith('org-1', 'communities:read', 'cmy_1');
    expect(repo.communityMemberIds).toHaveBeenCalledWith('org-1', 'cmy_1', ['ou_owner']);
  });

  it('lists the moderators who are members of the community', async () => {
    const repo = fakeRepo({ hasCommunityAccess: vi.fn(async (_o, id) => id === 'ou_mod') });
    const { svc } = build(repo);
    await expect(svc.communityModeratorIds('org-1', 'cmy_1')).resolves.toEqual([
      'ou_owner',
      'ou_mod',
    ]);
    const lapsed = build(fakeRepo({ hasCommunityAccess: vi.fn().mockResolvedValue(false) }));
    await expect(lapsed.svc.communityModeratorIds('org-1', 'cmy_1')).resolves.toEqual(['ou_owner']);
  });

  it('opens the communities the actor reads, or every one on the org', async () => {
    const { svc, repo } = build();
    const reader = actorWith({
      id: 'ou_r',
      orgId: 'org-1',
      content: { cmy_1: ['communities:read'] },
    });
    await svc.openCommunityIds(reader);
    expect(repo.openCommunityIds).toHaveBeenCalledWith('org-1', 'ou_r', {
      all: false,
      ids: ['cmy_1'],
    });
    await svc.openCommunityIds(owner);
    expect(repo.openCommunityIds).toHaveBeenLastCalledWith('org-1', 'ou_owner', {
      all: true,
      ids: [],
    });
  });

  it('answers whether a person holds any grant', async () => {
    const { svc, repo } = build();
    await expect(svc.holdsAnyGrant('org-1', 'ou_member')).resolves.toBe(false);
    expect(repo.holdsAnyGrant).toHaveBeenCalledWith('org-1', 'ou_member');
  });
});

describe('a learner with a grant', () => {
  it('requests a place in a space, with every internal read passing the system actor', async () => {
    const { svc, content, permissions } = build();
    const row = await svc.requestJoin('cmy_1', 'spc_1', student);
    expect(row).toMatchObject({ orgUserId: 'ou_member', status: 'requested' });
    expect(content.getSpace).toHaveBeenCalledWith('spc_1', SYSTEM);
    expect(permissions.systemActor).toHaveBeenCalledWith('org-1');
  });
});

describe('grants to an event', () => {
  const sarah = actorWith({ id: 'ou_sarah', orgId: 'org-1', owner: true });
  const tom = actorWith({
    id: 'ou_tom',
    orgId: 'org-1',
    content: { evn_1: ['events:read', 'events:write'] },
  });
  const james = actorWith({ id: 'ou_james', orgId: 'org-1' });
  const checkout = actorWith({ id: 'ou_key', orgId: 'org-1', org: ['access:write'] });
  const register = { orgUserId: 'ou_james', contentId: 'evn_1', expiresAt: null };
  const addEmma = { orgUserId: 'ou_emma', contentId: 'evn_1', expiresAt: null };

  function eventRepo(over?: Partial<EntitlementsRepository>) {
    return fakeRepo({
      contentTypeOf: vi.fn().mockResolvedValue('event'),
      hasAccess: vi.fn().mockResolvedValue(false),
      lockGrant: vi.fn().mockResolvedValue(null),
      insert: vi.fn(async (_orgId, input) => ({
        ...SAMPLE,
        orgUserId: input.orgUserId,
        contentId: input.contentId ?? null,
        source: input.source ?? 'manual',
      })),
      ...over,
    });
  }

  function withEvent(
    over: Partial<Omit<Event, 'settings'>> & { settings?: Partial<Event['settings']> } = {},
  ) {
    return fakeContent({
      getEvent: vi.fn().mockResolvedValue({
        ...EVENT,
        ...over,
        settings: { ...EVENT.settings, ...over.settings },
      }),
    });
  }

  describe('registering', () => {
    it('grants a public event to the caller with source self and no expiry, as the actor', async () => {
      const { svc, repo, content, appended } = build(eventRepo());
      const grant = await svc.grant({ ...register, expiresAt: new Date('2099-01-01') }, james);
      expect(content.getEvent).toHaveBeenCalledWith('evn_1', SYSTEM);
      expect(repo.insert).toHaveBeenCalledWith('org-1', {
        orgUserId: 'ou_james',
        contentId: 'evn_1',
        expiresAt: null,
        source: 'self',
      });
      expect(grant.source).toBe('self');
      expect(repo.lockCapacity).not.toHaveBeenCalled();
      expect(appended).toEqual([
        expect.objectContaining({
          type: 'entitlement.created',
          metadata: { actorId: 'ou_james' },
        }),
      ]);
    });

    it('answers 404 for an event that is not published', async () => {
      for (const status of ['draft', 'canceled'] as const) {
        const { svc, append } = build(eventRepo(), withEvent({ status }));
        await expect(svc.grant(register, james)).rejects.toBeInstanceOf(NotFoundError);
        expect(append).not.toHaveBeenCalled();
      }
    });

    it('answers 404 on the event routes for an id that is no event', async () => {
      for (const type of [null, 'course'] as const) {
        const { svc } = build(eventRepo({ contentTypeOf: vi.fn().mockResolvedValue(type) }));
        await expect(
          svc.grant({ ...register, contentType: 'event' }, james),
        ).rejects.toBeInstanceOf(NotFoundError);
      }
    });

    it('refuses already_registered to an attendee, through a bundle too', async () => {
      const { svc, append } = build(eventRepo({ hasAccess: vi.fn().mockResolvedValue(true) }));
      await expect(svc.grant(register, james)).rejects.toMatchObject({
        code: 'already_registered',
      });
      expect(append).not.toHaveBeenCalled();
    });

    it('refuses already_registered before checking the event type', async () => {
      const { svc } = build(
        eventRepo({ hasAccess: vi.fn().mockResolvedValue(true) }),
        withEvent({ settings: { type: 'private' } }),
      );
      await expect(svc.grant(register, james)).rejects.toMatchObject({
        code: 'already_registered',
      });
    });

    it('refuses 403 on a private event, to staff registering themselves too', async () => {
      const { svc, append } = build(eventRepo(), withEvent({ settings: { type: 'private' } }));
      await expect(svc.grant(register, james)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(svc.grant({ ...register, orgUserId: 'ou_sarah' }, sarah)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      expect(append).not.toHaveBeenCalled();
    });

    it('refuses started once the event has started', async () => {
      const { svc } = build(
        eventRepo(),
        withEvent({ startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + 1) }),
      );
      await expect(svc.grant(register, james)).rejects.toMatchObject({ code: 'started' });
    });

    it('counts the attendees under the capacity lock and refuses full', async () => {
      const repo = eventRepo({ grantedOrgUserIds: vi.fn().mockResolvedValue(['ou_a', 'ou_b']) });
      const { svc, append } = build(repo, withEvent({ settings: { capacity: 2 } }));
      await expect(svc.grant(register, james)).rejects.toBeInstanceOf(ConflictError);
      await expect(svc.grant(register, james)).rejects.toMatchObject({ code: 'full' });
      expect(repo.lockCapacity).toHaveBeenCalledWith('org-1', 'evn_1');
      expect(repo.insert).not.toHaveBeenCalled();
      expect(append).not.toHaveBeenCalled();
    });

    it('takes the last place under the lock', async () => {
      const repo = eventRepo({ grantedOrgUserIds: vi.fn().mockResolvedValue(['ou_a']) });
      const { svc } = build(repo, withEvent({ settings: { capacity: 2 } }));
      await svc.grant(register, james);
      const lock = vi.mocked(repo.lockCapacity).mock.invocationCallOrder[0]!;
      const count = vi.mocked(repo.grantedOrgUserIds).mock.invocationCallOrder[0]!;
      const insert = vi.mocked(repo.insert).mock.invocationCallOrder[0]!;
      expect(lock).toBeLessThan(count);
      expect(count).toBeLessThan(insert);
    });

    it('reactivates a revoked grant through the upsert', async () => {
      const repo = eventRepo({
        lockGrant: vi.fn().mockResolvedValue({ ...SAMPLE, status: 'revoked' }),
      });
      const { svc, appended } = build(repo);
      await svc.grant(register, james);
      expect(repo.insert).toHaveBeenCalled();
      expect(appended).toEqual([expect.objectContaining({ type: 'entitlement.created' })]);
    });
  });

  describe('for someone else', () => {
    it('adds an attendee with source manual for events:write on the event', async () => {
      const { svc, repo, appended } = build(
        eventRepo(),
        withEvent({ settings: { type: 'private' } }),
      );
      const grant = await svc.grant(addEmma, tom);
      expect(repo.insert).toHaveBeenCalledWith('org-1', {
        orgUserId: 'ou_emma',
        contentId: 'evn_1',
        expiresAt: null,
        source: 'manual',
      });
      expect(grant.orgUserId).toBe('ou_emma');
      expect(appended).toEqual([
        expect.objectContaining({ type: 'entitlement.created', metadata: { actorId: 'ou_tom' } }),
      ]);
    });

    it('lets an API key with access:write grant an event, keeping its expiry', async () => {
      const { svc, repo } = build(eventRepo());
      const expiresAt = new Date('2099-06-01T00:00:00Z');
      await svc.grant({ ...addEmma, expiresAt }, checkout);
      expect(repo.insert).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({ expiresAt, source: 'manual' }),
      );
    });

    it('refuses 403 without access:write or events:write, before reading the event', async () => {
      const other = actorWith({
        id: 'ou_other',
        orgId: 'org-1',
        content: { evn_2: ['events:write'], crs_1: ['courses:write'] },
      });
      const { svc, content, append } = build(eventRepo());
      await expect(svc.grant(addEmma, james)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(svc.grant(addEmma, other)).rejects.toBeInstanceOf(ForbiddenError);
      expect(content.getEvent).not.toHaveBeenCalled();
      expect(append).not.toHaveBeenCalled();
    });

    it('refuses not_published for a draft or canceled event', async () => {
      for (const status of ['draft', 'canceled'] as const) {
        const { svc } = build(eventRepo(), withEvent({ status }));
        await expect(svc.grant(addEmma, tom)).rejects.toMatchObject({ code: 'not_published' });
      }
    });

    it('refuses ended once the event is over, and allows a started one', async () => {
      const ended = build(
        eventRepo(),
        withEvent({ startsAt: new Date(Date.now() - 7_200_000), endsAt: new Date(Date.now() - 1) }),
      );
      await expect(ended.svc.grant(addEmma, tom)).rejects.toMatchObject({ code: 'ended' });
      const running = build(
        eventRepo(),
        withEvent({
          startsAt: new Date(Date.now() - 60_000),
          endsAt: new Date(Date.now() + 60_000),
        }),
      );
      await expect(running.svc.grant(addEmma, tom)).resolves.toMatchObject({
        orgUserId: 'ou_emma',
      });
    });

    it('refuses full counting the attendees other than the person', async () => {
      const full = build(
        eventRepo({ grantedOrgUserIds: vi.fn().mockResolvedValue(['ou_a', 'ou_b']) }),
        withEvent({ settings: { capacity: 2, type: 'private' } }),
      );
      await expect(full.svc.grant(addEmma, tom)).rejects.toMatchObject({ code: 'full' });
      const bundled = build(
        eventRepo({ grantedOrgUserIds: vi.fn().mockResolvedValue(['ou_a', 'ou_emma']) }),
        withEvent({ settings: { capacity: 2 } }),
      );
      await expect(bundled.svc.grant(addEmma, tom)).resolves.toMatchObject({
        orgUserId: 'ou_emma',
      });
      expect(bundled.repo.lockCapacity).toHaveBeenCalledWith('org-1', 'evn_1');
    });

    it('changes nothing for a person who already holds an active grant', async () => {
      const existing = { ...SAMPLE, orgUserId: 'ou_emma', contentId: 'evn_1' };
      const repo = eventRepo({ lockGrant: vi.fn().mockResolvedValue(existing) });
      const { svc, append } = build(repo, withEvent({ settings: { capacity: 1 } }));
      await expect(svc.grant(addEmma, tom)).resolves.toEqual(existing);
      expect(repo.insert).not.toHaveBeenCalled();
      expect(append).not.toHaveBeenCalled();
    });
  });

  it('keeps access:write as the rule for content that is not an event', async () => {
    const { svc, repo } = build();
    const own = { orgUserId: 'ou_tom', contentId: 'crs_1', expiresAt: null };
    await expect(svc.grant(own, tom)).rejects.toBeInstanceOf(ForbiddenError);
    expect(repo.insert).not.toHaveBeenCalled();
  });

  describe('from an automation', () => {
    it('grants with source automation and no actor, under the capacity lock', async () => {
      const { svc, repo, appended } = build(eventRepo(), withEvent({ settings: { capacity: 5 } }));
      await svc.grant(addEmma, SYSTEM);
      expect(repo.lockCapacity).toHaveBeenCalledWith('org-1', 'evn_1');
      expect(repo.insert).toHaveBeenCalledWith('org-1', {
        orgUserId: 'ou_emma',
        contentId: 'evn_1',
        expiresAt: null,
        source: 'automation',
      });
      expect(appended).toEqual([
        expect.objectContaining({ type: 'entitlement.created', metadata: {} }),
      ]);
    });

    it('fails on a draft, an ended or a full event', async () => {
      const draft = build(eventRepo(), withEvent({ status: 'draft' }));
      await expect(draft.svc.grant(addEmma, SYSTEM)).rejects.toMatchObject({
        code: 'not_published',
      });
      const ended = build(eventRepo(), withEvent({ endsAt: new Date(Date.now() - 1) }));
      await expect(ended.svc.grant(addEmma, SYSTEM)).rejects.toMatchObject({ code: 'ended' });
      const full = build(
        eventRepo({ grantedOrgUserIds: vi.fn().mockResolvedValue(['ou_a']) }),
        withEvent({ settings: { capacity: 1 } }),
      );
      await expect(full.svc.grant(addEmma, SYSTEM)).rejects.toMatchObject({ code: 'full' });
      expect(full.repo.insert).not.toHaveBeenCalled();
    });

    it('counts the places when the person holds only an expired grant to a full event', async () => {
      const expired = {
        ...SAMPLE,
        orgUserId: 'ou_emma',
        contentId: 'evn_1',
        expiresAt: new Date(Date.now() - 60_000),
      };
      const { svc, repo } = build(
        eventRepo({
          lockGrant: vi.fn().mockResolvedValue(expired),
          grantedOrgUserIds: vi.fn().mockResolvedValue(['ou_a']),
        }),
        withEvent({ settings: { capacity: 1 } }),
      );
      await expect(svc.grant(addEmma, SYSTEM)).rejects.toMatchObject({ code: 'full' });
      expect(repo.insert).not.toHaveBeenCalled();
    });

    it('grants a revoked grant again when there is a place', async () => {
      const revoked = {
        ...SAMPLE,
        orgUserId: 'ou_emma',
        contentId: 'evn_1',
        status: 'revoked' as const,
      };
      const { svc, repo } = build(
        eventRepo({ lockGrant: vi.fn().mockResolvedValue(revoked) }),
        withEvent({ settings: { capacity: 2 } }),
      );
      await svc.grant(addEmma, SYSTEM);
      expect(repo.insert).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({ orgUserId: 'ou_emma', source: 'automation' }),
      );
    });
  });

  describe('revoke', () => {
    const own = { orgUserId: 'ou_james', contentId: 'evn_1' };
    const emma = { orgUserId: 'ou_emma', contentId: 'evn_1' };

    it("revokes the caller's own grant to an event, as the actor", async () => {
      const repo = eventRepo({ lockGrant: vi.fn().mockResolvedValue({ ...SAMPLE, id: 'e9' }) });
      const { svc, appended } = build(repo);
      await svc.revoke(own, james);
      expect(repo.lockGrant).toHaveBeenCalledWith('org-1', { ...own, bundleId: null });
      expect(repo.setStatus).toHaveBeenCalledWith('org-1', 'e9', 'revoked');
      expect(appended).toEqual([
        expect.objectContaining({ type: 'entitlement.deleted', metadata: { actorId: 'ou_james' } }),
      ]);
    });

    it("revokes someone else's grant to an event with events:write or access:write", async () => {
      for (const actor of [tom, checkout]) {
        const { svc, repo } = build(eventRepo({ lockGrant: vi.fn().mockResolvedValue(SAMPLE) }));
        await svc.revoke(emma, actor);
        expect(repo.setStatus).toHaveBeenCalledWith('org-1', 'e1', 'revoked');
      }
    });

    it("refuses 403 to revoke someone else's grant to an event without either", async () => {
      const { svc, repo } = build(eventRepo({ lockGrant: vi.fn().mockResolvedValue(SAMPLE) }));
      await expect(svc.revoke(emma, james)).rejects.toBeInstanceOf(ForbiddenError);
      expect(repo.lockGrant).not.toHaveBeenCalled();
    });

    it('needs access:write for content that is not an event', async () => {
      const { svc, repo } = build(fakeRepo({ lockGrant: vi.fn().mockResolvedValue(SAMPLE) }));
      const course = { orgUserId: 'ou_james', contentId: 'crs_1' };
      await expect(svc.revoke(course, james)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(svc.revoke(course, tom)).rejects.toBeInstanceOf(ForbiddenError);
      await svc.revoke(course, checkout);
      expect(repo.setStatus).toHaveBeenCalledWith('org-1', 'e1', 'revoked');
    });

    it('answers 404 without a direct active grant', async () => {
      const grants = [
        null,
        { ...SAMPLE, status: 'revoked' as const },
        { ...SAMPLE, expiresAt: new Date('2020-01-01T00:00:00Z') },
      ];
      for (const grant of grants) {
        const { svc, append } = build(eventRepo({ lockGrant: vi.fn().mockResolvedValue(grant) }));
        await expect(svc.revoke(own, james)).rejects.toBeInstanceOf(NotFoundError);
        expect(append).not.toHaveBeenCalled();
      }
    });
  });

  describe('on the event routes', () => {
    it('answers 404 when the id is not an event, before any grant or revoke', async () => {
      const repo = fakeRepo({
        contentTypeOf: vi.fn().mockResolvedValue('course'),
        lockGrant: vi.fn().mockResolvedValue(SAMPLE),
      });
      const { svc, append } = build(repo);
      const course = { orgUserId: 'ou_emma', contentId: 'crs_1', contentType: 'event' as const };
      await expect(svc.grant({ ...course, expiresAt: null }, sarah)).rejects.toBeInstanceOf(
        NotFoundError,
      );
      await expect(svc.revoke(course, sarah)).rejects.toBeInstanceOf(NotFoundError);
      expect(repo.insert).not.toHaveBeenCalled();
      expect(repo.lockGrant).not.toHaveBeenCalled();
      expect(append).not.toHaveBeenCalled();
    });

    it('answers 404 for an id that does not exist', async () => {
      const { svc } = build(fakeRepo({ contentTypeOf: vi.fn().mockResolvedValue(null) }));
      await expect(svc.grant({ ...addEmma, contentType: 'event' }, sarah)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('grants and revokes an event when the type matches', async () => {
      const { svc, repo } = build(
        eventRepo({ lockGrant: vi.fn().mockResolvedValueOnce(null).mockResolvedValue(SAMPLE) }),
        withEvent(),
      );
      await svc.grant({ ...addEmma, contentType: 'event' }, sarah);
      expect(repo.insert).toHaveBeenCalledWith('org-1', {
        orgUserId: 'ou_emma',
        contentId: 'evn_1',
        expiresAt: null,
        source: 'manual',
      });
      await svc.revoke({ orgUserId: 'ou_emma', contentId: 'evn_1', contentType: 'event' }, sarah);
      expect(repo.setStatus).toHaveBeenCalledWith('org-1', 'e1', 'revoked');
    });
  });

  it('records the caller on revoke', async () => {
    const { svc, appended } = build();
    await svc.revoke({ orgUserId: 's1', contentId: 'c1' }, checkout);
    expect(appended).toEqual([
      expect.objectContaining({ type: 'entitlement.deleted', metadata: { actorId: 'ou_key' } }),
    ]);
  });
});
