import { describe, it, expect } from 'vitest';
import { OrganizationServiceImpl } from './service.js';
import type {
  OrganizationsRepository,
  MembersRepository,
  MemberRecord,
  OrgAdmin,
  StudentLinker,
} from './ports.js';
import type { Organization, Membership, Invitation } from './model.js';
import { type Role, normalizeRole } from './roles.js';
import { OrganizationRuleError } from './members.js';
import type {
  CreateOrganizationInput,
  AddMembershipInput,
  RecordInvitationInput,
} from './types.js';

// Member-management stubs for tests that only exercise the provisioning/course
// surface. Member-op tests below build their own configurable stubs.
const stubMembersRepo: MembersRepository = {
  async list() {
    return { rows: [], total: 0, page: 1, pageSize: 20 };
  },
  async findByEmail() {
    return null;
  },
  async findById() {
    return null;
  },
};
const stubStudentLinker = (): StudentLinker => ({
  async recordStudentInvite() {},
  async linkStudentByInvite() {},
  async studentOrgExternalId() {
    return null;
  },
});
const stubOrgAdmin = (): OrgAdmin => ({
  async createOrganization() {
    return { externalId: 'org_stub' };
  },
  async setActiveOrganization() {},
  async updateOrganization() {},
  async invite() {},
  async inviteStudent() {},
  async grantMembership() {},
  async updateRole() {},
  async removeMember() {},
});

function fakeRepo() {
  const orgs: Organization[] = [];
  const members: Membership[] = [];
  const invitations: Invitation[] = [];
  const assignments: {
    id: string;
    orgId: string;
    membershipId: string;
    courseId: string;
    createdAt: Date;
  }[] = [];
  let n = 0;
  const repo: OrganizationsRepository = {
    async create(input: CreateOrganizationInput) {
      const row: Organization = { id: `o${++n}`, createdAt: new Date(0), ...input };
      orgs.push(row);
      return row;
    },
    async updateByExternalId(externalId, input) {
      const i = orgs.findIndex((o) => o.externalId === externalId);
      if (i < 0) {
        return null;
      }
      const updated: Organization = { ...orgs[i]!, name: input.name, slug: input.slug };
      orgs[i] = updated;
      return updated;
    },
    async findBySlug(slug: string) {
      return orgs.find((o) => o.slug === slug) ?? null;
    },
    async findByExternalId(externalId: string) {
      return orgs.find((o) => o.externalId === externalId) ?? null;
    },
    async insertMembership(orgId: string, input: AddMembershipInput) {
      const row: Membership = {
        id: `m${++n}`,
        orgId,
        userId: input.userId,
        role: normalizeRole(input.role),
        externalId: input.externalId,
        createdAt: new Date(0),
      };
      members.push(row);
      return row;
    },
    async deleteMembershipByExternalId(externalId: string) {
      const i = members.findIndex((m) => m.externalId === externalId);
      if (i >= 0) {
        members.splice(i, 1);
      }
    },
    async insertInvitation(orgId: string, input: RecordInvitationInput) {
      const row: Invitation = {
        id: `i${++n}`,
        orgId,
        email: input.email,
        role: input.role as Role,
        status: input.status,
        invetedBy: input.inviterUserId,
        externalId: input.externalId,
        expiresAt: input.expiresAt,
        createdAt: new Date(0),
      };
      invitations.push(row);
      return row;
    },
    async setInvitationStatusByExternalId(externalId: string, status: string) {
      const inv = invitations.find((x) => x.externalId === externalId);
      if (inv) {
        (inv as { status: string }).status = status;
      }
    },
    async findInvitationByExternalId(externalId: string) {
      const inv = invitations.find((x) => x.externalId === externalId);
      if (!inv) {
        return null;
      }
      const org = orgs.find((o) => o.id === inv.orgId);
      if (!org) {
        return null;
      }
      return { orgExternalId: org.externalId, role: inv.role, status: inv.status };
    },
    async insertCourseAssignment(orgId, input) {
      const row = {
        id: `a${++n}`,
        orgId,
        membershipId: input.membershipId,
        courseId: input.courseId,
        createdAt: new Date(0),
      };
      assignments.push(row);
      return row;
    },
    async deleteCourseAssignment(orgId, membershipId, courseId) {
      const i = assignments.findIndex(
        (x) => x.orgId === orgId && x.membershipId === membershipId && x.courseId === courseId,
      );
      if (i >= 0) {
        assignments.splice(i, 1);
      }
    },
    async findAssignedCourseIds(orgId, membershipId) {
      return assignments
        .filter((x) => x.orgId === orgId && x.membershipId === membershipId)
        .map((x) => x.courseId);
    },
    async findMembershipByUser(userId: string) {
      return members.find((m) => m.userId === userId) ?? null;
    },
  };
  return { repo, orgs, members, invitations };
}

