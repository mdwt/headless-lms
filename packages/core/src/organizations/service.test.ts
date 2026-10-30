import { describe, it, expect, vi } from 'vitest';
import { OrganizationServiceImpl } from './service.js';
import type {
  MemberRecord,
  MembersRepository,
  MemberWriteContext,
  OrgAdmin,
  OrganizationsRepository,
  OrganizationsUnitOfWork,
} from './ports.js';
import type { Invite, Organization, OrgUser } from './model.js';
import { OrganizationRuleError } from './members.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../shared/errors.js';
import type { Actor } from '../shared/actor.js';
import { generateInviteToken } from '../shared/invite-token.js';
import type { IdentityService, User } from '../identity/index.js';
import type { NewDomainEvent } from '../shared/ports.js';

const NOW = new Date('2026-01-01');

const ORG: Organization = {
  id: 'org_1',
  externalId: 'org_1',
  name: 'Acme',
  slug: 'acme',
  ownerId: 'usr_owner',
  createdAt: NOW,
  updatedAt: NOW,
};

const PERSON: User = {
  id: 'usr_1',
  externalId: 'usr_1',
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  createdAt: NOW,
  updatedAt: NOW,
};

const STUDENT: OrgUser = {
  id: 'orm_1',
  orgId: 'org_1',
  userId: 'usr_1',
  role: 'student',
  status: 'invited',
  createdAt: NOW,
  updatedAt: NOW,
};

