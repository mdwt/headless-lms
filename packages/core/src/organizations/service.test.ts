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
import { ConflictError, NotFoundError } from '../shared/errors.js';
import { generateInviteToken } from '../shared/invite-token.js';
import type { IdentityService } from '../identity/index.js';
import type { User } from '../identity/model.js';
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
    upsertPendingInvite: vi.fn().mockImplementation((orgId, input) =>
      Promise.resolve(invite({ orgId, ...input })),
    ),
    setInviteStatus: vi.fn().mockImplementation((orgId, id, status) =>
      Promise.resolve(invite({ orgId, id, status })),
    ),
    findInviteByTokenHash: vi.fn().mockResolvedValue(invite()),
    findPendingInvite: vi.fn().mockResolvedValue(invite()),
    setInviteToken: vi.fn().mockImplementation((orgId, id, tokenHash, expiresAt) =>
      Promise.resolve(invite({ orgId, id, tokenHash, expiresAt })),
    ),
    findOrgUser: vi.fn().mockResolvedValue(STUDENT),
    findOrgUsersByUser: vi.fn().mockResolvedValue([]),
    findOrgUserById: vi.fn().mockResolvedValue(STUDENT),
    createOrgUser: vi.fn().mockImplementation((input) =>
      Promise.resolve({ ...STUDENT, ...input }),
    ),
    updateOrgUser: vi.fn().mockImplementation((orgId, id, patch) =>
      Promise.resolve({ ...STUDENT, orgId, id, ...patch }),
    ),
    findStudentOrgUsers: vi.fn().mockResolvedValue([]),
    cancelPendingInvite: vi.fn().mockResolvedValue(null),
    deleteOrgUser: vi.fn().mockImplementation((orgId, id) =>
      Promise.resolve({ ...STUDENT, orgId, id }),
    ),
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
  return { service, repo, people, orgAdmin, send, appended };
}

const CTX: MemberWriteContext = { orgId: 'org_1', authOrgId: 'org_1', headers: {} };

describe('createInvite', () => {
  it('adds a new student as an invited org user and emails the invite', async () => {
    const { service, repo, people, send, appended } = build();

    await service.createInvite({
      orgId: 'org_1',
      email: 'ada@example.com',
      role: 'student',
      inviterUserId: 'usr_owner',
    });

    expect(people.createUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'ada@example.com' }));
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

    await service.createInvite({
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
      service.createInvite({
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

    await service.createInvite({
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
      service.createInvite({
        orgId: 'org_1',
        email: 'ada@example.com',
        role: 'student',
        inviterUserId: 'usr_owner',
      }),
    ).resolves.toMatchObject({ id: 'inv_1' });
  });
});

describe('resendStudentInvite', () => {
  const input = { orgId: 'org_1', orgUserId: 'orm_1', inviterUserId: 'usr_owner' };

  it('sends the existing invite again with a new token', async () => {
    const { service, repo, send } = build();

    await service.resendStudentInvite(input);

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

    await expect(service.resendStudentInvite(input)).rejects.toBeInstanceOf(NotFoundError);
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses a student who already accepted', async () => {
    const repo = fakeRepo({
      findOrgUserById: vi.fn().mockResolvedValue({ ...STUDENT, status: 'active' }),
    });
    const { service } = build({ repo });

    await expect(service.resendStudentInvite(input)).rejects.toBeInstanceOf(OrganizationRuleError);
  });

  it('surfaces a failed email', async () => {
    const send = vi.fn().mockRejectedValue(new Error('not implemented'));
    const { service } = build({ send });

    await expect(service.resendStudentInvite(input)).rejects.toThrow('not implemented');
  });
});

describe('acceptInvite', () => {
  it('activates the student added by an admin', async () => {
    const { token, tokenHash } = generateInviteToken();
    const repo = fakeRepo({
      findInviteByTokenHash: vi.fn().mockResolvedValue(invite({ tokenHash })),
    });
    const { service, orgAdmin, appended } = build({ repo });

    const orgUser = await service.acceptInvite({ token, userId: 'usr_1', email: 'ada@example.com' });

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

    const orgUser = await service.acceptInvite({ token, userId: 'usr_1', email: 'ada@example.com' });

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

    await service.updateMemberRole(CTX, 'orm_staff', 'instructor');

    expect(orgAdmin.updateRole).toHaveBeenCalledWith(CTX, 'usr_staff', 'instructor');
  });

  it('removes a member through Better Auth', async () => {
    const { service, orgAdmin } = build({ members: member() });

    await expect(service.removeMember(CTX, 'orm_staff')).resolves.toBe(true);
    expect(orgAdmin.removeMember).toHaveBeenCalledWith(CTX, 'usr_staff');
  });

  it('cancels a pending staff invite', async () => {
    const { service, repo, orgAdmin, appended } = build({
      members: member({ kind: 'invite', userExternalId: null, inviteId: 'inv_9' }),
    });

    await service.removeMember(CTX, 'inv_9');

    expect(repo.setInviteStatus).toHaveBeenCalledWith('org_1', 'inv_9', 'canceled');
    expect(orgAdmin.removeMember).not.toHaveBeenCalled();
    expect(appended.map((e) => e.type)).toEqual(['organization.invite.canceled']);
  });

  it('refuses to remove the owner', async () => {
    const { service, orgAdmin } = build({ members: member({ role: 'owner' as never }) });

    await expect(service.removeMember(CTX, 'orm_staff')).rejects.toBeInstanceOf(OrganizationRuleError);
    expect(orgAdmin.removeMember).not.toHaveBeenCalled();
  });
});

describe('Better Auth mirror', () => {
  it('removes the org user by the person id', async () => {
    const { service, repo } = build();

    await service.removeOrgUser('org_1', 'usr_1');

    expect(repo.findOrgUser).toHaveBeenCalledWith('org_1', 'usr_1');
    expect(repo.deleteOrgUser).toHaveBeenCalledWith('org_1', 'orm_1');
  });

  it('updates the org user by the person id', async () => {
    const { service, repo } = build();

    await service.updateOrgUser('org_1', 'usr_1', { role: 'instructor' });

    expect(repo.updateOrgUser).toHaveBeenCalledWith('org_1', 'orm_1', { role: 'instructor' });
  });
});