const orgInput: CreateOrganizationInput = {
  externalId: 'org_1',
  name: 'Acme',
  slug: 'acme',
  ownerId: 's1',
};

describe('OrganizationService', () => {
  it('provisions an org and is idempotent on the auth org id', async () => {
    const { repo, orgs } = fakeRepo();
    const svc = new OrganizationServiceImpl(repo, stubMembersRepo, stubOrgAdmin, stubStudentLinker());
    const first = await svc.createOrg(orgInput);
    const second = await svc.createOrg(orgInput);
    expect(second.id).toBe(first.id);
    expect(orgs).toHaveLength(1);
  });

  it('resolves the org by auth id when mirroring a membership', async () => {
    const { repo, members } = fakeRepo();
    const svc = new OrganizationServiceImpl(repo, stubMembersRepo, stubOrgAdmin, stubStudentLinker());
    const org = await svc.createOrg(orgInput);
    const m = await svc.addMembership({
      orgExternalId: 'org_1',
      externalId: 'mem_1',
      userId: 's2',
      role: 'member',
    });
    expect(m.orgId).toBe(org.id);
    expect(members).toHaveLength(1);
  });

  it('throws when mirroring against an unknown org', async () => {
    const { repo } = fakeRepo();
    const svc = new OrganizationServiceImpl(repo, stubMembersRepo, stubOrgAdmin, stubStudentLinker());
    await expect(
      svc.addMembership({
        orgExternalId: 'missing',
        externalId: 'mem_1',
        userId: 's2',
        role: 'member',
      }),
    ).rejects.toThrow(/unknown organization/);
  });

  it('stores the membership role as a domain Role', async () => {
    const { repo } = fakeRepo();
    const svc = new OrganizationServiceImpl(repo, stubMembersRepo, stubOrgAdmin, stubStudentLinker());
    await svc.createOrg(orgInput);
    const m = await svc.addMembership({
      orgExternalId: 'org_1',
      externalId: 'mem_1',
      userId: 's2',
      role: 'instructor',
    });
    expect(m.role).toBe('instructor');
  });

  it('assigns and lists instructor course assignments', async () => {
    const { repo } = fakeRepo();
    const svc = new OrganizationServiceImpl(repo, stubMembersRepo, stubOrgAdmin, stubStudentLinker());
    const org = await svc.createOrg(orgInput);
    const a = await svc.assignCourse({
      orgExternalId: 'org_1',
      membershipId: 'm1',
      courseId: 'c1',
    });
    expect(a.orgId).toBe(org.id);
    expect(a.courseId).toBe('c1');
    expect(await svc.assignedCourseIds(org.id, 'm1')).toEqual(['c1']);
  });

  it('unassigns a course', async () => {
    const { repo } = fakeRepo();
    const svc = new OrganizationServiceImpl(repo, stubMembersRepo, stubOrgAdmin, stubStudentLinker());
    const org = await svc.createOrg(orgInput);
    await svc.assignCourse({ orgExternalId: 'org_1', membershipId: 'm1', courseId: 'c1' });
    await svc.unassignCourse({ orgExternalId: 'org_1', membershipId: 'm1', courseId: 'c1' });
    expect(await svc.assignedCourseIds(org.id, 'm1')).toEqual([]);
  });

  it("normalizes Better Auth's member role to instructor on mirror", async () => {
    const { repo } = fakeRepo();
    const svc = new OrganizationServiceImpl(repo, stubMembersRepo, stubOrgAdmin, stubStudentLinker());
    await svc.createOrg(orgInput);
    const m = await svc.addMembership({
      orgExternalId: 'org_1',
      externalId: 'mem_x',
      userId: 's3',
      role: 'member',
    });
    expect(m.role).toBe('instructor');
  });

  it('collapses a multi-role mirror to the highest-privilege role', async () => {
    const { repo } = fakeRepo();
    const svc = new OrganizationServiceImpl(repo, stubMembersRepo, stubOrgAdmin, stubStudentLinker());
    await svc.createOrg(orgInput);
    const m = await svc.addMembership({
      orgExternalId: 'org_1',
      externalId: 'mem_y',
      userId: 's4',
      role: 'admin,instructor',
    });
    expect(m.role).toBe('admin');
  });

  it('getMembershipByUser returns the membership for a known user', async () => {
    const { repo } = fakeRepo();
    const svc = new OrganizationServiceImpl(repo, stubMembersRepo, stubOrgAdmin, stubStudentLinker());
    const org = await svc.createOrg(orgInput);
    await svc.addMembership({
      orgExternalId: 'org_1',
      externalId: 'mem_1',
      userId: 's2',
      role: 'instructor',
    });
    const m = await svc.getMembershipByUser('s2');
    expect(m).not.toBeNull();
    expect(m!.orgId).toBe(org.id);
    expect(m!.role).toBe('instructor');
  });

  it('getMembershipByUser returns null for an unknown user', async () => {
    const { repo } = fakeRepo();
    const svc = new OrganizationServiceImpl(repo, stubMembersRepo, stubOrgAdmin, stubStudentLinker());
    await svc.createOrg(orgInput);
    const m = await svc.getMembershipByUser('no-such-user');
    expect(m).toBeNull();
  });

  it('acceptInvite grants the recorded membership for a pending staff invitation', async () => {
    const { repo, invitations } = fakeRepo();
    const grants: Array<{ org: string; user: string; role: string }> = [];
    const orgAdmin: OrgAdmin = {
      ...stubOrgAdmin(),
      async grantMembership(orgExternalId, userExternalId, role) {
        grants.push({ org: orgExternalId, user: userExternalId, role });
      },
    };
    const svc = new OrganizationServiceImpl(repo, stubMembersRepo, () => orgAdmin, stubStudentLinker());
    await svc.createOrg(orgInput);
    await svc.recordInvitation({
      orgExternalId: 'org_1',
      externalId: 'inv_1',
      email: 'sam@example.com',
      role: 'instructor',
      status: 'pending',
      inviterUserId: 'user_1',
      expiresAt: null,
    });
    const result = await svc.acceptInvite({
      inviteExternalId: 'inv_1',
      role: 'instructor',
      email: 'sam@example.com',
      userExternalId: 'usr_ext_1',
    });
    expect(grants).toEqual([{ org: 'org_1', user: 'usr_ext_1', role: 'instructor' }]);
    expect(result.orgExternalId).toBe('org_1');
    expect(invitations[0]?.status).toBe('accepted');
  });

  it('acceptInvite refuses a canceled staff invitation — no grant', async () => {
    const { repo, invitations } = fakeRepo();
    const grants: string[] = [];
    const orgAdmin: OrgAdmin = {
      ...stubOrgAdmin(),
      async grantMembership(orgExternalId) {
        grants.push(orgExternalId);
      },
    };
    const svc = new OrganizationServiceImpl(repo, stubMembersRepo, () => orgAdmin, stubStudentLinker());
    await svc.createOrg(orgInput);
    await svc.recordInvitation({
      orgExternalId: 'org_1',
      externalId: 'inv_1',
      email: 'sam@example.com',
      role: 'instructor',
      status: 'pending',
      inviterUserId: 'user_1',
      expiresAt: null,
    });
    await repo.setInvitationStatusByExternalId('inv_1', 'canceled');
    const result = await svc.acceptInvite({
      inviteExternalId: 'inv_1',
      role: 'instructor',
      email: 'sam@example.com',
      userExternalId: 'usr_ext_1',
    });
    expect(grants).toEqual([]);
    expect(result.orgExternalId).toBeNull();
    expect(invitations[0]?.status).toBe('canceled');
  });

  it('acceptInvite links student rows through the identity slice and returns their org', async () => {
    const { repo } = fakeRepo();
    const links: Array<{ invite: string; email: string; user: string }> = [];
    const linker: StudentLinker = {
      async recordStudentInvite() {},
      async linkStudentByInvite(inviteExternalId, email, externalId) {
        links.push({ invite: inviteExternalId, email, user: externalId });
      },
      async studentOrgExternalId() {
        return 'org_1';
      },
    };
    const svc = new OrganizationServiceImpl(repo, stubMembersRepo, stubOrgAdmin, linker);
    await svc.createOrg(orgInput);
    const result = await svc.acceptInvite({
      inviteExternalId: 'inv_s1',
      role: 'student',
      email: 'jane@example.com',
      userExternalId: 'usr_ext_9',
    });
    expect(links).toEqual([{ invite: 'inv_s1', email: 'jane@example.com', user: 'usr_ext_9' }]);
    expect(result.orgExternalId).toBe('org_1');
  });

  it('recordStudentInvite resolves the org and records on the student row', async () => {
    const { repo } = fakeRepo();
    const recorded: Array<{ orgId: string; email: string; invite: string }> = [];
    const linker: StudentLinker = {
      ...stubStudentLinker(),
      async recordStudentInvite(orgId, email, inviteExternalId) {
        recorded.push({ orgId, email, invite: inviteExternalId });
      },
    };
    const svc = new OrganizationServiceImpl(repo, stubMembersRepo, stubOrgAdmin, linker);
    const org = await svc.createOrg(orgInput);
    await svc.recordStudentInvite('org_1', 'jane@example.com', 'inv_s1');
    expect(recorded).toEqual([{ orgId: org.id, email: 'jane@example.com', invite: 'inv_s1' }]);
  });

  it('inviteStudent drives the invite provider with the student email', async () => {
    const { repo } = fakeRepo();
    const invites: string[] = [];
    const orgAdmin: OrgAdmin = {
      ...stubOrgAdmin(),
      async inviteStudent(_ctx, email) {
        invites.push(email);
      },
    };
    const svc = new OrganizationServiceImpl(repo, stubMembersRepo, () => orgAdmin, stubStudentLinker());
    await svc.inviteStudent(
      { orgId: 'org1', authOrgId: 'ext_org1', headers: {} },
      'jane@example.com',
    );
    expect(invites).toEqual(['jane@example.com']);
  });

  it('acceptInvite of an unknown invitation grants nothing', async () => {
    const { repo } = fakeRepo();
    const svc = new OrganizationServiceImpl(repo, stubMembersRepo, stubOrgAdmin, stubStudentLinker());
    const result = await svc.acceptInvite({
      inviteExternalId: 'nope',
      role: 'instructor',
      email: 'x@example.com',
      userExternalId: 'usr_x',
    });
    expect(result.orgExternalId).toBeNull();
  });

  it('creates an org via OrgAdmin, sets it active, then returns the mirrored org', async () => {
    const { repo } = fakeRepo();
    const calls: string[] = [];
    const orgAdmin: OrgAdmin = {
      ...stubOrgAdmin(),
      async createOrganization(_headers, input) {
        calls.push('create');
        // Simulate Better Auth's afterCreateOrganization mirroring the org.
        await repo.create({
          externalId: 'org_new',
          name: input.name,
          slug: input.slug,
          ownerId: 's1',
        });
        return { externalId: 'org_new' };
      },
      async setActiveOrganization(_headers, externalId) {
        calls.push(`setActive:${externalId}`);
      },
    };
    const svc = new OrganizationServiceImpl(repo, stubMembersRepo, () => orgAdmin, stubStudentLinker());
    const org = await svc.createOrganization({}, { name: 'New', slug: 'new' });
    expect(org.externalId).toBe('org_new');
    expect(org.slug).toBe('new');
    expect(calls).toEqual(['create', 'setActive:org_new']);
  });

  it('throws when the created org does not propagate to the domain mirror', async () => {
    const { repo } = fakeRepo();
    const orgAdmin: OrgAdmin = {
      ...stubOrgAdmin(),
      async createOrganization() {
        return { externalId: 'ghost' };
      },
    };
    const svc = new OrganizationServiceImpl(repo, stubMembersRepo, () => orgAdmin, stubStudentLinker());
    await expect(svc.createOrganization({}, { name: 'X', slug: 'x' })).rejects.toThrow(
      /did not propagate/,
    );
  });

  it('updates the active org via OrgAdmin, then returns the re-read mirror row', async () => {
    const { repo } = fakeRepo();
    await repo.create({ externalId: 'org_1', name: 'Old', slug: 'old', ownerId: 's1' });
    const calls: string[] = [];
    const orgAdmin: OrgAdmin = {
      ...stubOrgAdmin(),
      async updateOrganization(_headers, externalId) {
        calls.push(`update:${externalId}`);
      },
    };
    const svc = new OrganizationServiceImpl(repo, stubMembersRepo, () => orgAdmin, stubStudentLinker());
    const org = await svc.updateOrganization({}, 'org_1', { name: 'New', slug: 'new' });
    expect(calls).toEqual(['update:org_1']);
    expect(org.name).toBe('New');
    expect(org.slug).toBe('new');
    // The mirror row reflects the update.
    expect(await repo.findByExternalId('org_1')).toMatchObject({ name: 'New', slug: 'new' });
  });

  it('throws when the org to update is missing from the domain mirror', async () => {
    const { repo } = fakeRepo();
    const svc = new OrganizationServiceImpl(repo, stubMembersRepo, stubOrgAdmin, stubStudentLinker());
    await expect(svc.updateOrganization({}, 'ghost', { name: 'New', slug: 'new' })).rejects.toThrow(
      /did not propagate/,
    );
  });
});