function invite(over?: Partial<Invite>): Invite {
  return {
    id: 'inv_1',
    orgId: 'org_1',
    email: 'ada@example.com',
    role: 'student',
    status: 'pending',
    invitedBy: 'usr_owner',
    tokenHash: 'old-hash',
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function member(over?: Partial<MemberRecord>): MemberRecord {
  return {
    id: 'orm_staff',
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.com',
    image: null,
    role: 'admin',
    status: 'active',
    joinedAt: null,
    invitedAt: null,
    kind: 'member',
    userExternalId: 'usr_staff',
    inviteId: null,
    ...over,
  } as MemberRecord;
}

function fakeRepo(over?: Partial<OrganizationsRepository>): OrganizationsRepository {
  return {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findById: vi.fn().mockResolvedValue(ORG),
    findByExternalId: vi.fn().mockResolvedValue(ORG),
    findBySlug: vi.fn().mockResolvedValue(ORG),
    upsertPendingInvite: vi
      .fn()
      .mockImplementation((orgId, input) => Promise.resolve(invite({ orgId, ...input }))),
    setInviteStatus: vi
      .fn()
      .mockImplementation((orgId, id, status) => Promise.resolve(invite({ orgId, id, status }))),
    findInviteByTokenHash: vi.fn().mockResolvedValue(invite()),
    findPendingInvite: vi.fn().mockResolvedValue(invite()),
    setInviteToken: vi
      .fn()
      .mockImplementation((orgId, id, tokenHash, expiresAt) =>
        Promise.resolve(invite({ orgId, id, tokenHash, expiresAt })),
      ),
    findOrgUser: vi.fn().mockResolvedValue(STUDENT),
    findOrgUsersByUser: vi.fn().mockResolvedValue([]),
    findOrgUserById: vi.fn().mockResolvedValue(STUDENT),
    findOrgUsersByIds: vi.fn().mockResolvedValue([]),
    findOrgUserIdsByRole: vi.fn().mockResolvedValue([]),
    createOrgUser: vi.fn().mockImplementation((input) => Promise.resolve({ ...STUDENT, ...input })),
    updateOrgUser: vi
      .fn()
      .mockImplementation((orgId, id, patch) =>
        Promise.resolve({ ...STUDENT, orgId, id, ...patch }),
      ),
    findStudentOrgUsers: vi.fn().mockResolvedValue([]),
    cancelPendingInvite: vi.fn().mockResolvedValue(null),
    deleteOrgUser: vi
      .fn()
      .mockImplementation((orgId, id) => Promise.resolve({ ...STUDENT, orgId, id })),
    ...over,
  };
}

function fakeMembers(record: MemberRecord | null): MembersRepository {
  return {
    list: vi.fn(),
    findByEmail: vi.fn().mockResolvedValue(record),
    findById: vi.fn().mockResolvedValue(record),
  };
}

function fakePeople(over?: Partial<IdentityService>): IdentityService {
  return {
    getUserByEmail: vi.fn().mockResolvedValue(null),
    getUserById: vi.fn().mockResolvedValue(PERSON),
    createUser: vi.fn().mockResolvedValue(PERSON),
    updateUser: vi.fn().mockResolvedValue(PERSON),
    ...over,
  } as unknown as IdentityService;
}

function fakeOrgAdmin(): OrgAdmin {
  return {
    createOrganization: vi.fn(),
    setActiveOrganization: vi.fn(),
    updateOrganization: vi.fn(),
    deleteOrganization: vi.fn(),
    grantMembership: vi.fn().mockResolvedValue(undefined),
    updateRole: vi.fn().mockResolvedValue(undefined),
    removeMember: vi.fn().mockResolvedValue(undefined),
  };
}

function build(opts?: {
  repo?: OrganizationsRepository;
  people?: IdentityService;
  members?: MemberRecord | null;
  send?: ReturnType<typeof vi.fn>;
}) {
  const repo = opts?.repo ?? fakeRepo();
  const people = opts?.people ?? fakePeople();
  const membersRepo = fakeMembers(opts?.members ?? null);
  const orgAdmin = fakeOrgAdmin();
  const send = opts?.send ?? vi.fn().mockResolvedValue(undefined);
  const appended: NewDomainEvent[] = [];
  const uow: OrganizationsUnitOfWork = {
    run: (fn) =>
      fn({
        organizations: repo,
        outbox: {
          append: async (events) => {
            appended.push(...events);
          },
        },
      }),
  };
  const service = new OrganizationServiceImpl({
    repo,
    membersRepo,
    people,
    uow,
    orgAdmin: () => orgAdmin,
    mailer: { send },
    inviteUrls: { studentPortalUrl: 'https://learn.test', adminAppUrl: 'https://admin.test' },
  });
  return { service, repo, membersRepo, people, orgAdmin, send, appended };
}

const CTX: MemberWriteContext = { orgId: 'org_1', authOrgId: 'org_1', headers: {} };
const ADMIN: Actor = { id: 'orm_admin', role: 'admin' };
const INSTRUCTOR: Actor = { id: 'orm_instructor', role: 'instructor' };

describe('createInvite', () => {
  it('adds a new student as an invited org user and emails the invite', async () => {
    const { service, repo, people, send, appended } = build();

    await service.createInvite(ADMIN, {
      orgId: 'org_1',
      email: 'ada@example.com',
      role: 'student',
      inviterUserId: 'usr_owner',
    });

    expect(people.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ada@example.com' }),
    );
    expect(repo.createOrgUser).toHaveBeenCalledWith({
      orgId: 'org_1',
      userId: 'usr_1',
      role: 'student',
      status: 'invited',
    });
    expect(appended.map((e) => e.type)).toEqual([
      'organization.student.created',
      'organization.invite.created',
    ]);
    expect(send).toHaveBeenCalledWith('ada@example.com', 'studentInvite', expect.anything());
  });

  it('reuses a person who already exists elsewhere', async () => {
    const people = fakePeople({ getUserByEmail: vi.fn().mockResolvedValue(PERSON) });
    const { service } = build({ people });

    await service.createInvite(ADMIN, {
      orgId: 'org_1',
      email: 'ada@example.com',
      role: 'student',
      inviterUserId: 'usr_owner',
    });

    expect(people.createUser).not.toHaveBeenCalled();
  });

  it('refuses a student who already belongs to the org', async () => {
    const repo = fakeRepo({
      createOrgUser: vi.fn().mockRejectedValue(new ConflictError('taken')),
    });
    const people = fakePeople({ getUserByEmail: vi.fn().mockResolvedValue(PERSON) });
    const { service, send } = build({ repo, people });

    await expect(
      service.createInvite(ADMIN, {
        orgId: 'org_1',
        email: 'ada@example.com',
        role: 'student',
        inviterUserId: 'usr_owner',
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(repo.upsertPendingInvite).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('creates only the invite for staff', async () => {
    const { service, repo, people, appended } = build();

    await service.createInvite(ADMIN, {
      orgId: 'org_1',
      email: 'grace@example.com',
      role: 'admin',
      inviterUserId: 'usr_owner',
    });

    expect(people.createUser).not.toHaveBeenCalled();
    expect(repo.createOrgUser).not.toHaveBeenCalled();
    expect(appended.map((e) => e.type)).toEqual(['organization.invite.created']);
  });

  it('keeps the invite when the email fails', async () => {
    const send = vi.fn().mockRejectedValue(new Error('not implemented'));
    const { service } = build({ send });

    await expect(
      service.createInvite(ADMIN, {
        orgId: 'org_1',
        email: 'ada@example.com',
        role: 'student',
        inviterUserId: 'usr_owner',
      }),
    ).resolves.toMatchObject({ id: 'inv_1' });
  });
});

describe('createInvite authorization', () => {
  it('refuses an actor without manage_users', async () => {
    const { service, repo, people, send } = build();

    await expect(
      service.createInvite(INSTRUCTOR, {
        orgId: 'org_1',
        email: 'ada@example.com',
        role: 'moderator',
        inviterUserId: 'usr_owner',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(people.createUser).not.toHaveBeenCalled();
    expect(repo.upsertPendingInvite).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses a student invite from an actor without manage_users', async () => {
    const { service, repo } = build();

    await expect(
      service.createInvite(INSTRUCTOR, {
        orgId: 'org_1',
        email: 'ada@example.com',
        role: 'student',
        inviterUserId: 'usr_owner',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(repo.createOrgUser).not.toHaveBeenCalled();
  });

  it('never invites an owner', async () => {
    const { service, repo } = build();

    await expect(
      service.createInvite(ADMIN, {
        orgId: 'org_1',
        email: 'grace@example.com',
        role: 'owner' as never,
        inviterUserId: 'usr_owner',
      }),
    ).rejects.toBeInstanceOf(OrganizationRuleError);
    expect(repo.upsertPendingInvite).not.toHaveBeenCalled();
  });
});

describe('updateStudent', () => {
  const input = {
    orgId: 'org_1',
    orgUserId: 'orm_1',
    firstName: 'Ada',
    lastName: 'Byron',
    email: 'ada.byron@example.com',
  };
  const invitedPerson = { ...PERSON, externalId: null };

  it('corrects a student this org added who has no account yet', async () => {
    const { service, people, repo } = build({
      people: fakePeople({ getUserById: vi.fn().mockResolvedValue(invitedPerson) }),
      repo: fakeRepo({ findOrgUsersByUser: vi.fn().mockResolvedValue([STUDENT]) }),
    });
    await service.updateStudent(ADMIN, input);
    expect(people.updateUser).toHaveBeenCalledWith('usr_1', {
      firstName: 'Ada',
      lastName: 'Byron',
      email: 'ada.byron@example.com',
    });
    expect(repo.cancelPendingInvite).toHaveBeenCalledWith('org_1', 'ada@example.com');
  });

  it('refuses a student who has their own account', async () => {
    const { service, people } = build({
      repo: fakeRepo({ findOrgUsersByUser: vi.fn().mockResolvedValue([STUDENT]) }),
    });
    await expect(service.updateStudent(ADMIN, input)).rejects.toBeInstanceOf(ConflictError);
    expect(people.updateUser).not.toHaveBeenCalled();
  });

  it('refuses a person who also belongs to another organization', async () => {
    const { service, people } = build({
      people: fakePeople({ getUserById: vi.fn().mockResolvedValue(invitedPerson) }),
      repo: fakeRepo({
        findOrgUsersByUser: vi
          .fn()
          .mockResolvedValue([STUDENT, { ...STUDENT, id: 'orm_other', orgId: 'org_2' }]),
      }),
    });
    await expect(service.updateStudent(ADMIN, input)).rejects.toBeInstanceOf(ConflictError);
    expect(people.updateUser).not.toHaveBeenCalled();
  });

  it('refuses an email that belongs to someone else', async () => {
    const { service, people } = build({
      people: fakePeople({
        getUserById: vi.fn().mockResolvedValue(invitedPerson),
        getUserByEmail: vi.fn().mockResolvedValue({ ...PERSON, id: 'usr_2' }),
      }),
      repo: fakeRepo({ findOrgUsersByUser: vi.fn().mockResolvedValue([STUDENT]) }),
    });
    await expect(service.updateStudent(ADMIN, input)).rejects.toBeInstanceOf(ConflictError);
    expect(people.updateUser).not.toHaveBeenCalled();
  });

  it('refuses an instructor', async () => {
    const { service, people } = build({
      people: fakePeople({ getUserById: vi.fn().mockResolvedValue(invitedPerson) }),
    });
    await expect(service.updateStudent(INSTRUCTOR, input)).rejects.toBeInstanceOf(ForbiddenError);
    expect(people.updateUser).not.toHaveBeenCalled();
  });
});

describe('resendStudentInvite', () => {
  const input = { orgId: 'org_1', orgUserId: 'orm_1', inviterUserId: 'usr_owner' };

  it('sends the existing invite again with a new token', async () => {
    const { service, repo, send } = build();

    await service.resendStudentInvite(ADMIN, input);

    expect(repo.setInviteToken).toHaveBeenCalledWith(
      'org_1',
      'inv_1',
      expect.not.stringMatching(/^old-hash$/),
      expect.any(Date),
    );
    expect(repo.upsertPendingInvite).not.toHaveBeenCalled();
    expect(repo.createOrgUser).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith('ada@example.com', 'studentInvite', expect.anything());
  });

  it('fails when there is no pending invite', async () => {
    const repo = fakeRepo({ findPendingInvite: vi.fn().mockResolvedValue(null) });
    const { service, send } = build({ repo });

    await expect(service.resendStudentInvite(ADMIN, input)).rejects.toBeInstanceOf(NotFoundError);
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses a student who already accepted', async () => {
    const repo = fakeRepo({
      findOrgUserById: vi.fn().mockResolvedValue({ ...STUDENT, status: 'active' }),
    });
    const { service } = build({ repo });

    await expect(service.resendStudentInvite(ADMIN, input)).rejects.toBeInstanceOf(
      OrganizationRuleError,
    );
  });

  it('surfaces a failed email', async () => {
    const send = vi.fn().mockRejectedValue(new Error('not implemented'));
    const { service } = build({ send });

    await expect(service.resendStudentInvite(ADMIN, input)).rejects.toThrow('not implemented');
  });

  it('refuses an actor without manage_users', async () => {
    const { service, repo, send } = build();

    await expect(service.resendStudentInvite(INSTRUCTOR, input)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(repo.setInviteToken).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});

describe('deleteOrgUser', () => {
  it('deletes a student and emits student deleted', async () => {
    const { service, repo, appended } = build();

    await service.deleteOrgUser('org_1', ADMIN, 'orm_1');

    expect(repo.deleteOrgUser).toHaveBeenCalledWith('org_1', 'orm_1');
    expect(appended.map((e) => e.type)).toEqual(['organization.student.deleted']);
  });

  it('refuses an actor without manage_users', async () => {
    const { service, repo } = build();

    await expect(service.deleteOrgUser('org_1', INSTRUCTOR, 'orm_1')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(repo.deleteOrgUser).not.toHaveBeenCalled();
  });

  it.each(['admin', 'instructor', 'moderator'] as const)(
    'refuses to delete a %s, who is removed as a member instead',
    async (role) => {
      const repo = fakeRepo({
        findOrgUserById: vi.fn().mockResolvedValue({ ...STUDENT, role, status: 'active' }),
      });
      const { service, appended } = build({ repo });

      await expect(service.deleteOrgUser('org_1', ADMIN, 'orm_1')).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(repo.deleteOrgUser).not.toHaveBeenCalled();
      expect(appended).toEqual([]);
    },
  );

  it('passes on the conflict when the student cannot be deleted', async () => {
    const repo = fakeRepo({
      deleteOrgUser: vi.fn().mockRejectedValue(new ConflictError('cannot be deleted')),
    });
    const { service, appended } = build({ repo });

    await expect(service.deleteOrgUser('org_1', ADMIN, 'orm_1')).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(appended).toEqual([]);
  });
});

describe('acceptInvite', () => {
  it('activates the student added by an admin', async () => {
    const { token, tokenHash } = generateInviteToken();
    const repo = fakeRepo({
      findInviteByTokenHash: vi.fn().mockResolvedValue(invite({ tokenHash })),
    });
    const { service, orgAdmin, appended } = build({ repo });

    const orgUser = await service.acceptInvite({
      token,
      userId: 'usr_1',
      email: 'ada@example.com',
    });

    expect(repo.updateOrgUser).toHaveBeenCalledWith('org_1', 'orm_1', { status: 'active' });
    expect(repo.createOrgUser).not.toHaveBeenCalled();
    expect(orgAdmin.grantMembership).not.toHaveBeenCalled();
    expect(orgUser.status).toBe('active');
    expect(appended.map((e) => e.type)).toEqual([
      'organization.invite.accepted',
      'organization.student.linked',
    ]);
  });

  it('fails when the student org user is gone', async () => {
    const { token, tokenHash } = generateInviteToken();
    const repo = fakeRepo({
      findInviteByTokenHash: vi.fn().mockResolvedValue(invite({ tokenHash })),
      findOrgUser: vi.fn().mockResolvedValue(null),
    });
    const { service } = build({ repo });

    await expect(
      service.acceptInvite({ token, userId: 'usr_1', email: 'ada@example.com' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.setInviteStatus).not.toHaveBeenCalled();
  });

  it('grants staff a Better Auth membership instead of writing the org user', async () => {
    const { token, tokenHash } = generateInviteToken();
    const staff: OrgUser = { ...STUDENT, id: 'orm_staff', role: 'admin', status: 'active' };
    const repo = fakeRepo({
      findInviteByTokenHash: vi.fn().mockResolvedValue(invite({ tokenHash, role: 'admin' })),
      findOrgUser: vi.fn().mockResolvedValue(staff),
    });
    const { service, orgAdmin, appended } = build({ repo });

    const orgUser = await service.acceptInvite({
      token,
      userId: 'usr_1',
      email: 'ada@example.com',
    });

    expect(orgAdmin.grantMembership).toHaveBeenCalledWith('org_1', 'usr_1', 'admin');
    expect(repo.createOrgUser).not.toHaveBeenCalled();
    expect(repo.updateOrgUser).not.toHaveBeenCalled();
    expect(orgUser).toBe(staff);
    expect(appended.map((e) => e.type)).toEqual(['organization.invite.accepted']);
  });
});

describe('member writes', () => {
  it('changes a role through Better Auth', async () => {
    const { service, orgAdmin } = build({ members: member() });

    await service.updateMemberRole(CTX, ADMIN, 'orm_staff', 'instructor');

    expect(orgAdmin.updateRole).toHaveBeenCalledWith(CTX, 'usr_staff', 'instructor');
    expect(orgAdmin.grantMembership).not.toHaveBeenCalled();
  });

  it('creates a membership when a student is given a role', async () => {
    const { service, orgAdmin, repo, membersRepo } = build();
    const mirrored = member({ id: 'orm_1', role: 'moderator', email: 'ada@example.com' });
    vi.mocked(orgAdmin.grantMembership).mockImplementation(async () => {
      vi.mocked(membersRepo.findById).mockResolvedValue(mirrored);
    });

    const promoted = await service.updateMemberRole(CTX, ADMIN, 'orm_1', 'moderator');

    expect(orgAdmin.grantMembership).toHaveBeenCalledWith('org_1', 'usr_1', 'moderator');
    expect(orgAdmin.updateRole).not.toHaveBeenCalled();
    expect(repo.findOrgUserById).toHaveBeenCalledWith('org_1', 'orm_1');
    expect(promoted).toMatchObject({
      id: 'orm_1',
      role: 'moderator',
      status: 'active',
      email: 'ada@example.com',
    });
  });

  it('changes the role of a membership that exists while the mirror says student', async () => {
    const { service, orgAdmin, membersRepo, appended } = build();
    const mirrored = member({ id: 'orm_1', role: 'moderator', email: 'ada@example.com' });
    vi.mocked(orgAdmin.updateRole).mockImplementation(async (_ctx, _user, role) => {
      await service.updateOrgUser('org_1', 'usr_1', { role });
      vi.mocked(membersRepo.findById).mockResolvedValue(mirrored);
    });

    const promoted = await service.updateMemberRole(CTX, ADMIN, 'orm_1', 'moderator');

    expect(orgAdmin.grantMembership).toHaveBeenCalledWith('org_1', 'usr_1', 'moderator');
    expect(orgAdmin.updateRole).toHaveBeenCalledWith(CTX, 'usr_1', 'moderator');
    expect(promoted).toMatchObject({ id: 'orm_1', role: 'moderator' });
    expect(appended).toEqual([
      expect.objectContaining({
        type: 'organization.user.updated',
        metadata: { actorOrgUserId: 'orm_admin' },
      }),
    ]);
  });

  it('refuses instead of answering when the mirror never takes the role', async () => {
    const { service } = build();

    await expect(service.updateMemberRole(CTX, ADMIN, 'orm_1', 'moderator')).rejects.toBeInstanceOf(
      OrganizationRuleError,
    );
  });

  it('refuses to promote a student who has not joined', async () => {
    const people = fakePeople({
      getUserById: vi.fn().mockResolvedValue({ ...PERSON, externalId: null }),
    });
    const { service, orgAdmin } = build({ people });

    await expect(service.updateMemberRole(CTX, ADMIN, 'orm_1', 'moderator')).rejects.toBeInstanceOf(
      OrganizationRuleError,
    );
    expect(orgAdmin.grantMembership).not.toHaveBeenCalled();
  });

  it('refuses a role change by an actor without manage_users', async () => {
    const { service, orgAdmin } = build({ members: member({ role: 'instructor' }) });

    await expect(
      service.updateMemberRole(CTX, INSTRUCTOR, 'orm_staff', 'admin'),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(orgAdmin.updateRole).not.toHaveBeenCalled();
  });

  it('refuses to promote a student for an actor without manage_users', async () => {
    const { service, orgAdmin } = build();

    await expect(
      service.updateMemberRole(CTX, INSTRUCTOR, 'orm_1', 'owner'),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      service.updateMemberRole(CTX, INSTRUCTOR, 'orm_1', 'moderator'),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(orgAdmin.grantMembership).not.toHaveBeenCalled();
  });

  it('never grants owner through a role change', async () => {
    const { service, orgAdmin } = build({ members: member() });

    await expect(service.updateMemberRole(CTX, ADMIN, 'orm_staff', 'owner')).rejects.toBeInstanceOf(
      OrganizationRuleError,
    );
    expect(orgAdmin.updateRole).not.toHaveBeenCalled();
  });

  it('never makes a student the owner', async () => {
    const { service, orgAdmin } = build();

    await expect(service.updateMemberRole(CTX, ADMIN, 'orm_1', 'owner')).rejects.toBeInstanceOf(
      OrganizationRuleError,
    );
    expect(orgAdmin.grantMembership).not.toHaveBeenCalled();
  });

  it('makes a moderator a student with one Better Auth call', async () => {
    const repo = fakeRepo({
      findOrgUserById: vi.fn().mockResolvedValue({ ...STUDENT, id: 'orm_staff', status: 'active' }),
    });
    const { service, orgAdmin } = build({ repo, members: member({ role: 'moderator' }) });

    const demoted = await service.updateMemberRole(CTX, ADMIN, 'orm_staff', 'student');

    expect(orgAdmin.updateRole).not.toHaveBeenCalled();
    expect(orgAdmin.removeMember).toHaveBeenCalledTimes(1);
    expect(orgAdmin.removeMember).toHaveBeenCalledWith(CTX, 'usr_staff');
    expect(demoted).toMatchObject({ id: 'orm_staff', role: 'student', status: 'active' });
  });

  it('keeps the org user as a student when the mirror removes a demoted moderator', async () => {
    const moderator: OrgUser = { ...STUDENT, id: 'orm_staff', role: 'moderator', status: 'active' };
    const repo = fakeRepo({
      findOrgUser: vi.fn().mockResolvedValue(moderator),
      findOrgUserById: vi.fn().mockResolvedValue({ ...moderator, role: 'student' }),
    });
    const { service, orgAdmin, appended } = build({ repo, members: member({ role: 'moderator' }) });
    vi.mocked(orgAdmin.removeMember).mockImplementation(async () => {
      await service.removeOrgUser('org_1', 'usr_1');
    });

    await service.updateMemberRole(CTX, ADMIN, 'orm_staff', 'student');

    expect(repo.deleteOrgUser).not.toHaveBeenCalled();
    expect(repo.updateOrgUser).toHaveBeenCalledWith('org_1', 'orm_staff', { role: 'student' });
    expect(appended).toEqual([
      expect.objectContaining({
        type: 'organization.user.updated',
        data: expect.objectContaining({ id: 'orm_staff', role: 'student' }),
        metadata: { actorOrgUserId: 'orm_admin' },
      }),
    ]);
  });

  it('deletes the org user when a member is removed outside a demotion', async () => {
    const moderator: OrgUser = { ...STUDENT, id: 'orm_staff', role: 'moderator', status: 'active' };
    const repo = fakeRepo({ findOrgUser: vi.fn().mockResolvedValue(moderator) });
    const { service, orgAdmin, appended } = build({ repo, members: member({ role: 'moderator' }) });
    vi.mocked(orgAdmin.removeMember).mockImplementation(async () => {
      await service.removeOrgUser('org_1', 'usr_1');
    });

    await service.removeMember(CTX, ADMIN, 'orm_staff');

    expect(repo.deleteOrgUser).toHaveBeenCalledWith('org_1', 'orm_staff');
    expect(repo.updateOrgUser).not.toHaveBeenCalled();
    expect(appended.map((e) => e.type)).toEqual(['organization.user.deleted']);
  });

  it('refuses to make staff a student', async () => {
    const { service, orgAdmin } = build({ members: member({ role: 'instructor' }) });

    await expect(
      service.updateMemberRole(CTX, ADMIN, 'orm_staff', 'student'),
    ).rejects.toBeInstanceOf(OrganizationRuleError);
    expect(orgAdmin.updateRole).not.toHaveBeenCalled();
    expect(orgAdmin.removeMember).not.toHaveBeenCalled();
  });

  it('records the actor on the role change the mirror emits', async () => {
    const moderator: OrgUser = { ...STUDENT, id: 'orm_staff', role: 'moderator', status: 'active' };
    const repo = fakeRepo({ findOrgUser: vi.fn().mockResolvedValue(moderator) });
    const { service, orgAdmin, appended } = build({
      repo,
      members: member({ role: 'moderator' }),
    });
    vi.mocked(orgAdmin.updateRole).mockImplementation(async (_ctx, _user, role) => {
      await service.updateOrgUser('org_1', 'usr_staff', { role });
    });

    await service.updateMemberRole(CTX, ADMIN, 'orm_staff', 'instructor');

    expect(appended).toEqual([
      expect.objectContaining({
        type: 'organization.user.updated',
        metadata: { actorOrgUserId: 'orm_admin' },
      }),
    ]);
  });

  it('records the actor when a student is given the moderator role', async () => {
    const { service, orgAdmin, membersRepo, appended } = build();
    vi.mocked(orgAdmin.grantMembership).mockImplementation(async () => {
      await service.addOrgUser({ orgId: 'org_1', userId: 'usr_1', role: 'moderator' });
      vi.mocked(membersRepo.findById).mockResolvedValue(member({ id: 'orm_1', role: 'moderator' }));
    });

    await service.updateMemberRole(CTX, ADMIN, 'orm_1', 'moderator');

    expect(appended).toEqual([
      expect.objectContaining({
        type: 'organization.user.updated',
        metadata: { actorOrgUserId: 'orm_admin' },
      }),
    ]);
  });

  it('attributes overlapping role changes of one org user to their own actors', async () => {
    const moderator: OrgUser = { ...STUDENT, id: 'orm_staff', role: 'moderator', status: 'active' };
    const repo = fakeRepo({ findOrgUser: vi.fn().mockResolvedValue(moderator) });
    const { service, orgAdmin, appended } = build({
      repo,
      members: member({ role: 'moderator' }),
    });
    const OWNER: Actor = { id: 'orm_owner', role: 'owner' };
    let releaseFirst!: () => void;
    const firstHeld = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let calls = 0;
    vi.mocked(orgAdmin.updateRole).mockImplementation(async (_ctx, _user, role) => {
      calls += 1;
      if (calls === 1) {
        await firstHeld;
      }
      await service.updateOrgUser('org_1', 'usr_staff', { role });
    });

    const first = service.updateMemberRole(CTX, ADMIN, 'orm_staff', 'instructor');
    await vi.waitFor(() => expect(calls).toBe(1));
    await service.updateMemberRole(CTX, OWNER, 'orm_staff', 'admin');
    releaseFirst();
    await first;

    expect(appended.map((e) => [(e.data as OrgUser).role, e.metadata])).toEqual([
      ['admin', { actorOrgUserId: 'orm_owner' }],
      ['instructor', { actorOrgUserId: 'orm_admin' }],
    ]);
  });

  it('records no actor on a mirror write for another org user inside a role change', async () => {
    const other: OrgUser = { ...STUDENT, id: 'orm_other', role: 'moderator', status: 'active' };
    const repo = fakeRepo({ findOrgUser: vi.fn().mockResolvedValue(other) });
    const { service, orgAdmin, appended } = build({
      repo,
      members: member({ role: 'moderator' }),
    });
    vi.mocked(orgAdmin.updateRole).mockImplementation(async () => {
      await service.updateOrgUser('org_1', 'usr_other', { role: 'instructor' });
    });

    await service.updateMemberRole(CTX, ADMIN, 'orm_staff', 'instructor');

    expect(appended).toHaveLength(1);
    expect(appended[0]).not.toHaveProperty('metadata');
  });

  it('records no actor on a role change Better Auth made on its own', async () => {
    const repo = fakeRepo({
      findOrgUser: vi.fn().mockResolvedValue({ ...STUDENT, role: 'moderator' }),
    });
    const { service, appended } = build({ repo });

    await service.updateOrgUser('org_1', 'usr_1', { role: 'instructor' });

    expect(appended).toHaveLength(1);
    expect(appended[0]).not.toHaveProperty('metadata');
  });

  it('updates the existing org user when a membership is created for them', async () => {
    const { service, repo, appended } = build();

    await service.addOrgUser({ orgId: 'org_1', userId: 'usr_1', role: 'moderator' });

    expect(repo.createOrgUser).not.toHaveBeenCalled();
    expect(repo.updateOrgUser).toHaveBeenCalledWith('org_1', 'orm_1', {
      role: 'moderator',
      status: 'active',
    });
    expect(appended.map((event) => event.type)).toEqual(['organization.user.updated']);
  });

  it('removes a member through Better Auth', async () => {
    const { service, orgAdmin } = build({ members: member() });

    await expect(service.removeMember(CTX, ADMIN, 'orm_staff')).resolves.toBe(true);
    expect(orgAdmin.removeMember).toHaveBeenCalledWith(CTX, 'usr_staff');
  });

  it('cancels a pending staff invite', async () => {
    const { service, repo, orgAdmin, appended } = build({
      members: member({ kind: 'invite', userExternalId: null, inviteId: 'inv_9' }),
    });

    await service.removeMember(CTX, ADMIN, 'inv_9');

    expect(repo.setInviteStatus).toHaveBeenCalledWith('org_1', 'inv_9', 'canceled');
    expect(orgAdmin.removeMember).not.toHaveBeenCalled();
    expect(appended.map((e) => e.type)).toEqual(['organization.invite.canceled']);
  });

  it('refuses a removal by an actor without manage_users', async () => {
    const { service, orgAdmin, repo } = build({
      members: member({ kind: 'invite', userExternalId: null, inviteId: 'inv_9' }),
    });

    await expect(service.removeMember(CTX, INSTRUCTOR, 'orm_staff')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(orgAdmin.removeMember).not.toHaveBeenCalled();
    expect(repo.setInviteStatus).not.toHaveBeenCalled();
  });

  it('refuses to remove the owner', async () => {
    const { service, orgAdmin } = build({ members: member({ role: 'owner' as never }) });

    await expect(service.removeMember(CTX, ADMIN, 'orm_staff')).rejects.toBeInstanceOf(
      OrganizationRuleError,
    );
    expect(orgAdmin.removeMember).not.toHaveBeenCalled();
  });
});

describe('Better Auth mirror', () => {
  it('removes the org user by the person id', async () => {
    const repo = fakeRepo({
      findOrgUser: vi.fn().mockResolvedValue({ ...STUDENT, role: 'moderator', status: 'active' }),
    });
    const { service } = build({ repo });

    await service.removeOrgUser('org_1', 'usr_1');

    expect(repo.findOrgUser).toHaveBeenCalledWith('org_1', 'usr_1');
    expect(repo.deleteOrgUser).toHaveBeenCalledWith('org_1', 'orm_1');
  });

  it('keeps a student org user when their membership is removed', async () => {
    const repo = fakeRepo({
      findOrgUser: vi.fn().mockResolvedValue({ ...STUDENT, status: 'active' }),
    });
    const { service, appended } = build({ repo });

    const kept = await service.removeOrgUser('org_1', 'usr_1');

    expect(repo.deleteOrgUser).not.toHaveBeenCalled();
    expect(kept.role).toBe('student');
    expect(appended).toEqual([]);
  });

  it('updates the org user by the person id', async () => {
    const { service, repo } = build();

    await service.updateOrgUser('org_1', 'usr_1', { role: 'instructor' });

    expect(repo.updateOrgUser).toHaveBeenCalledWith('org_1', 'orm_1', { role: 'instructor' });
  });
});
