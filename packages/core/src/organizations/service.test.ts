import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrganizationServiceImpl } from './service.js';
import type {
  ApiKeys,
  MembersRepository,
  OrgAdmin,
  OrganizationsRepository,
  OrganizationsUnitOfWork,
  RolesRepository,
} from './ports.js';
import type { Invite, Organization, OrgUser } from './model.js';
import type { StoredOrgRole } from './org-roles.js';
import type { AssignmentRow } from './effective-permissions.js';
import type { IdentityService } from '../identity/index.js';
import type { NewDomainEvent } from '../shared/ports.js';
import type { Actor } from '../shared/actor.js';
import type { ContentType, Permission, RoleAssignment } from '../types/index.js';
import { ConflictError, ForbiddenError } from '../shared/errors.js';
import { InviteError, OrganizationRuleError } from './members.js';
import { hashInviteToken } from '../shared/invite-token.js';
import { createCapturingLogger } from '../shared/logger.js';
import type { Logger } from '../shared/ports.js';
import { DEFAULT_ROLES, RoleSetError, type RoleDefinition } from './default-roles.js';

const ORG = 'org_1';
const OWNER_KEY = 'owner';

interface Person {
  id: string;
  email: string;
  externalId: string | null;
  firstName: string | null;
  lastName: string | null;
}