// Member-management operations (formerly the `team` context). Writes go through
// Better Auth (OrgAdmin); reads come from the domain mirror (MembersRepository).
describe('OrganizationService — member management', () => {
  const ctx = { orgId: 'o1', authOrgId: 'org_1', headers: {} };

  function memberRecord(over: Partial<MemberRecord> & { id: string }): MemberRecord {
    return {
      name: 'X',
      email: 'x@example.com',
      image: null,
      role: 'instructor',
      status: 'active',
      joinedAt: '2026-01-01T00:00:00Z',
      invitedAt: null,
      kind: 'member',
      memberExternalId: `auth-${over.id}`,
      invitationExternalId: null,
      ...over,
    };
  }

  /** Configurable members repo + a spy OrgAdmin. */
  function harness(records: MemberRecord[]) {
    const calls: string[] = [];
    const membersRepo: MembersRepository = {
      async list() {
        return { rows: records, total: records.length, page: 1, pageSize: 20 };
      },
      async findByEmail(_orgId, email) {
        return records.find((r) => r.email.toLowerCase() === email.toLowerCase()) ?? null;
      },
      async findById(_orgId, id) {
        return records.find((r) => r.id === id) ?? null;
      },
    };
    const orgAdmin: OrgAdmin = {
      async createOrganization() {
        return { externalId: 'org_stub' };
      },
      async setActiveOrganization() {},
      async updateOrganization() {
        calls.push('updateOrganization');
      },
      async invite() {
        calls.push('invite');
      },
      async inviteStudent() {
        calls.push('inviteStudent');
      },
      async grantMembership() {
        calls.push('grantMembership');
      },
      async updateRole() {
        calls.push('updateRole');
      },
      async removeMember() {
        calls.push('removeMember');
      },
    };
    const { repo, invitations } = fakeRepo();
    const svc = new OrganizationServiceImpl(repo, membersRepo, () => orgAdmin, stubStudentLinker());
    return { svc, calls, repo, invitations };
  }

  it('rejects inviting an email that is already a member or invited', async () => {
    const { svc, calls } = harness([memberRecord({ id: 'm1', email: 'dup@example.com' })]);
    await expect(
      svc.inviteMember(ctx, { email: 'dup@example.com', role: 'instructor' }),
    ).rejects.toThrow(OrganizationRuleError);
    expect(calls).not.toContain('invite');
  });

  it('refuses to reassign the owner role', async () => {
    const { svc, calls } = harness([memberRecord({ id: 'm1', role: 'owner' })]);
    await expect(svc.updateMemberRole(ctx, 'm1', 'admin')).rejects.toThrow(OrganizationRuleError);
    expect(calls).not.toContain('updateRole');
  });

  it('refuses to remove the owner', async () => {
    const { svc, calls } = harness([memberRecord({ id: 'm1', role: 'owner' })]);
    await expect(svc.removeMember(ctx, 'm1')).rejects.toThrow(OrganizationRuleError);
    expect(calls).not.toContain('removeMember');
  });

  it("updates a non-owner member's role via OrgAdmin", async () => {
    const { svc, calls } = harness([memberRecord({ id: 'm1', role: 'instructor' })]);
    await svc.updateMemberRole(ctx, 'm1', 'admin');
    expect(calls).toContain('updateRole');
  });

  it('removeMember cancels a pending invitation in the mirror only', async () => {
    const { svc, calls, repo, invitations } = harness([
      memberRecord({
        id: 'i1',
        role: 'instructor',
        kind: 'invitation',
        status: 'invited',
        memberExternalId: null,
        invitationExternalId: 'auth-inv-1',
      }),
    ]);
    await repo.insertInvitation('o1', {
      orgExternalId: 'org_1',
      externalId: 'auth-inv-1',
      email: 'x@example.com',
      role: 'instructor',
      status: 'pending',
      inviterUserId: 'user_1',
      expiresAt: null,
    });
    const removed = await svc.removeMember(ctx, 'i1');
    expect(removed).toBe(true);
    expect(invitations.find((i) => i.externalId === 'auth-inv-1')?.status).toBe('canceled');
    expect(calls).not.toContain('cancelInvitation');
    expect(calls).not.toContain('removeMember');
  });

  it('returns false when removing an unknown member', async () => {
    const { svc } = harness([]);
    expect(await svc.removeMember(ctx, 'nope')).toBe(false);
  });
});

describe('logging', () => {
  it('logs the org mirror write once (idempotent re-run stays silent)', async () => {
    const { createCapturingLogger } = await import('../shared/logger.js');
    const { logger, entries } = createCapturingLogger();
    const { repo } = fakeRepo();
    const svc = new OrganizationServiceImpl(repo, stubMembersRepo, stubOrgAdmin, stubStudentLinker(), undefined, logger);

    const org = await svc.createOrg(orgInput);
    await svc.createOrg(orgInput);

    const infos = entries.filter((e) => e.level === 'info' && e.msg === 'organization mirrored');
    expect(infos).toHaveLength(1);
    expect(infos[0]?.meta).toMatchObject({ orgId: org.id, externalId: 'org_1' });
  });
});