function store(opts: { defaultRoles?: readonly RoleDefinition[]; logger?: Logger } = {}) {
  const orgs = new Map<string, Organization>();
  const orgUsers = new Map<string, OrgUser>();
  const people = new Map<string, Person>();
  const invites = new Map<string, Invite>();
  const assignments: RoleAssignment[] = [];
  const storedRoles: StoredOrgRole[] = [];
  const content = new Map<string, ContentType>([
    ['crs_1', 'course'],
    ['crs_2', 'course'],
    ['cmy_1', 'community'],
  ]);
  const events: NewDomainEvent[] = [];
  const blocked = new Set<string>();
  const holdsGrant = new Set<string>();
  let seq = 0;
  const next = (prefix: string) => `${prefix}_${++seq}`;
  const now = new Date('2026-01-01T00:00:00Z');

  const repo: OrganizationsRepository = {
    create: async (input) => {
      const org: Organization = {
        id: input.id,
        externalId: input.externalId ?? input.id,
        name: input.name,
        slug: input.slug,
        ownerId: input.ownerId,
        createdAt: now,
        updatedAt: now,
      };
      orgs.set(org.id, org);
      return org;
    },
    update: async (id, input) => {
      const org = orgs.get(id);
      if (!org) {
        return null;
      }
      const updated = {
        ...org,
        ...(input.name && { name: input.name }),
        ...(input.slug && { slug: input.slug }),
      };
      orgs.set(id, updated);
      return updated;
    },
    delete: async (id) => orgs.get(id)!,
    findById: async (id) => orgs.get(id) ?? null,
    listIds: async () => [...orgs.keys()],
    findByExternalId: async (id) => [...orgs.values()].find((o) => o.externalId === id) ?? null,
    findBySlug: async (slug) => [...orgs.values()].find((o) => o.slug === slug) ?? null,
    upsertPendingInvite: async (orgId, input) => {
      const existing = [...invites.values()].find(
        (i) => i.orgId === orgId && i.email === input.email && i.status === 'pending',
      );
      const invite: Invite = {
        id: existing?.id ?? next('ivt'),
        orgId,
        email: input.email,
        roleKey: input.roleKey,
        status: 'pending',
        invitedBy: input.invitedBy,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        createdAt: now,
        updatedAt: now,
      };
      invites.set(invite.id, invite);
      return invite;
    },
    setInviteStatus: async (_orgId, id, status) => {
      const invite = invites.get(id);
      if (!invite) {
        return null;
      }
      const updated = { ...invite, status: status as Invite['status'] };
      invites.set(id, updated);
      return updated;
    },
    setInviteRole: async (_orgId, id, roleKey, invitedBy) => {
      const invite = invites.get(id);
      if (!invite) {
        return null;
      }
      const updated = { ...invite, roleKey, invitedBy };
      invites.set(id, updated);
      return updated;
    },
    findInviteByTokenHash: async (hash) =>
      [...invites.values()].find((i) => i.tokenHash === hash) ?? null,
    findPendingInvite: async (orgId, email) =>
      [...invites.values()].find(
        (i) =>
          i.orgId === orgId &&
          i.email.toLowerCase() === email.toLowerCase() &&
          i.status === 'pending',
      ) ?? null,
    setInviteToken: async (_orgId, id, tokenHash, expiresAt, invitedBy) => {
      const invite = invites.get(id);
      if (!invite) {
        return null;
      }
      const updated = { ...invite, tokenHash, expiresAt, invitedBy };
      invites.set(id, updated);
      return updated;
    },
    findOrgUser: async (orgId, userId) =>
      [...orgUsers.values()].find((u) => u.orgId === orgId && u.userId === userId) ?? null,
    findOrgUsersByUser: async (userId) => [...orgUsers.values()].filter((u) => u.userId === userId),
    findOrgUserById: async (orgId, id) => {
      const u = orgUsers.get(id);
      return u && u.orgId === orgId ? u : null;
    },
    findOrgUsersByIds: async (_orgId, ids) =>
      ids.map((id) => orgUsers.get(id)).filter((u): u is OrgUser => u !== undefined),
    createOrgUser: async (input) => {
      if (
        [...orgUsers.values()].some((u) => u.orgId === input.orgId && u.userId === input.userId)
      ) {
        throw new ConflictError('That account already belongs to this organization');
      }
      const u: OrgUser = {
        id: next('orm'),
        orgId: input.orgId,
        userId: input.userId,
        status: input.status ?? 'active',
        createdAt: now,
        updatedAt: now,
      };
      orgUsers.set(u.id, u);
      return u;
    },
    updateOrgUser: async (_orgId, id, patch) => {
      const u = orgUsers.get(id);
      if (!u) {
        return null;
      }
      const updated = { ...u, ...(patch.status && { status: patch.status }) };
      orgUsers.set(id, updated);
      return updated;
    },
    deleteOrgUser: async (_orgId, id) => {
      const u = orgUsers.get(id);
      if (!u) {
        return null;
      }
      if (blocked.has(id)) {
        throw new ConflictError(
          'This person has written posts, comments or messages and cannot be deleted',
        );
      }
      orgUsers.delete(id);
      for (let i = assignments.length - 1; i >= 0; i--) {
        if (assignments[i]!.orgUserId === id) {
          assignments.splice(i, 1);
        }
      }
      return u;
    },
  };

  const toRow = (a: RoleAssignment): AssignmentRow => ({
    roleKey: a.roleKey,
    contentId: a.contentId,
    contentType: a.contentType,
  });

  const roles: RolesRepository = {
    callerFacts: async (authOrgId, authUserId) => {
      const org = [...orgs.values()].find((o) => o.externalId === authOrgId);
      if (!org) {
        return null;
      }
      const user = [...people.values()].find((p) => p.externalId === authUserId);
      const orgUser = user
        ? [...orgUsers.values()].find((u) => u.orgId === org.id && u.userId === user.id)
        : undefined;
      return {
        orgId: org.id,
        userId: user?.id ?? null,
        orgUser: orgUser
          ? {
              orgUserId: orgUser.id,
              status: orgUser.status,
              assignments: assignments.filter((a) => a.orgUserId === orgUser.id).map(toRow),
              storedRoles: [...storedRoles],
            }
          : null,
      };
    },
    actorFacts: async (_orgId, id) => {
      const u = orgUsers.get(id);
      if (!u) {
        return null;
      }
      return {
        orgUserId: id,
        status: u.status,
        assignments: assignments.filter((a) => a.orgUserId === id).map(toRow),
        storedRoles: [...storedRoles],
      };
    },
    storedRoles: async () => [...storedRoles],
    saveStoredRole: async (_orgId, role) => {
      const i = storedRoles.findIndex((r) => r.key === role.key);
      if (i >= 0) {
        storedRoles[i] = role;
      } else {
        storedRoles.push(role);
      }
    },
    deleteStoredRole: async (_orgId, key) => {
      const i = storedRoles.findIndex((r) => r.key === key);
      if (i < 0) {
        return false;
      }
      storedRoles.splice(i, 1);
      return true;
    },
    assignmentsOf: async (_orgId, id) => assignments.filter((a) => a.orgUserId === id),
    assignmentsOfMany: async (_orgId, ids) => {
      const out = new Map<string, AssignmentRow[]>();
      for (const a of assignments.filter((x) => ids.includes(x.orgUserId))) {
        out.set(a.orgUserId, [...(out.get(a.orgUserId) ?? []), toRow(a)]);
      }
      return out;
    },
    assignmentsOn: async (_orgId, contentId) =>
      assignments.filter((a) => a.contentId === contentId),
    holdersOf: async (_orgId, keys, contentId) => [
      ...new Set(
        assignments
          .filter(
            (a) =>
              keys.includes(a.roleKey) &&
              orgUsers.get(a.orgUserId)?.status === 'active' &&
              (a.contentId === null || (contentId !== undefined && a.contentId === contentId)),
          )
          .map((a) => a.orgUserId),
      ),
    ],
    setOrgRole: async (orgId, id, roleKey, assignedBy) => {
      const i = assignments.findIndex((a) => a.orgUserId === id && a.contentId === null);
      if (i >= 0) {
        assignments.splice(i, 1);
      }
      if (roleKey) {
        if (roleKey === OWNER_KEY && assignments.some((a) => a.roleKey === OWNER_KEY)) {
          throw new ConflictError('an owner row already exists');
        }
        assignments.push({
          id: next('ras'),
          orgId,
          orgUserId: id,
          roleKey,
          contentId: null,
          contentType: null,
          assignedBy,
          createdAt: now,
        });
      }
    },
    setItemRole: async (orgId, id, contentId, contentType, roleKey, assignedBy) => {
      const i = assignments.findIndex((a) => a.orgUserId === id && a.contentId === contentId);
      if (i >= 0) {
        assignments.splice(i, 1);
      }
      assignments.push({
        id: next('ras'),
        orgId,
        orgUserId: id,
        roleKey,
        contentId,
        contentType,
        assignedBy,
        createdAt: now,
      });
    },
    removeItemRole: async (_orgId, id, contentId) => {
      const i = assignments.findIndex((a) => a.orgUserId === id && a.contentId === contentId);
      if (i < 0) {
        return null;
      }
      return assignments.splice(i, 1)[0]!;
    },
    countHolders: async (_orgId, key, level) =>
      assignments.filter(
        (a) =>
          a.roleKey === key &&
          (level === undefined ||
            (level === 'org' ? a.contentId === null : a.contentType === level)),
      ).length,
    holderCounts: async () => {
      const out: Record<string, number> = {};
      for (const a of assignments) {
        out[a.roleKey] = (out[a.roleKey] ?? 0) + 1;
      }
      return out;
    },
    contentTypeOf: async (_orgId, id) => content.get(id) ?? null,
    ownerOrgUserId: async () => assignments.find((a) => a.roleKey === OWNER_KEY)?.orgUserId ?? null,
    roleKeyUsage: async () => {
      const out = new Map<
        string,
        { orgId: string; roleKey: string; level: string; count: number; stored: boolean }
      >();
      for (const a of assignments) {
        const level = a.contentType ?? 'org';
        const k = `${a.orgId}|${a.roleKey}|${level}`;
        const row = out.get(k) ?? {
          orgId: a.orgId,
          roleKey: a.roleKey,
          level,
          count: 0,
          stored: storedRoles.some((r) => r.key === a.roleKey),
        };
        row.count++;
        out.set(k, row);
      }
      return [...out.values()];
    },
    lock: async () => {},
  };

  const identity = {
    getUserById: async (id: string) => people.get(id) ?? null,
    getUserByExternalId: async (id: string) =>
      [...people.values()].find((p) => p.externalId === id) ?? null,
    getUserByEmail: async (email: string) =>
      [...people.values()].find((p) => p.email === email) ?? null,
    createUser: async (input: { email: string; firstName?: string; lastName?: string }) => {
      const p: Person = {
        id: next('usr'),
        email: input.email,
        externalId: null,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
      };
      people.set(p.id, p);
      return p;
    },
  } as unknown as IdentityService;

  const orgAdmin = {
    createOrganization: vi.fn(),
    setActiveOrganization: vi.fn(),
    deleteOrganization: vi.fn(),
    updateOrganization: vi.fn(async () => {}),
    grantMembership: vi.fn(async () => {}),
    setMembershipOwner: vi.fn(async () => {}),
    removeMembership: vi.fn(async () => {}),
  } satisfies OrgAdmin;
  const apiKeys = {
    list: vi.fn(async () => []),
    create: vi.fn(async (_o: string, _u: string, name: string, scopes: Permission[]) => ({
      id: 'key_1',
      name,
      start: 'abc',
      scopes,
      createdAt: now,
      lastUsedAt: null,
      key: 'secret',
    })),
    revoke: vi.fn(async () => {}),
    listApps: vi.fn(async () => []),
    revokeApp: vi.fn(async () => {}),
    revokeAllFor: vi.fn(async () => {}),
  } satisfies ApiKeys;
  const membersRepo: MembersRepository = { teamRows: async () => [] };
  const tx = { open: false };
  const escapes: string[] = [];
  const uow: OrganizationsUnitOfWork = {
    run: async (fn) => {
      tx.open = true;
      try {
        return await fn({
          organizations: repo,
          roles,
          outbox: {
            append: async (e) => {
              events.push(...e);
            },
          },
        });
      } finally {
        tx.open = false;
      }
    },
  };
  const guardedPeople = new Proxy(identity, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver) as unknown;
      if (typeof value !== 'function') {
        return value;
      }
      return (...args: unknown[]) => {
        if (tx.open) {
          escapes.push(`people.${String(key)}`);
        }
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  const send = vi.fn(async () => {});
  const images = { syncPublicImage: vi.fn(async () => {}) };
  const sessions = { stampActiveOrganization: vi.fn(async () => true) };
  const service = new OrganizationServiceImpl({
    repo,
    roles,
    membersRepo,
    people: guardedPeople,
    images,
    uow,
    orgAdmin: () => orgAdmin,
    sessions: () => sessions,
    apiKeys: () => apiKeys,
    grants: () => ({ holdsAnyGrant: async (_o, id) => holdsGrant.has(id) }),
    mailer: { send },
    inviteUrls: { studentPortalUrl: 'https://learn.test', adminAppUrl: 'https://admin.test' },
    ...opts,
  });

  async function person(
    name: string,
    opts: { status?: OrgUser['status']; account?: boolean } = {},
  ) {
    const p: Person = {
      id: next('usr'),
      email: `${name.toLowerCase()}@example.com`,
      externalId: opts.account === false ? null : `ba_${name.toLowerCase()}`,
      firstName: name,
      lastName: null,
    };
    people.set(p.id, p);
    const u = await repo.createOrgUser({
      orgId: ORG,
      userId: p.id,
      status: opts.status ?? 'active',
    });
    return { person: p, orgUser: u };
  }

  async function actor(orgUserId: string): Promise<Actor> {
    const a = await service.actorFor(ORG, orgUserId);
    if (!a) {
      throw new Error('no actor');
    }
    return a;
  }

  const findByEmail = (email: string) =>
    [...orgUsers.values()].find((u) => people.get(u.userId)?.email === email)!;

  return {
    service,
    escapes,
    repo,
    roles,
    orgs,
    assignments,
    storedRoles,
    invites,
    orgUsers,
    people,
    images,
    sessions,
    events,
    orgAdmin,
    apiKeys,
    send,
    blocked,
    holdsGrant,
    person,
    actor,
    findByEmail,
  };
}

type World = ReturnType<typeof store>;

async function world(opts: Parameters<typeof store>[0] = {}) {
  const w = store(opts);
  await w.repo.create({ id: ORG, name: 'Spanish in 90 Days', slug: 'spanish', ownerId: 'usr_0' });
  const sarah = await w.person('Sarah');
  await w.roles.setOrgRole(ORG, sarah.orgUser.id, 'owner', 'system');
  const liam = await w.person('Liam');
  await w.roles.setOrgRole(ORG, liam.orgUser.id, 'admin', 'system');
  const james = await w.person('James');
  const emma = await w.person('Emma');
  const oliver = await w.person('Oliver');
  return { w, sarah, liam, james, emma, oliver };
}

async function roleWith(w: World, owner: Actor, name: string, held: Permission[]) {
  const admin = await w.service.getRole('admin', owner);
  return w.service.createRole(
    {
      base: 'admin',
      name,
      levels: ['org'],
      permissions: Object.fromEntries(admin.permissions.map((p) => [p, held.includes(p)])),
    },
    owner,
  );
}

let s: Awaited<ReturnType<typeof world>>;
let w: World;
beforeEach(async () => {
  s = await world();
  w = s.w;
});

const HEADERS = { cookie: 'session=1' };

describe('provisionOrganization', () => {
  it('makes the creator an active org user holding the owner row', async () => {
    const fresh = store();
    const org = await fresh.service.provisionOrganization({
      ownerId: 'usr_x',
      name: 'New',
      slug: 'new',
    });
    const owner = [...fresh.orgUsers.values()].find((u) => u.orgId === org.id)!;
    expect(owner.status).toBe('active');
    expect(fresh.assignments).toEqual([
      expect.objectContaining({ orgUserId: owner.id, roleKey: 'owner', contentId: null }),
    ]);
    const actor = await fresh.service.actorFor(org.id, owner.id);
    expect(actor?.permissions.isOwner()).toBe(true);
  });
});

describe('actorFor', () => {
  it('builds the actor from the org role and the item roles', async () => {
    await w.roles.setItemRole(ORG, s.james.orgUser.id, 'crs_1', 'course', 'instructor', 'system');
    const james = await w.actor(s.james.orgUser.id);
    expect(james.permissions.has('courses:write', 'crs_1')).toBe(true);
    expect(james.permissions.has('courses:write', 'crs_2')).toBe(false);
    expect(james.permissions.roleOn().key).toBe('member');
  });

  it('answers null for an invited org user', async () => {
    const invited = await w.person('Ivy', { status: 'invited' });
    expect(await w.service.actorFor(ORG, invited.orgUser.id)).toBeNull();
  });
});

describe('resolveCaller', () => {
  const externalOf = () => [...w.orgs.values()].find((o) => o.id === ORG)!.externalId!;
  const authIdOf = (userId: string) => w.people.get(userId)!.externalId!;

  it('resolves the org, the user, the org user and the actor in one read', async () => {
    const callerFacts = vi.spyOn(w.roles, 'callerFacts');
    const caller = await w.service.resolveCaller(externalOf(), authIdOf(s.james.orgUser.userId));
    expect(callerFacts).toHaveBeenCalledTimes(1);
    expect(caller).toMatchObject({
      orgId: ORG,
      userId: s.james.orgUser.userId,
      orgUserId: s.james.orgUser.id,
    });
    expect(caller?.actor?.permissions.roleOn().key).toBe('member');
  });

  it('applies token scopes to the actor', async () => {
    const caller = await w.service.resolveCaller(externalOf(), authIdOf(s.sarah.orgUser.userId), [
      'people:read',
    ]);
    expect(caller?.actor?.permissions.has('people:read')).toBe(true);
    expect(caller?.actor?.permissions.has('people:write')).toBe(false);
  });

  it('answers no actor for an invited org user, no org user for a stranger, and null for an unknown org', async () => {
    const invited = await w.person('Ivy', { status: 'invited' });
    await expect(
      w.service.resolveCaller(externalOf(), authIdOf(invited.orgUser.userId)),
    ).resolves.toMatchObject({ orgUserId: invited.orgUser.id, actor: null });
    await expect(w.service.resolveCaller(externalOf(), 'usr_stranger')).resolves.toMatchObject({
      orgId: ORG,
      userId: null,
      orgUserId: null,
      actor: null,
    });
    await expect(w.service.resolveCaller('org_missing', 'usr_any')).resolves.toBeNull();
  });

  it("applies a role's rename and permission change to every holder", async () => {
    await w.roles.setOrgRole(ORG, s.james.orgUser.id, 'instructor', 'system');
    await w.service.updateRole(
      'instructor',
      { name: 'Tutor', permissions: { 'courses:delete': true } },
      await w.actor(s.sarah.orgUser.id),
    );
    const james = await w.actor(s.james.orgUser.id);
    expect(james.permissions.roleOn().name).toBe('Tutor');
    expect(james.permissions.has('courses:delete', 'crs_2')).toBe(true);
  });
});

describe('holders', () => {
  it('lists the active people who hold a permission on an item', async () => {
    await w.roles.setItemRole(ORG, s.emma.orgUser.id, 'cmy_1', 'community', 'moderator', 'system');
    const holders = await w.service.holders(ORG, 'communities:moderate', 'cmy_1');
    expect(holders.sort()).toEqual(
      [s.sarah.orgUser.id, s.liam.orgUser.id, s.emma.orgUser.id].sort(),
    );
    expect(await w.service.holders(ORG, 'communities:moderate')).not.toContain(s.emma.orgUser.id);
  });
});

describe('roles', () => {
  it('renames with roles:write alone and stores only the name', async () => {
    await w.service.updateRole('instructor', { name: 'Tutor' }, await w.actor(s.liam.orgUser.id));
    expect(w.storedRoles).toEqual([
      expect.objectContaining({ key: 'instructor', name: 'Tutor', permissions: {}, levels: null }),
    ]);
  });

  it('refuses a name the org already uses, in any case', async () => {
    await expect(
      w.service.updateRole('moderator', { name: 'instructor' }, await w.actor(s.liam.orgUser.id)),
    ).rejects.toBeInstanceOf(OrganizationRuleError);
  });

  it('refuses a change that adds or removes a permission the editor lacks', async () => {
    const owner = await w.actor(s.sarah.orgUser.id);
    const editor = await roleWith(w, owner, 'Role editor', ['roles:read', 'roles:write']);
    await w.service.setOrgRole(s.emma.orgUser.id, editor.key, owner);
    const emma = await w.actor(s.emma.orgUser.id);
    await expect(
      w.service.updateRole('moderator', { permissions: { 'people:write': true } }, emma),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      w.service.updateRole('instructor', { permissions: { 'courses:write': false } }, emma),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(w.service.resetRole('instructor', emma)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('lets Owner and Member be renamed only', async () => {
    const owner = await w.actor(s.sarah.orgUser.id);
    await expect(
      w.service.updateRole('member', { permissions: { 'courses:read': true } }, owner),
    ).rejects.toBeInstanceOf(OrganizationRuleError);
    await expect(
      w.service.updateRole('owner', { levels: ['org', 'course'] }, owner),
    ).rejects.toBeInstanceOf(OrganizationRuleError);
    await expect(w.service.updateRole('member', { name: 'Client' }, owner)).resolves.toMatchObject({
      name: 'Client',
    });
  });

  it("refuses a permission that doesn't fit the levels, and removing a level in use", async () => {
    const owner = await w.actor(s.sarah.orgUser.id);
    await expect(
      w.service.updateRole(
        'instructor',
        { levels: ['course'], permissions: { 'people:write': true } },
        owner,
      ),
    ).rejects.toBeInstanceOf(OrganizationRuleError);
    await w.roles.setItemRole(ORG, s.james.orgUser.id, 'crs_1', 'course', 'instructor', 'system');
    await expect(
      w.service.updateRole('instructor', { levels: ['org'] }, owner),
    ).rejects.toBeInstanceOf(OrganizationRuleError);
  });

  it('adds a role from a base and refuses deleting it while held', async () => {
    const owner = await w.actor(s.sarah.orgUser.id);
    const ta = await w.service.createRole(
      {
        base: 'instructor',
        name: 'Teaching assistant',
        levels: ['course'],
        permissions: { 'courses:write': false },
      },
      owner,
    );
    expect(ta.key).toMatch(/^role_/);
    expect(ta.permissions).toEqual(['courses:read', 'courses:moderate', 'progress:read']);
    await w.service.assignRole(s.james.orgUser.id, 'crs_1', ta.key, owner);
    await expect(w.service.deleteRole(ta.key, owner)).rejects.toThrow(/held by 1 person/);
    await w.service.unassignRole(s.james.orgUser.id, 'crs_1', owner);
    await w.service.deleteRole(ta.key, owner);
    expect(w.storedRoles.some((r) => r.key === ta.key)).toBe(false);
  });

  it('marks every role givable except the owner, on every role read and write', async () => {
    const owner = await w.actor(s.sarah.orgUser.id);
    const roles = await w.service.listRoles(owner);
    expect(roles.filter((role) => !role.givable).map((role) => role.key)).toEqual(['owner']);
    expect(roles.find((role) => role.key === 'member')?.givable).toBe(true);
    await expect(w.service.getRole('owner', owner)).resolves.toMatchObject({ givable: false });
    await expect(w.service.updateRole('owner', { name: 'Founder' }, owner)).resolves.toMatchObject({
      givable: false,
    });
    await expect(
      w.service.updateRole('instructor', { name: 'Tutor' }, owner),
    ).resolves.toMatchObject({ givable: true });
    await expect(w.service.resetRole('instructor', owner)).resolves.toMatchObject({
      givable: true,
    });
    await expect(
      w.service.createRole({ base: 'moderator', name: 'Host' }, owner),
    ).resolves.toMatchObject({ givable: true });
  });

  it('refuses deleting a deployment role, and resets one', async () => {
    const owner = await w.actor(s.sarah.orgUser.id);
    await expect(w.service.deleteRole('instructor', owner)).rejects.toBeInstanceOf(
      OrganizationRuleError,
    );
    await w.service.updateRole('instructor', { name: 'Tutor' }, owner);
    await w.service.resetRole('instructor', owner);
    expect(w.storedRoles).toEqual([]);
  });
});

describe('giving roles', () => {
  it('gives Instructor on a course and refuses it on a community', async () => {
    const owner = await w.actor(s.sarah.orgUser.id);
    await w.service.assignRole(s.james.orgUser.id, 'crs_1', 'instructor', owner);
    await expect(
      w.service.assignRole(s.emma.orgUser.id, 'cmy_1', 'instructor', owner),
    ).rejects.toBeInstanceOf(OrganizationRuleError);
    await expect(
      w.service.assignRole(s.james.orgUser.id, 'crs_2', 'moderator', owner),
    ).rejects.toBeInstanceOf(OrganizationRuleError);
    expect(w.events.map((e) => e.type)).toContain('organization.role.assigned');
  });

  it('refuses giving or removing more than you hold, where you hold it', async () => {
    const owner = await w.actor(s.sarah.orgUser.id);
    await w.service.assignRole(s.james.orgUser.id, 'crs_1', 'instructor', owner);
    const manager = await roleWith(w, owner, 'People manager', ['people:read', 'people:write']);
    await w.service.setOrgRole(s.emma.orgUser.id, manager.key, owner);
    const emma = await w.actor(s.emma.orgUser.id);
    await expect(w.service.setOrgRole(s.oliver.orgUser.id, 'admin', emma)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(w.service.unassignRole(s.james.orgUser.id, 'crs_1', emma)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(w.service.setOrgRole(s.oliver.orgUser.id, 'member', emma)).resolves.toBeDefined();
  });

  it("refuses changing your own roles, the owner's row and giving ownership", async () => {
    const liam = await w.actor(s.liam.orgUser.id);
    await expect(w.service.setOrgRole(s.liam.orgUser.id, 'member', liam)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(w.service.setOrgRole(s.sarah.orgUser.id, 'member', liam)).rejects.toBeInstanceOf(
      OrganizationRuleError,
    );
    await expect(w.service.setOrgRole(s.james.orgUser.id, 'owner', liam)).rejects.toBeInstanceOf(
      OrganizationRuleError,
    );
  });

  it('deletes the org row when the org role becomes Member', async () => {
    const owner = await w.actor(s.sarah.orgUser.id);
    await w.service.setOrgRole(s.james.orgUser.id, 'instructor', owner);
    await w.service.setOrgRole(s.james.orgUser.id, 'member', owner);
    expect(w.assignments.filter((a) => a.orgUserId === s.james.orgUser.id)).toEqual([]);
  });

  it("updates an invited person's invite rather than their assignments", async () => {
    const owner = await w.actor(s.sarah.orgUser.id);
    await w.service.createInvite(
      { email: 'ivy@example.com', roleKey: 'member', sendEmail: false },
      owner,
      s.sarah.person.id,
    );
    const ivy = w.findByEmail('ivy@example.com');
    w.escapes.length = 0;
    await w.service.setOrgRole(ivy.id, 'instructor', owner);
    expect(w.escapes).toEqual([]);
    expect([...w.invites.values()][0]!.roleKey).toBe('instructor');
    expect(w.assignments.some((a) => a.orgUserId === ivy.id)).toBe(false);
  });
});

describe('removePerson', () => {
  it('removes a person, then their membership and their keys', async () => {
    await w.service.removePerson(s.oliver.orgUser.id, await w.actor(s.liam.orgUser.id));
    expect(w.orgUsers.has(s.oliver.orgUser.id)).toBe(false);
    expect(w.orgAdmin.removeMembership).toHaveBeenCalledWith(ORG, 'ba_oliver');
    expect(w.apiKeys.revokeAllFor).toHaveBeenCalledWith(ORG, 'ba_oliver');
    expect(w.images.syncPublicImage).toHaveBeenCalledWith(ORG, s.oliver.orgUser.id, null);
  });

  it('refuses removing the owner, even for an Admin', async () => {
    await expect(
      w.service.removePerson(s.sarah.orgUser.id, await w.actor(s.liam.orgUser.id)),
    ).rejects.toBeInstanceOf(OrganizationRuleError);
  });

  it('refuses removing someone who holds more than you', async () => {
    const owner = await w.actor(s.sarah.orgUser.id);
    const remover = await roleWith(w, owner, 'Remover', ['people:read', 'people:delete']);
    await w.service.setOrgRole(s.emma.orgUser.id, remover.key, owner);
    await w.service.assignRole(s.james.orgUser.id, 'crs_1', 'instructor', owner);
    const emma = await w.actor(s.emma.orgUser.id);
    await expect(w.service.removePerson(s.james.orgUser.id, emma)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(w.service.removePerson(s.oliver.orgUser.id, emma)).resolves.toBeUndefined();
  });

  it('leaves the membership and keys when the removal is refused', async () => {
    w.blocked.add(s.oliver.orgUser.id);
    await expect(
      w.service.removePerson(s.oliver.orgUser.id, await w.actor(s.liam.orgUser.id)),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(w.orgAdmin.removeMembership).not.toHaveBeenCalled();
    expect(w.apiKeys.revokeAllFor).not.toHaveBeenCalled();
  });
});

describe('transferOwnership', () => {
  it("moves the owner row, replaces the new owner's org row and gives the previous owner a role", async () => {
    await w.roles.setOrgRole(ORG, s.james.orgUser.id, 'instructor', 'system');
    await w.service.transferOwnership(
      { newOwnerOrgUserId: s.james.orgUser.id, previousOwnerRoleKey: 'admin' },
      await w.actor(s.sarah.orgUser.id),
    );
    const rows = (id: string) =>
      w.assignments.filter((a) => a.orgUserId === id).map((a) => a.roleKey);
    expect(rows(s.james.orgUser.id)).toEqual(['owner']);
    expect(rows(s.sarah.orgUser.id)).toEqual(['admin']);
    expect(w.orgAdmin.setMembershipOwner).toHaveBeenCalledWith(ORG, 'ba_james', true);
    expect(w.orgAdmin.setMembershipOwner).toHaveBeenCalledWith(ORG, 'ba_sarah', false);
  });

  it('refuses anyone but the owner, and the owner through a token', async () => {
    await expect(
      w.service.transferOwnership(
        { newOwnerOrgUserId: s.james.orgUser.id },
        await w.actor(s.liam.orgUser.id),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const key = await w.service.actorFor(ORG, s.sarah.orgUser.id, ['people:write']);
    await expect(
      w.service.transferOwnership({ newOwnerOrgUserId: s.james.orgUser.id }, key!),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses an invited new owner', async () => {
    const ivy = await w.person('Ivy', { status: 'invited' });
    await expect(
      w.service.transferOwnership(
        { newOwnerOrgUserId: ivy.orgUser.id },
        await w.actor(s.sarah.orgUser.id),
      ),
    ).rejects.toBeInstanceOf(OrganizationRuleError);
  });
});

describe('invites', () => {
  it('creates the invited person at once and links a Member invite to the learner portal', async () => {
    const invite = await w.service.createInvite(
      { email: 'ivy@example.com' },
      await w.actor(s.liam.orgUser.id),
      s.liam.person.id,
    );
    expect(invite.roleKey).toBe('member');
    expect(w.findByEmail('ivy@example.com').status).toBe('invited');
    expect(w.send).toHaveBeenCalledWith(
      'ivy@example.com',
      'studentInvite',
      expect.objectContaining({
        inviteUrl: expect.stringContaining('https://learn.test/welcome?token='),
      }),
    );
  });

  it('names the role in a team invite and links to the admin app', async () => {
    await w.service.updateRole('instructor', { name: 'Tutor' }, await w.actor(s.sarah.orgUser.id));
    await w.service.createInvite(
      { email: 'ivy@example.com', roleKey: 'instructor' },
      await w.actor(s.liam.orgUser.id),
      s.liam.person.id,
    );
    expect(w.send).toHaveBeenCalledWith(
      'ivy@example.com',
      'memberInvite',
      expect.objectContaining({
        role: 'Tutor',
        inviteUrl: expect.stringContaining('https://admin.test/invite?'),
      }),
    );
  });

  it('refuses an owner invite and an invite to the owner', async () => {
    const liam = await w.actor(s.liam.orgUser.id);
    await expect(
      w.service.createInvite(
        { email: 'ivy@example.com', roleKey: 'owner' },
        liam,
        s.liam.person.id,
      ),
    ).rejects.toBeInstanceOf(OrganizationRuleError);
    await expect(
      w.service.createInvite({ email: 'sarah@example.com' }, liam, s.liam.person.id),
    ).rejects.toBeInstanceOf(OrganizationRuleError);
  });

  it('accepts an invite, sets the invited role and grants a membership', async () => {
    const ivy = await w.person('Ivy', { status: 'invited' });
    await w.repo.upsertPendingInvite(ORG, {
      email: ivy.person.email,
      roleKey: 'instructor',
      invitedBy: s.liam.person.id,
      tokenHash: hashInviteToken('tok'),
      expiresAt: new Date(Date.now() + 60_000),
    });
    await w.service.acceptInvite(
      {
        token: 'tok',
        authUserId: ivy.person.externalId!,
        email: ivy.person.email,
      },
      HEADERS,
    );
    expect(w.orgUsers.get(ivy.orgUser.id)!.status).toBe('active');
    expect(w.sessions.stampActiveOrganization).toHaveBeenCalledWith(HEADERS, ORG);
    expect(
      w.assignments.filter((a) => a.orgUserId === ivy.orgUser.id).map((a) => a.roleKey),
    ).toEqual(['instructor']);
    expect(w.orgAdmin.grantMembership).toHaveBeenCalledWith(ORG, 'ba_ivy');
  });

  it('refuses an acceptance when the inviter no longer holds the role, and accepts it after a resend', async () => {
    const ivy = await w.person('Ivy', { status: 'invited' });
    await w.repo.upsertPendingInvite(ORG, {
      email: ivy.person.email,
      roleKey: 'instructor',
      invitedBy: s.james.person.id,
      tokenHash: hashInviteToken('tok'),
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(
      w.service.acceptInvite(
        {
          token: 'tok',
          authUserId: ivy.person.externalId!,
          email: ivy.person.email,
        },
        HEADERS,
      ),
    ).rejects.toBeInstanceOf(InviteError);
    await w.service.resendInvite(
      ivy.orgUser.id,
      await w.actor(s.liam.orgUser.id),
      s.liam.person.id,
    );
    const invite = [...w.invites.values()][0]!;
    expect(invite.invitedBy).toBe(s.liam.person.id);
    await w.repo.setInviteToken(
      ORG,
      invite.id,
      hashInviteToken('tok2'),
      new Date(Date.now() + 60_000),
      s.liam.person.id,
    );
    await w.service.acceptInvite(
      {
        token: 'tok2',
        authUserId: ivy.person.externalId!,
        email: ivy.person.email,
      },
      HEADERS,
    );
    expect(w.orgUsers.get(ivy.orgUser.id)!.status).toBe('active');
  });

  it('cancels an invite and keeps a person who holds an item role or a grant', async () => {
    const owner = await w.actor(s.sarah.orgUser.id);
    for (const email of ['ivy@example.com', 'max@example.com', 'zoe@example.com']) {
      await w.service.createInvite({ email, sendEmail: false }, owner, s.sarah.person.id);
    }
    const ivy = w.findByEmail('ivy@example.com');
    const max = w.findByEmail('max@example.com');
    const zoe = w.findByEmail('zoe@example.com');
    await w.service.assignRole(ivy.id, 'crs_1', 'instructor', owner);
    w.holdsGrant.add(zoe.id);
    for (const id of [ivy.id, max.id, zoe.id]) {
      await w.service.cancelInvite(id, owner);
    }
    expect(w.orgUsers.has(ivy.id)).toBe(true);
    expect(w.orgUsers.has(zoe.id)).toBe(true);
    expect(w.orgUsers.has(max.id)).toBe(false);
  });
});

describe('review fixes', () => {
  it("checks a pending invite's own role and makes the editor the inviter", async () => {
    const owner = await w.actor(s.sarah.orgUser.id);
    await w.service.createInvite(
      { email: 'ben@example.com', roleKey: 'admin', sendEmail: false },
      owner,
      s.sarah.person.id,
    );
    const ben = w.findByEmail('ben@example.com');
    const manager = await roleWith(w, owner, 'Manager', ['people:read', 'people:write']);
    await w.service.setOrgRole(s.emma.orgUser.id, manager.key, owner);
    const emma = await w.actor(s.emma.orgUser.id);
    await expect(w.service.setOrgRole(ben.id, 'member', emma)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await w.service.setOrgRole(ben.id, 'instructor', await w.actor(s.liam.orgUser.id));
    const invite = [...w.invites.values()].find((i) => i.email === 'ben@example.com')!;
    expect(invite.roleKey).toBe('instructor');
    expect(invite.invitedBy).toBe(s.liam.person.id);
  });

  it('answers 404 when an invited person has no pending invite', async () => {
    const ivy = await w.person('Ivy', { status: 'invited' });
    await expect(
      w.service.setOrgRole(ivy.orgUser.id, 'instructor', await w.actor(s.sarah.orgUser.id)),
    ).rejects.toThrow(/not found/);
  });

  it('refuses inviting yourself', async () => {
    await expect(
      w.service.createInvite(
        { email: 'liam@example.com', roleKey: 'instructor' },
        await w.actor(s.liam.orgUser.id),
        s.liam.person.id,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('creates no person for a refused invite', async () => {
    const before = w.people.size;
    await expect(
      w.service.createInvite(
        { email: 'new@example.com', roleKey: 'admin' },
        await w.actor(s.oliver.orgUser.id),
        s.oliver.person.id,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(w.people.size).toBe(before);
  });

  it('refuses a reset that would repeat a name', async () => {
    const owner = await w.actor(s.sarah.orgUser.id);
    await w.service.updateRole('instructor', { name: 'Tutor' }, owner);
    await w.service.updateRole('moderator', { name: 'Instructor' }, owner);
    await expect(w.service.resetRole('instructor', owner)).rejects.toBeInstanceOf(
      OrganizationRuleError,
    );
  });

  it('still removes a person when the cleanup afterwards fails', async () => {
    w.apiKeys.revokeAllFor.mockRejectedValue(new Error('auth down'));
    await expect(
      w.service.removePerson(s.oliver.orgUser.id, await w.actor(s.liam.orgUser.id)),
    ).resolves.toBeUndefined();
    expect(w.orgUsers.has(s.oliver.orgUser.id)).toBe(false);
    expect(w.apiKeys.revokeAllFor).toHaveBeenCalledTimes(3);
  });

  it('refuses an acceptance when the inviter lost people:write', async () => {
    const ivy = await w.person('Ivy', { status: 'invited' });
    const owner = await w.actor(s.sarah.orgUser.id);
    const reader = await roleWith(w, owner, 'Reader', ['people:read']);
    await w.service.setOrgRole(s.emma.orgUser.id, reader.key, owner);
    await w.repo.upsertPendingInvite(ORG, {
      email: ivy.person.email,
      roleKey: 'member',
      invitedBy: s.emma.person.id,
      tokenHash: hashInviteToken('tok'),
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(
      w.service.acceptInvite(
        {
          token: 'tok',
          authUserId: ivy.person.externalId!,
          email: ivy.person.email,
        },
        HEADERS,
      ),
    ).rejects.toBeInstanceOf(InviteError);
  });

  it('emits organization.user.updated when an acceptance activates a person', async () => {
    const ivy = await w.person('Ivy', { status: 'invited' });
    await w.repo.upsertPendingInvite(ORG, {
      email: ivy.person.email,
      roleKey: 'member',
      invitedBy: s.liam.person.id,
      tokenHash: hashInviteToken('tok'),
      expiresAt: new Date(Date.now() + 60_000),
    });
    await w.service.acceptInvite(
      {
        token: 'tok',
        authUserId: ivy.person.externalId!,
        email: ivy.person.email,
      },
      HEADERS,
    );
    expect(w.events.map((e) => e.type)).toContain('organization.user.updated');
  });
});

describe('role key audit', () => {
  it('counts assignments whose role is gone or sits at an unlisted level', async () => {
    await w.roles.setItemRole(ORG, s.james.orgUser.id, 'crs_1', 'course', 'ghost', 'system');
    await w.roles.setOrgRole(ORG, s.emma.orgUser.id, 'instructor', 'system');
    await w.service
      .updateRole('instructor', { levels: ['course'] }, await w.actor(s.sarah.orgUser.id))
      .catch(() => undefined);
    expect(await w.service.auditRoleKeys()).toBe(1);
  });
});

describe('api keys and the organization', () => {
  it('refuses a key scope you hold nowhere', async () => {
    const owner = await w.actor(s.sarah.orgUser.id);
    await w.service.setOrgRole(s.james.orgUser.id, 'instructor', owner);
    const james = await w.actor(s.james.orgUser.id);
    await expect(
      w.service.createApiKey({ name: 'CI', scopes: ['people:write'] }, james),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      w.service.createApiKey({ name: 'CI', scopes: ['courses:write'] }, james),
    ).resolves.toMatchObject({ key: 'secret' });
  });

  it('refuses a taken slug before writing anything', async () => {
    await w.repo.create({ id: 'org_2', name: 'Other', slug: 'taken', ownerId: 'usr_x' });
    await expect(
      w.service.updateOrganization({ slug: 'taken' }, await w.actor(s.liam.orgUser.id)),
    ).rejects.toBeInstanceOf(OrganizationRuleError);
    expect(w.orgAdmin.updateOrganization).not.toHaveBeenCalled();
  });

  it('refuses a Member updating the organization', async () => {
    await expect(
      w.service.updateOrganization({ name: 'x' }, await w.actor(s.oliver.orgUser.id)),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('the deployment role set', () => {
  const replaced = (change: (role: RoleDefinition) => RoleDefinition | null) =>
    DEFAULT_ROLES.map(change).filter((role): role is RoleDefinition => role !== null);

  it('refuses to build the service with an invalid set', () => {
    expect(() => store({ defaultRoles: replaced((r) => (r.key === 'member' ? null : r)) })).toThrow(
      RoleSetError,
    );
    expect(() =>
      store({
        defaultRoles: replaced((r) => (r.key === 'moderator' ? { ...r, levels: ['course'] } : r)),
      }),
    ).toThrow(RoleSetError);
  });

  it('reaches a role the org has not changed, and resolves a changed one from the new base', async () => {
    const {
      w: x,
      sarah,
      james,
    } = await world({
      defaultRoles: replaced((r) =>
        r.key === 'instructor'
          ? { ...r, permissions: ['courses:read', 'courses:write', 'progress:read'] }
          : r,
      ),
    });
    await x.roles.setItemRole(ORG, james.orgUser.id, 'crs_1', 'course', 'instructor', 'system');
    const before = await x.actor(james.orgUser.id);
    expect(before.permissions.has('courses:write', 'crs_1')).toBe(true);
    expect(before.permissions.has('courses:moderate', 'crs_1')).toBe(false);
    await x.service.updateRole(
      'instructor',
      { permissions: { 'courses:delete': true } },
      await x.actor(sarah.orgUser.id),
    );
    const after = await x.actor(james.orgUser.id);
    expect(after.permissions.has('courses:delete', 'crs_1')).toBe(true);
    expect(after.permissions.has('courses:write', 'crs_1')).toBe(true);
    expect(after.permissions.has('courses:moderate', 'crs_1')).toBe(false);
  });

  it('leaves assignments of a dropped key or level contributing nothing, and logs them', async () => {
    const { logger, entries } = createCapturingLogger();
    const {
      w: x,
      james,
      emma,
    } = await world({
      logger,
      defaultRoles: replaced((r) =>
        r.key === 'moderator' ? null : r.key === 'instructor' ? { ...r, levels: ['org'] } : r,
      ),
    });
    await x.roles.setItemRole(ORG, james.orgUser.id, 'crs_1', 'course', 'instructor', 'system');
    await x.roles.setItemRole(ORG, emma.orgUser.id, 'cmy_1', 'community', 'moderator', 'system');
    expect((await x.actor(james.orgUser.id)).permissions.anywhere('courses:write')).toBe(false);
    expect((await x.actor(emma.orgUser.id)).permissions.anywhere('communities:moderate')).toBe(
      false,
    );
    expect(await x.service.auditRoleKeys()).toBe(2);
    expect(entries.filter((e) => e.level === 'warn').map((e) => e.meta?.roleKey)).toEqual([
      'instructor',
      'moderator',
    ]);
  });
});

describe('levels when giving and saving', () => {
  it('refuses Owner and Member on any item', async () => {
    const owner = await w.actor(s.sarah.orgUser.id);
    for (const key of ['owner', 'member']) {
      for (const item of ['crs_1', 'cmy_1']) {
        await expect(
          w.service.assignRole(s.james.orgUser.id, item, key, owner),
          `${key} on ${item}`,
        ).rejects.toBeInstanceOf(OrganizationRuleError);
      }
    }
    expect(w.assignments.some((a) => a.orgUserId === s.james.orgUser.id)).toBe(false);
  });

  it('refuses a level that is neither the org nor a content type', async () => {
    const owner = await w.actor(s.sarah.orgUser.id);
    await expect(
      w.service.updateRole('instructor', { levels: ['podcast' as never] }, owner),
    ).rejects.toThrow(/Unknown level podcast/);
    await expect(
      w.service.createRole(
        { base: 'instructor', name: 'Host', levels: ['podcast' as never] },
        owner,
      ),
    ).rejects.toThrow(/Unknown level podcast/);
    await expect(w.service.updateRole('instructor', { levels: [] }, owner)).rejects.toBeInstanceOf(
      OrganizationRuleError,
    );
    expect(w.storedRoles).toEqual([]);
  });
});

describe('deny by default', () => {
  it('refuses every method a person can call to a person who holds nothing', async () => {
    const nobody = await w.actor(s.oliver.orgUser.id);
    await w.service.createInvite(
      { email: 'ivy@example.com', sendEmail: false },
      await w.actor(s.sarah.orgUser.id),
      s.sarah.person.id,
    );
    const ivy = w.findByEmail('ivy@example.com').id;
    const before = { events: w.events.length, assignments: w.assignments.length };
    const calls: Record<string, () => Promise<unknown>> = {
      updateOrganization: () => w.service.updateOrganization({ name: 'x' }, nobody),
      listRoles: () => w.service.listRoles(nobody),
      getRole: () => w.service.getRole('admin', nobody),
      updateRole: () => w.service.updateRole('instructor', { name: 'Tutor' }, nobody),
      createRole: () => w.service.createRole({ base: 'moderator', name: 'Host' }, nobody),
      resetRole: () => w.service.resetRole('instructor', nobody),
      deleteRole: () => w.service.deleteRole('instructor', nobody),
      listTeam: () => w.service.listTeam({ page: 1, pageSize: 20 }, nobody),
      listAssignments: () => w.service.listAssignments(s.james.orgUser.id, nobody),
      listAssignmentsOn: () => w.service.listAssignmentsOn('crs_1', nobody),
      setOrgRole: () => w.service.setOrgRole(s.james.orgUser.id, 'member', nobody),
      assignRole: () => w.service.assignRole(s.james.orgUser.id, 'crs_1', 'instructor', nobody),
      unassignRole: () => w.service.unassignRole(s.james.orgUser.id, 'crs_1', nobody),
      removePerson: () => w.service.removePerson(s.james.orgUser.id, nobody),
      createInvite: () =>
        w.service.createInvite({ email: 'max@example.com' }, nobody, s.oliver.person.id),
      resendInvite: () => w.service.resendInvite(ivy, nobody, s.oliver.person.id),
      cancelInvite: () => w.service.cancelInvite(ivy, nobody),
      listApiKeys: () => w.service.listApiKeys(nobody),
      createApiKey: () => w.service.createApiKey({ name: 'x', scopes: ['courses:read'] }, nobody),
      deleteApiKey: () => w.service.deleteApiKey('key_1', nobody),
    };
    for (const [name, call] of Object.entries(calls)) {
      await expect(call(), name).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(w.events).toHaveLength(before.events);
    expect(w.assignments).toHaveLength(before.assignments);
    expect(w.orgUsers.has(ivy)).toBe(true);
    expect(w.apiKeys.create).not.toHaveBeenCalled();
    expect(w.apiKeys.revoke).not.toHaveBeenCalled();
  });
});

describe('escalation', () => {
  it('refuses adding a role that holds a permission the editor lacks', async () => {
    const owner = await w.actor(s.sarah.orgUser.id);
    const editor = await roleWith(w, owner, 'Role editor', ['roles:read', 'roles:write']);
    await w.service.setOrgRole(s.emma.orgUser.id, editor.key, owner);
    const emma = await w.actor(s.emma.orgUser.id);
    await expect(
      w.service.createRole({ base: 'moderator', name: 'Host' }, emma),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      w.service.createRole(
        { base: 'admin', name: 'Reader', levels: ['org'], permissions: { 'people:read': true } },
        emma,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const lead = await roleWith(w, owner, 'Lead', [
      'roles:read',
      'roles:write',
      'communities:moderate',
    ]);
    await w.service.setOrgRole(s.james.orgUser.id, lead.key, owner);
    await expect(
      w.service.createRole({ base: 'moderator', name: 'Host' }, await w.actor(s.james.orgUser.id)),
    ).resolves.toMatchObject({ permissions: ['communities:moderate'] });
  });

  it('needs rule 2 against the current org role for a Member invite to an existing person', async () => {
    const owner = await w.actor(s.sarah.orgUser.id);
    const manager = await roleWith(w, owner, 'People manager', ['people:read', 'people:write']);
    await w.service.setOrgRole(s.emma.orgUser.id, manager.key, owner);
    const emma = await w.actor(s.emma.orgUser.id);
    await expect(
      w.service.createInvite(
        { email: s.liam.person.email, roleKey: 'member', sendEmail: false },
        emma,
        s.emma.person.id,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      w.service.createInvite(
        { email: s.oliver.person.email, roleKey: 'member', sendEmail: false },
        emma,
        s.emma.person.id,
      ),
    ).resolves.toMatchObject({ roleKey: 'member' });
    expect(w.assignments.find((a) => a.orgUserId === s.liam.orgUser.id)?.roleKey).toBe('admin');
  });
});

describe('ownership transfer, more', () => {
  const rows = (id: string) =>
    w.assignments.filter((a) => a.orgUserId === id).map((a) => a.roleKey);

  it('gives the previous owner Member by default', async () => {
    await w.service.transferOwnership(
      { newOwnerOrgUserId: s.liam.orgUser.id },
      await w.actor(s.sarah.orgUser.id),
    );
    expect(rows(s.liam.orgUser.id)).toEqual(['owner']);
    expect(rows(s.sarah.orgUser.id)).toEqual([]);
    expect((await w.actor(s.sarah.orgUser.id)).permissions.roleOn().key).toBe('member');
    expect(w.events.map((e) => e.type)).toContain('organization.ownership.transferred');
  });

  it.each([
    ['giving the new owner the owner value', 1],
    ['giving the previous owner the participant value', 2],
    ['the core transaction', 3],
  ])('completes when the owner repeats it after a failure at %s', async (_, step) => {
    const fail = new Error('down');
    if (step === 1) {
      w.orgAdmin.setMembershipOwner.mockRejectedValueOnce(fail);
    } else if (step === 2) {
      w.orgAdmin.setMembershipOwner.mockResolvedValueOnce(undefined).mockRejectedValueOnce(fail);
    } else {
      vi.spyOn(w.roles, 'lock').mockRejectedValueOnce(fail);
    }
    const input = { newOwnerOrgUserId: s.james.orgUser.id };
    await expect(
      w.service.transferOwnership(input, await w.actor(s.sarah.orgUser.id)),
    ).rejects.toBe(fail);
    expect(rows(s.sarah.orgUser.id)).toEqual(['owner']);
    expect(rows(s.james.orgUser.id)).toEqual([]);
    await w.service.transferOwnership(input, await w.actor(s.sarah.orgUser.id));
    expect(rows(s.james.orgUser.id)).toEqual(['owner']);
    expect(rows(s.sarah.orgUser.id)).toEqual([]);
    expect(w.orgAdmin.setMembershipOwner).toHaveBeenLastCalledWith(ORG, 'ba_sarah', false);
    expect(w.events.filter((e) => e.type === 'organization.ownership.transferred')).toHaveLength(1);
  });
});

describe('Better Auth on role changes', () => {
  it('leaves the membership untouched when roles are set, given or removed', async () => {
    const owner = await w.actor(s.sarah.orgUser.id);
    await w.service.setOrgRole(s.james.orgUser.id, 'instructor', owner);
    await w.service.assignRole(s.emma.orgUser.id, 'cmy_1', 'moderator', owner);
    await w.service.unassignRole(s.emma.orgUser.id, 'cmy_1', owner);
    await w.service.setOrgRole(s.james.orgUser.id, 'member', owner);
    expect(w.orgAdmin.grantMembership).not.toHaveBeenCalled();
    expect(w.orgAdmin.setMembershipOwner).not.toHaveBeenCalled();
    expect(w.orgAdmin.removeMembership).not.toHaveBeenCalled();
  });
});
