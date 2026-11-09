import type {
  ApiKeys,
  AuthOrganization,
  CreateApiKeyInput,
  GrantReader,
  MembersRepository,
  OrgAdmin,
  OrganizationService,
  OrganizationsRepository,
  OrganizationsUnitOfWork,
  OrganizationsWriteScope,
  ResolvedCaller,
  RolesRepository,
  TeamRow,
  TransferOwnershipInput,
} from './ports.js';
import type { Invite, Organization, OrgUser } from './model.js';
import {
  InviteError,
  OrganizationRuleError,
  type AssignmentView,
  type CreateRoleInput,
  type InviteDetails,
  type Member,
  type MembersQuery,
  type Page,
  type RoleView,
  type UpdateRoleInput,
  type ViewerPermissions,
} from './members.js';
import type {
  AcceptInviteInput,
  AddOrgUserInput,
  CreateInviteInput,
  CreateOrganizationInput,
  NewOrganizationInput,
  UpdateOrganizationInput,
} from './types.js';
import { organizationEvents, type OrganizationEvent } from './events.js';
import type { Logger, NewDomainEvent } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';
import type { Mailer } from '../shared/mailer.js';
import { generateInviteToken, hashInviteToken } from '../shared/invite-token.js';
import { ForbiddenError, NotFoundError } from '../shared/errors.js';
import type { Actor, EffectivePermissions } from '../shared/actor.js';
import type { AuthHeaders, IdentityService, SessionAdmin } from '../identity/index.js';
import type { AssetFiles } from '../assets/index.js';
import { genId, prefixId } from '../shared/id.js';
import { levelSchema } from '../types/schemas/organizations.js';
import type {
  ApiKeySummary,
  ConnectedApp,
  ContentType,
  CreatedApiKey,
  Level,
  Permission,
} from '../types/index.js';
import {
  DEFAULT_ROLES,
  MEMBER_ROLE_KEY,
  OWNER_ROLE_KEY,
  validateRoleSet,
  type RoleDefinition,
} from './default-roles.js';
import {
  catalogOf,
  isSystemRole,
  resolveOrgRoles,
  resolveRole,
  type OrgRole,
  type RoleCatalog,
  type StoredOrgRole,
} from './org-roles.js';
import {
  ResolvedPermissions,
  resolvePermissions,
  systemPermissions,
} from './effective-permissions.js';
import {
  ALL_PERMISSIONS,
  fitsLevels,
  permissionAbout,
  permissionList,
  withImplied,
  type PermissionListEntry,
} from './permissions.js';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SYSTEM_ID = 'system';

type NewOrganizationEvent = NewDomainEvent<OrganizationEvent>;

export interface InviteUrls {
  studentPortalUrl: string;
  adminAppUrl: string;
}

export type OrganizationServiceParams = {
  repo: OrganizationsRepository;
  roles: RolesRepository;
  membersRepo: MembersRepository;
  people: IdentityService;
  images: Pick<AssetFiles, 'syncPublicImage'>;
  uow: OrganizationsUnitOfWork;
  orgAdmin: () => OrgAdmin;
  sessions: () => SessionAdmin;
  apiKeys?: () => ApiKeys;
  grants?: () => GrantReader;
  defaultRoles?: readonly RoleDefinition[];
  logger?: Logger;
  mailer?: Pick<Mailer, 'send'>;
  inviteUrls?: InviteUrls;
};

function snapshot(role: OrgRole) {
  return {
    key: role.key,
    name: role.name,
    description: role.description,
    base: role.base,
    levels: role.levels,
    team: role.team,
    permissions: role.permissions,
  };
}

function lockKeys(orgId: string, roleKeys: string[], orgUserIds: string[]): string[] {
  return [
    ...roleKeys.map((key) => `role:${orgId}:${key}`),
    ...orgUserIds.map((id) => `org-user:${orgId}:${id}`),
  ];
}

function roleView(role: OrgRole, holders: number): RoleView {
  return { ...role, holders, givable: role.key !== OWNER_ROLE_KEY };
}

export class OrganizationServiceImpl implements OrganizationService {
  private readonly repo: OrganizationsRepository;
  private readonly roles: RolesRepository;
  private readonly membersRepo: MembersRepository;
  private readonly people: IdentityService;
  private readonly images: Pick<AssetFiles, 'syncPublicImage'>;
  private readonly uow: OrganizationsUnitOfWork;
  private readonly orgAdmin: () => OrgAdmin;
  private readonly sessions: () => SessionAdmin;
  private readonly apiKeysPort?: () => ApiKeys;
  private readonly grants?: () => GrantReader;
  private readonly catalog: RoleCatalog;
  private readonly logger: Logger;
  private readonly mailer?: Pick<Mailer, 'send'>;
  private readonly inviteUrls?: InviteUrls;

  constructor(params: OrganizationServiceParams) {
    this.repo = params.repo;
    this.roles = params.roles;
    this.membersRepo = params.membersRepo;
    this.people = params.people;
    this.images = params.images;
    this.uow = params.uow;
    this.orgAdmin = params.orgAdmin;
    this.sessions = params.sessions;
    this.apiKeysPort = params.apiKeys;
    this.grants = params.grants;
    const defaults = params.defaultRoles ?? DEFAULT_ROLES;
    validateRoleSet(defaults);
    this.catalog = catalogOf(defaults);
    this.logger = params.logger ?? noopLogger;
    this.mailer = params.mailer;
    this.inviteUrls = params.inviteUrls;
  }

  createOrganization(input: NewOrganizationInput, headers: AuthHeaders): Promise<AuthOrganization> {
    return this.orgAdmin().createOrganization(headers, input);
  }

  async provisionOrganization(input: CreateOrganizationInput): Promise<Organization> {
    const created = await this.uow.run(async ({ organizations, roles, outbox }) => {
      const id = genId('organization');
      const org = await organizations.create({
        id,
        externalId: input.externalId ?? id,
        name: input.name ?? 'My Org',
        slug: input.slug ?? '',
        ownerId: input.ownerId,
      });
      const owner = await organizations.createOrgUser({
        orgId: org.id,
        userId: input.ownerId,
        status: 'active',
      });
      await roles.setOrgRole(org.id, owner.id, OWNER_ROLE_KEY, SYSTEM_ID);
      await outbox.append([
        organizationEvents.organizationCreated.make({ orgId: org.id, data: org }),
        organizationEvents.orgUserLinked.make({
          orgId: org.id,
          data: { ...owner, orgRole: { key: OWNER_ROLE_KEY } },
        }),
      ]);
      return org;
    });
    this.logger.info('organization created', { orgId: created.id, slug: created.slug });
    return created;
  }

  async updateOrganization(input: UpdateOrganizationInput, actor: Actor): Promise<Organization> {
    actor.permissions.require('organizations:write');
    const orgId = actor.orgId;
    const org = await this.repo.findById(orgId);
    if (!org) {
      throw new NotFoundError('Organization', orgId);
    }
    if (input.slug !== undefined && input.slug !== org.slug) {
      const taken = await this.repo.findBySlug(input.slug);
      if (taken && taken.id !== orgId) {
        this.logger.warn('organization update refused: slug taken', { orgId, slug: input.slug });
        throw new OrganizationRuleError('That slug is already taken');
      }
    }
    await this.orgAdmin().updateOrganization(org.externalId ?? org.id, input);
    const updated = await this.uow.run(async ({ organizations, outbox }) => {
      const next = await organizations.update(orgId, { name: input.name, slug: input.slug });
      if (!next) {
        throw new NotFoundError('Organization', orgId);
      }
      await outbox.append([
        organizationEvents.organizationUpdated.make({
          orgId,
          data: next,
          metadata: { actorId: actor.id },
        }),
      ]);
      return next;
    });
    this.logger.info('organization updated', { orgId, actorId: actor.id });
    return updated;
  }

  async deleteOrganization(id: string): Promise<Organization> {
    const deleted = await this.uow.run(async ({ organizations, outbox }) => {
      const deleted = await organizations.delete(id);
      await outbox.append([
        organizationEvents.organizationDeleted.make({ orgId: deleted.id, data: deleted }),
      ]);
      return deleted;
    });
    this.logger.info('organization deleted', { orgId: deleted.id });
    return deleted;
  }

  async addOrgUser({ orgId, userId }: AddOrgUserInput): Promise<OrgUser> {
    const existing = await this.repo.findOrgUser(orgId, userId);
    if (existing) {
      return existing;
    }
    const orgUser = await this.uow.run(async ({ organizations, outbox }) => {
      const created = await organizations.createOrgUser({ orgId, userId, status: 'active' });
      await outbox.append([
        organizationEvents.orgUserLinked.make({
          orgId,
          data: { ...created, orgRole: { key: MEMBER_ROLE_KEY } },
        }),
      ]);
      return created;
    });
    this.logger.info('user added to organization', { orgId, userId, orgUserId: orgUser.id });
    return orgUser;
  }

  async removeOrgUser(orgId: string, userId: string): Promise<OrgUser | null> {
    const orgUser = await this.repo.findOrgUser(orgId, userId);
    if (!orgUser) {
      return null;
    }
    return this.deleteOrgUserRow(orgId, orgUser);
  }

  getByExternalId(externalId: string): Promise<Organization | null> {
    return this.repo.findByExternalId(externalId);
  }

  getBySlug(slug: string): Promise<Organization | null> {
    return this.repo.findBySlug(slug);
  }

  getById(id: string): Promise<Organization | null> {
    return this.repo.findById(id);
  }

  async portalIdentity(id: string): Promise<Pick<Organization, 'id' | 'name' | 'slug'>> {
    const org = await this.repo.findById(id);
    if (!org) {
      throw new NotFoundError('Organization', id);
    }
    return { id: org.id, name: org.name, slug: org.slug };
  }

  getOrgUser(orgId: string, userId: string): Promise<OrgUser | null> {
    return this.repo.findOrgUser(orgId, userId);
  }

  getOrgUserById(orgId: string, id: string): Promise<OrgUser | null> {
    return this.repo.findOrgUserById(orgId, id);
  }

  async getOrgUsersByIds(orgId: string, ids: string[]): Promise<OrgUser[]> {
    const unique = [...new Set(ids)];
    return unique.length > 0 ? this.repo.findOrgUsersByIds(orgId, unique) : [];
  }

  getOrgUsersForUser(userId: string): Promise<OrgUser[]> {
    return this.repo.findOrgUsersByUser(userId);
  }

  orgIds(): Promise<string[]> {
    return this.repo.listIds();
  }

  async actorFor(
    orgId: string,
    orgUserId: string,
    tokenScopes?: readonly Permission[],
  ): Promise<Actor | null> {
    const facts = await this.roles.actorFacts(orgId, orgUserId);
    if (!facts || facts.status !== 'active') {
      return null;
    }
    const roles = this.roleMap(facts.storedRoles);
    return {
      id: orgUserId,
      orgId,
      permissions: resolvePermissions({
        assignments: facts.assignments,
        roles,
        ...(tokenScopes !== undefined && { tokenScopes }),
      }),
    };
  }

  async resolveCaller(
    authOrgId: string,
    authUserId: string,
    tokenScopes?: readonly Permission[],
  ): Promise<ResolvedCaller | null> {
    const facts = await this.roles.callerFacts(authOrgId, authUserId);
    if (!facts) {
      return null;
    }
    const orgUser = facts.orgUser;
    return {
      orgId: facts.orgId,
      userId: facts.userId,
      orgUserId: orgUser?.orgUserId ?? null,
      actor:
        orgUser?.status === 'active'
          ? {
              id: orgUser.orgUserId,
              orgId: facts.orgId,
              permissions: resolvePermissions({
                assignments: orgUser.assignments,
                roles: this.roleMap(orgUser.storedRoles),
                ...(tokenScopes !== undefined && { tokenScopes }),
              }),
            }
          : null,
    };
  }

  systemActor(orgId: string): Actor {
    return { id: SYSTEM_ID, orgId, permissions: systemPermissions() };
  }

  async permissionsOfMany(
    orgId: string,
    orgUserIds: string[],
  ): Promise<Map<string, EffectivePermissions>> {
    const unique = [...new Set(orgUserIds)];
    const out = new Map<string, EffectivePermissions>();
    if (unique.length === 0) {
      return out;
    }
    const [stored, assignments] = await Promise.all([
      this.roles.storedRoles(orgId),
      this.roles.assignmentsOfMany(orgId, unique),
    ]);
    const roles = this.roleMap(stored);
    for (const id of unique) {
      out.set(id, resolvePermissions({ assignments: assignments.get(id) ?? [], roles }));
    }
    return out;
  }

  async holders(orgId: string, permission: Permission, on?: string): Promise<string[]> {
    const stored = await this.roles.storedRoles(orgId);
    const keys = resolveOrgRoles(this.catalog, stored)
      .filter((role) => withImplied(role.permissions).has(permission))
      .map((role) => role.key);
    const candidates = await this.roles.holdersOf(orgId, keys, on);
    if (candidates.length === 0) {
      return [];
    }
    const permissions = await this.permissionsOfMany(orgId, candidates);
    return candidates.filter((id) => permissions.get(id)?.has(permission, on) ?? false);
  }

  permissionList(): PermissionListEntry[] {
    return permissionList();
  }

  viewerPermissions(actor: Actor): ViewerPermissions {
    const role = actor.permissions.roleOn();
    if (actor.permissions instanceof ResolvedPermissions) {
      return {
        orgRole: { key: role.key, name: role.name },
        isOwner: actor.permissions.isOwner(),
        org: actor.permissions.orgPermissions(),
        content: actor.permissions.contentPermissions(),
      };
    }
    return {
      orgRole: { key: role.key, name: role.name },
      isOwner: actor.permissions.isOwner(),
      org: ALL_PERMISSIONS.filter((p) => actor.permissions.has(p)),
      content: {},
    };
  }

  async auditRoleKeys(): Promise<number> {
    const usage = await this.roles.roleKeyUsage();
    const storedByOrg = new Map<string, StoredOrgRole[]>();
    let dangling = 0;
    for (const row of usage) {
      if (!storedByOrg.has(row.orgId)) {
        storedByOrg.set(row.orgId, await this.roles.storedRoles(row.orgId));
      }
      const role = this.resolveIn(storedByOrg.get(row.orgId)!, row.roleKey);
      if (!role) {
        dangling += row.count;
        this.logger.warn('assignments name a role the set no longer has', {
          orgId: row.orgId,
          roleKey: row.roleKey,
          level: row.level,
          count: row.count,
        });
      } else if (!role.levels.includes(row.level as Level)) {
        dangling += row.count;
        this.logger.warn('assignments sit at a level their role no longer lists', {
          orgId: row.orgId,
          roleKey: row.roleKey,
          level: row.level,
          count: row.count,
        });
      }
    }
    return dangling;
  }

  async listRoles(actor: Actor): Promise<RoleView[]> {
    actor.permissions.require('roles:read');
    const [stored, counts] = await Promise.all([
      this.roles.storedRoles(actor.orgId),
      this.roles.holderCounts(actor.orgId),
    ]);
    return resolveOrgRoles(this.catalog, stored).map((role) =>
      roleView(role, counts[role.key] ?? 0),
    );
  }

  async getRole(key: string, actor: Actor): Promise<RoleView> {
    actor.permissions.require('roles:read');
    const role = await this.findRole(actor.orgId, key);
    const holders = await this.roles.countHolders(actor.orgId, key);
    return roleView(role, holders);
  }

  async updateRole(key: string, input: UpdateRoleInput, actor: Actor): Promise<RoleView> {
    actor.permissions.require('roles:write');
    const orgId = actor.orgId;
    const changesAccess =
      input.levels !== undefined || input.team !== undefined || input.permissions !== undefined;
    const result = await this.uow.run(async (scope) => {
      const { roles, outbox } = scope;
      await roles.lock(lockKeys(orgId, [key], [actor.id]));
      const editor = await this.relockedActor(scope, actor);
      editor.permissions.require('roles:write');
      const stored = await roles.storedRoles(orgId);
      const current = stored.find((row) => row.key === key);
      const before = this.resolveIn(stored, key);
      if (!before) {
        throw new NotFoundError('Role', key);
      }
      if (changesAccess && isSystemRole(key)) {
        throw new OrganizationRuleError(`${before.name} can only be renamed`);
      }
      if (input.name !== undefined) {
        this.assertUniqueName(stored, key, input.name);
      }
      const next: StoredOrgRole = {
        key,
        name: input.name ?? current?.name ?? null,
        description: input.description ?? current?.description ?? null,
        base: current?.base ?? before.base,
        levels: input.levels ? this.parseLevels(input.levels) : (current?.levels ?? null),
        permissions: { ...(current?.permissions ?? {}), ...(input.permissions ?? {}) },
        team: input.team ?? current?.team ?? null,
      };
      const after = resolveRole(key, this.catalog, next);
      if (!after) {
        throw new NotFoundError('Role', key);
      }
      if (changesAccess) {
        this.assertFits(next);
        this.assertHolds(editor, [...before.permissions, ...after.permissions]);
        await this.assertLevelsNotInUse(roles, orgId, before, after);
      }
      await roles.saveStoredRole(orgId, next);
      await outbox.append([
        organizationEvents.roleUpdated.make({
          orgId,
          data: { key, before: snapshot(before), after: snapshot(after) },
          metadata: { actorId: actor.id },
        }),
      ]);
      return after;
    });
    this.logger.info('role updated', { orgId, roleKey: key, actorId: actor.id });
    return roleView(result, await this.roles.countHolders(orgId, key));
  }

  async createRole(input: CreateRoleInput, actor: Actor): Promise<RoleView> {
    actor.permissions.require('roles:write');
    const orgId = actor.orgId;
    const base = this.catalog.get(input.base);
    if (!base || isSystemRole(input.base)) {
      throw new OrganizationRuleError('A role is added from one of the deployment roles');
    }
    const key = prefixId('role');
    const created = await this.uow.run(async (scope) => {
      const { roles, outbox } = scope;
      await roles.lock(
        lockKeys(orgId, [key, `name:${input.name.trim().toLowerCase()}`], [actor.id]),
      );
      const editor = await this.relockedActor(scope, actor);
      editor.permissions.require('roles:write');
      const stored = await roles.storedRoles(orgId);
      this.assertUniqueName(stored, key, input.name);
      const row: StoredOrgRole = {
        key,
        name: input.name,
        description: input.description ?? null,
        base: input.base,
        levels: input.levels ? this.parseLevels(input.levels) : null,
        permissions: input.permissions ?? {},
        team: input.team ?? null,
      };
      this.assertFits(row);
      const role = resolveRole(key, this.catalog, row)!;
      this.assertHolds(editor, role.permissions);
      await roles.saveStoredRole(orgId, row);
      await outbox.append([
        organizationEvents.roleCreated.make({
          orgId,
          data: { role: snapshot(role) },
          metadata: { actorId: actor.id },
        }),
      ]);
      return role;
    });
    this.logger.info('role created', { orgId, roleKey: key, actorId: actor.id });
    return roleView(created, 0);
  }

  async resetRole(key: string, actor: Actor): Promise<RoleView> {
    actor.permissions.require('roles:write');
    const orgId = actor.orgId;
    if (!this.catalog.has(key)) {
      throw new OrganizationRuleError('Only a deployment role can be reset');
    }
    const result = await this.uow.run(async (scope) => {
      const { roles, outbox } = scope;
      await roles.lock(lockKeys(orgId, [key], [actor.id]));
      const editor = await this.relockedActor(scope, actor);
      editor.permissions.require('roles:write');
      const stored = await roles.storedRoles(orgId);
      const before = this.resolveIn(stored, key);
      const after = resolveRole(key, this.catalog, undefined);
      if (!before || !after) {
        throw new NotFoundError('Role', key);
      }
      this.assertUniqueName(
        stored.filter((row) => row.key !== key),
        key,
        after.name,
      );
      this.assertHolds(editor, [...before.permissions, ...after.permissions]);
      await this.assertLevelsNotInUse(roles, orgId, before, after);
      await roles.deleteStoredRole(orgId, key);
      await outbox.append([
        organizationEvents.roleUpdated.make({
          orgId,
          data: { key, before: snapshot(before), after: snapshot(after) },
          metadata: { actorId: actor.id },
        }),
      ]);
      return after;
    });
    this.logger.info('role reset', { orgId, roleKey: key, actorId: actor.id });
    return roleView(result, await this.roles.countHolders(orgId, key));
  }

  async deleteRole(key: string, actor: Actor): Promise<void> {
    actor.permissions.require('roles:delete');
    const orgId = actor.orgId;
    if (this.catalog.has(key)) {
      throw new OrganizationRuleError('A deployment role can be renamed and reset, not deleted');
    }
    await this.uow.run(async (scope) => {
      const { roles, outbox } = scope;
      await roles.lock(lockKeys(orgId, [key], [actor.id]));
      (await this.relockedActor(scope, actor)).permissions.require('roles:delete');
      const holders = await roles.countHolders(orgId, key);
      if (holders > 0) {
        this.logger.warn('role deletion refused: role is held', { orgId, roleKey: key, holders });
        throw new OrganizationRuleError(
          `This role is held by ${holders} ${holders === 1 ? 'person' : 'people'}`,
        );
      }
      const deleted = await roles.deleteStoredRole(orgId, key);
      if (!deleted) {
        throw new NotFoundError('Role', key);
      }
      await outbox.append([
        organizationEvents.roleDeleted.make({
          orgId,
          data: { key },
          metadata: { actorId: actor.id },
        }),
      ]);
    });
    this.logger.info('role deleted', { orgId, roleKey: key, actorId: actor.id });
  }

  async listTeam(query: MembersQuery, actor: Actor): Promise<Page<Member>> {
    actor.permissions.require('people:read');
    const orgId = actor.orgId;
    const [rows, stored] = await Promise.all([
      this.membersRepo.teamRows(orgId, MEMBER_ROLE_KEY),
      this.roles.storedRoles(orgId),
    ]);
    const roles = this.roleMap(stored);
    const nameOf = (key: string): string => roles.get(key)?.name ?? key;
    let members = rows.map((row) => this.toMember(row, nameOf));
    if (query.roleKey) {
      members = members.filter(
        (m) => m.orgRole.key === query.roleKey || m.items.some((i) => i.roleKey === query.roleKey),
      );
    }
    if (query.status) {
      members = members.filter((m) => m.status === query.status);
    }
    const q = query.search?.trim().toLowerCase();
    if (q) {
      members = members.filter((m) =>
        [m.firstName, m.lastName, m.email].some((v) => v?.toLowerCase().includes(q)),
      );
    }
    const sort = query.sort;
    const desc = sort?.startsWith('-') ?? false;
    const key = desc ? sort!.slice(1) : sort;
    const byName = (a: string | null, b: string | null): number =>
      a === b ? 0 : a === null ? 1 : b === null ? -1 : a.localeCompare(b);
    members.sort((a, b) => {
      const cmp =
        key === 'email'
          ? a.email.localeCompare(b.email)
          : key === 'role'
            ? a.orgRole.name.localeCompare(b.orgRole.name)
            : key === 'lastName'
              ? byName(a.lastName, b.lastName) || byName(a.firstName, b.firstName)
              : byName(a.firstName, b.firstName) || byName(a.lastName, b.lastName);
      return desc ? -cmp : cmp;
    });
    const start = (query.page - 1) * query.pageSize;
    return {
      rows: members.slice(start, start + query.pageSize),
      total: members.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async listAssignments(orgUserId: string, actor: Actor): Promise<AssignmentView[]> {
    actor.permissions.require('people:read');
    return this.assignmentViews(actor.orgId, orgUserId);
  }

  async listAssignmentsOn(contentId: string, actor: Actor): Promise<AssignmentView[]> {
    actor.permissions.require('people:read');
    const [rows, stored] = await Promise.all([
      this.roles.assignmentsOn(actor.orgId, contentId),
      this.roles.storedRoles(actor.orgId),
    ]);
    const roles = this.roleMap(stored);
    return rows.map((row) => ({
      orgUserId: row.orgUserId,
      roleKey: row.roleKey,
      roleName: roles.get(row.roleKey)?.name ?? row.roleKey,
      contentId: row.contentId,
      contentType: row.contentType,
    }));
  }

  async setOrgRole(orgUserId: string, roleKey: string, actor: Actor): Promise<AssignmentView[]> {
    actor.permissions.require('people:write');
    const orgId = actor.orgId;
    this.assertNotSelf(actor, orgUserId);
    const seen = (await this.roles.assignmentsOf(orgId, orgUserId)).find(
      (row) => row.contentId === null,
    );
    const target = await this.repo.findOrgUserById(orgId, orgUserId);
    const invitee =
      target?.status === 'invited' ? await this.people.getUserById(target.userId) : null;
    await this.uow.run(async (scope) => {
      const { roles, organizations, outbox } = scope;
      await roles.lock(
        lockKeys(orgId, [roleKey, seen?.roleKey ?? MEMBER_ROLE_KEY], [orgUserId, actor.id]),
      );
      const editor = await this.relockedActor(scope, actor);
      editor.permissions.require('people:write');
      const orgUser = await organizations.findOrgUserById(orgId, orgUserId);
      if (!orgUser) {
        throw new NotFoundError('Person', orgUserId);
      }
      const stored = await roles.storedRoles(orgId);
      const next = this.resolveIn(stored, roleKey);
      if (!next) {
        throw new NotFoundError('Role', roleKey);
      }
      if (roleKey === OWNER_ROLE_KEY) {
        throw new OrganizationRuleError('Ownership moves only by transfer');
      }
      if (!next.levels.includes('org')) {
        throw new OrganizationRuleError(`${next.name} can't be given on the organization`);
      }
      const current = (await roles.assignmentsOf(orgId, orgUserId)).find(
        (row) => row.contentId === null,
      );
      if (current?.roleKey === OWNER_ROLE_KEY) {
        this.logger.warn('org role change refused: target is the owner', { orgId, orgUserId });
        throw new OrganizationRuleError("The owner's role changes only by transfer");
      }
      if (orgUser.status === 'invited') {
        const person = invitee?.id === orgUser.userId ? invitee : null;
        const pending = person ? await organizations.findPendingInvite(orgId, person.email) : null;
        if (!pending) {
          throw new NotFoundError('Invite', orgUserId);
        }
        const invited = this.resolveIn(stored, pending.roleKey);
        this.assertHolds(editor, [...(invited?.permissions ?? []), ...next.permissions]);
        const editorUser = await organizations.findOrgUserById(orgId, actor.id);
        if (!editorUser) {
          throw new ForbiddenError('You are no longer an active member of this organization');
        }
        await organizations.setInviteRole(orgId, pending.id, roleKey, editorUser.userId);
        this.logger.info('pending invite role changed', {
          orgId,
          orgUserId,
          inviteId: pending.id,
          roleKey,
          actorId: actor.id,
        });
        return;
      }
      const previousKey = current?.roleKey ?? MEMBER_ROLE_KEY;
      const previous = this.resolveIn(stored, previousKey);
      this.assertHolds(editor, [...(previous?.permissions ?? []), ...next.permissions]);
      await roles.setOrgRole(
        orgId,
        orgUserId,
        roleKey === MEMBER_ROLE_KEY ? null : roleKey,
        actor.id,
      );
      if (previousKey !== roleKey) {
        await outbox.append([
          organizationEvents.roleAssigned.make({
            orgId,
            data: {
              orgUserId,
              roleKey,
              contentId: null,
              contentType: null,
              previousRoleKey: previousKey,
            },
            metadata: { actorId: actor.id },
          }),
        ]);
      }
      this.logger.info('org role set', { orgId, orgUserId, roleKey, actorId: actor.id });
    });
    return this.assignmentViews(orgId, orgUserId);
  }

  async assignRole(
    orgUserId: string,
    contentId: string,
    roleKey: string,
    actor: Actor,
  ): Promise<AssignmentView[]> {
    actor.permissions.require('people:write');
    const orgId = actor.orgId;
    this.assertNotSelf(actor, orgUserId);
    const seen = (await this.roles.assignmentsOf(orgId, orgUserId)).find(
      (row) => row.contentId === contentId,
    );
    await this.uow.run(async (scope) => {
      const { roles, organizations, outbox } = scope;
      await roles.lock(
        lockKeys(orgId, [roleKey, ...(seen ? [seen.roleKey] : [])], [orgUserId, actor.id]),
      );
      const editor = await this.relockedActor(scope, actor);
      editor.permissions.require('people:write');
      const orgUser = await organizations.findOrgUserById(orgId, orgUserId);
      if (!orgUser) {
        throw new NotFoundError('Person', orgUserId);
      }
      const contentType = await roles.contentTypeOf(orgId, contentId);
      if (!contentType) {
        throw new NotFoundError('Content', contentId);
      }
      const stored = await roles.storedRoles(orgId);
      const next = this.resolveIn(stored, roleKey);
      if (!next) {
        throw new NotFoundError('Role', roleKey);
      }
      if (isSystemRole(roleKey) || !next.levels.includes(contentType)) {
        this.logger.warn('role assignment refused: level not listed', {
          orgId,
          roleKey,
          contentType,
        });
        throw new OrganizationRuleError(`${next.name} can't be given on a ${contentType}`);
      }
      const current = (await roles.assignmentsOf(orgId, orgUserId)).find(
        (row) => row.contentId === contentId,
      );
      const previous = current ? this.resolveIn(stored, current.roleKey) : null;
      this.assertHoldsOn(
        editor,
        [
          ...this.itemPermissions(previous, contentType),
          ...this.itemPermissions(next, contentType),
        ],
        contentId,
      );
      await roles.setItemRole(orgId, orgUserId, contentId, contentType, roleKey, actor.id);
      if (current?.roleKey !== roleKey) {
        await outbox.append([
          organizationEvents.roleAssigned.make({
            orgId,
            data: {
              orgUserId,
              roleKey,
              contentId,
              contentType,
              previousRoleKey: current?.roleKey ?? null,
            },
            metadata: { actorId: actor.id },
          }),
        ]);
      }
    });
    this.logger.info('item role given', {
      orgId,
      orgUserId,
      contentId,
      roleKey,
      actorId: actor.id,
    });
    return this.assignmentViews(orgId, orgUserId);
  }

  async unassignRole(
    orgUserId: string,
    contentId: string,
    actor: Actor,
  ): Promise<AssignmentView[]> {
    actor.permissions.require('people:write');
    const orgId = actor.orgId;
    this.assertNotSelf(actor, orgUserId);
    const seen = (await this.roles.assignmentsOf(orgId, orgUserId)).find(
      (row) => row.contentId === contentId,
    );
    await this.uow.run(async (scope) => {
      const { roles, outbox } = scope;
      await roles.lock(lockKeys(orgId, seen ? [seen.roleKey] : [], [orgUserId, actor.id]));
      const current = (await roles.assignmentsOf(orgId, orgUserId)).find(
        (row) => row.contentId === contentId,
      );
      if (!current || !current.contentType) {
        throw new NotFoundError('Role assignment', contentId);
      }
      const editor = await this.relockedActor(scope, actor);
      editor.permissions.require('people:write');
      const stored = await roles.storedRoles(orgId);
      const role = this.resolveIn(stored, current.roleKey);
      this.assertHoldsOn(editor, this.itemPermissions(role, current.contentType), contentId);
      const removed = await roles.removeItemRole(orgId, orgUserId, contentId);
      if (removed) {
        await outbox.append([
          organizationEvents.roleUnassigned.make({
            orgId,
            data: {
              orgUserId,
              roleKey: removed.roleKey,
              contentId,
              contentType: current.contentType,
            },
            metadata: { actorId: actor.id },
          }),
        ]);
      }
    });
    this.logger.info('item role removed', {
      orgId,
      orgUserId,
      contentId,
      actorId: actor.id,
    });
    return this.assignmentViews(orgId, orgUserId);
  }

  async removePerson(orgUserId: string, actor: Actor): Promise<void> {
    actor.permissions.require('people:delete');
    const orgId = actor.orgId;
    this.assertNotSelf(actor, orgUserId);
    const orgUser = await this.repo.findOrgUserById(orgId, orgUserId);
    if (!orgUser) {
      throw new NotFoundError('Person', orgUserId);
    }
    const person = await this.people.getUserById(orgUser.userId);
    await this.uow.run(async (scope) => {
      const { roles } = scope;
      await roles.lock(lockKeys(orgId, [], [orgUserId, actor.id]));
      const editor = await this.relockedActor(scope, actor);
      editor.permissions.require('people:delete');
      const held = await roles.assignmentsOf(orgId, orgUserId);
      if (held.some((row) => row.roleKey === OWNER_ROLE_KEY)) {
        this.logger.warn('removal refused: target is the owner', { orgId, orgUserId });
        throw new OrganizationRuleError('The owner cannot be removed');
      }
      const stored = await roles.storedRoles(orgId);
      for (const row of held) {
        const role = this.resolveIn(stored, row.roleKey);
        if (!role) {
          continue;
        }
        if (row.contentId === null) {
          this.assertHolds(editor, role.permissions);
        } else if (row.contentType) {
          this.assertHoldsOn(editor, this.itemPermissions(role, row.contentType), row.contentId);
        }
      }
      await this.deleteOrgUserIn(scope, orgId, orgUser, held, actor.id);
    });
    this.logger.info('person removed', { orgId, orgUserId, actorId: actor.id });
    await this.cleanUpAfterRemoval(orgId, orgUserId, person);
  }

  async transferOwnership(input: TransferOwnershipInput, actor: Actor): Promise<void> {
    if (!actor.permissions.isOwner()) {
      this.logger.warn('ownership transfer refused: caller is not the owner', {
        orgId: actor.orgId,
        actorId: actor.id,
      });
      throw new ForbiddenError('Only the owner can transfer ownership');
    }
    const orgId = actor.orgId;
    const previousRoleKey = input.previousOwnerRoleKey ?? MEMBER_ROLE_KEY;
    if (input.newOwnerOrgUserId === actor.id) {
      throw new OrganizationRuleError('You already own this organization');
    }
    const stored = await this.roles.storedRoles(orgId);
    const previousRole = this.resolveIn(stored, previousRoleKey);
    if (
      !previousRole ||
      previousRoleKey === OWNER_ROLE_KEY ||
      !previousRole.levels.includes('org')
    ) {
      throw new OrganizationRuleError('The previous owner needs a role given on the organization');
    }
    const [org, newOwner, previousOwner] = await Promise.all([
      this.repo.findById(orgId),
      this.repo.findOrgUserById(orgId, input.newOwnerOrgUserId),
      this.repo.findOrgUserById(orgId, actor.id),
    ]);
    if (!org || !previousOwner) {
      throw new NotFoundError('Organization', orgId);
    }
    if (!newOwner || newOwner.status !== 'active') {
      throw new OrganizationRuleError('The new owner must be an active member of the organization');
    }
    const [newPerson, previousPerson] = await Promise.all([
      this.people.getUserById(newOwner.userId),
      this.people.getUserById(previousOwner.userId),
    ]);
    if (!newPerson?.externalId || !previousPerson?.externalId) {
      throw new OrganizationRuleError('Both people need an account');
    }
    const orgExternalId = org.externalId ?? org.id;
    await this.orgAdmin().setMembershipOwner(orgExternalId, newPerson.externalId, true);
    await this.orgAdmin().setMembershipOwner(orgExternalId, previousPerson.externalId, false);
    await this.uow.run(async ({ roles, outbox }) => {
      await roles.lock(
        lockKeys(orgId, [OWNER_ROLE_KEY, previousRoleKey], [newOwner.id, previousOwner.id]),
      );
      const owner = await roles.ownerOrgUserId(orgId);
      if (owner !== previousOwner.id) {
        throw new ForbiddenError('Only the owner can transfer ownership');
      }
      await roles.setOrgRole(orgId, newOwner.id, null, actor.id);
      await roles.setOrgRole(
        orgId,
        previousOwner.id,
        previousRoleKey === MEMBER_ROLE_KEY ? null : previousRoleKey,
        actor.id,
      );
      await roles.setOrgRole(orgId, newOwner.id, OWNER_ROLE_KEY, actor.id);
      await outbox.append([
        organizationEvents.ownershipTransferred.make({
          orgId,
          data: { previousOwnerOrgUserId: previousOwner.id, newOwnerOrgUserId: newOwner.id },
          metadata: { actorId: actor.id },
        }),
      ]);
    });
    this.logger.info('ownership transferred', {
      orgId,
      previousOwnerOrgUserId: previousOwner.id,
      newOwnerOrgUserId: newOwner.id,
    });
  }

  async createInvite(
    input: CreateInviteInput,
    actor: Actor,
    inviterUserId: string,
  ): Promise<Invite> {
    actor.permissions.require('people:write');
    const orgId = actor.orgId;
    const roleKey = input.roleKey ?? MEMBER_ROLE_KEY;
    const email = input.email;
    if (roleKey === OWNER_ROLE_KEY) {
      this.logger.warn('invite refused: ownership cannot be granted', { orgId });
      throw new OrganizationRuleError('Ownership moves only by transfer');
    }
    const stored = await this.roles.storedRoles(orgId);
    const role = this.resolveIn(stored, roleKey);
    if (!role) {
      throw new NotFoundError('Role', roleKey);
    }
    if (!role.levels.includes('org')) {
      throw new OrganizationRuleError(`${role.name} can't be given on the organization`);
    }
    this.assertHolds(actor, role.permissions);
    const known = await this.people.getUserByEmail(email);
    const existing = known ? await this.repo.findOrgUser(orgId, known.id) : null;
    if (existing?.id === actor.id) {
      this.logger.warn('invite refused: inviting yourself', { orgId, actorId: actor.id });
      throw new ForbiddenError("You can't change your own roles");
    }
    let contributed = role.permissions;
    if (existing) {
      const held = await this.roles.assignmentsOf(orgId, existing.id);
      const current = held.find((row) => row.contentId === null);
      if (current?.roleKey === OWNER_ROLE_KEY) {
        this.logger.warn('invite refused: target is the owner', { orgId });
        throw new OrganizationRuleError('The owner cannot be invited');
      }
      const currentRole = this.resolveIn(stored, current?.roleKey ?? MEMBER_ROLE_KEY);
      contributed = [...contributed, ...(currentRole?.permissions ?? [])];
    }
    this.assertHolds(actor, contributed);
    const person =
      known ??
      (await this.people.createUser({
        email,
        ...(input.firstName !== undefined && { firstName: input.firstName }),
        ...(input.lastName !== undefined && { lastName: input.lastName }),
      }));
    const sendEmail = input.sendEmail ?? true;
    const { token, tokenHash } = generateInviteToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const invite = await this.uow.run(async ({ organizations, outbox }) => {
      const events: NewOrganizationEvent[] = [];
      if (!existing) {
        const orgUser = await organizations.createOrgUser({
          orgId,
          userId: person.id,
          status: 'invited',
        });
        events.push(
          roleKey === MEMBER_ROLE_KEY
            ? organizationEvents.studentCreated.make({ orgId, data: orgUser })
            : organizationEvents.orgUserLinked.make({
                orgId,
                data: { ...orgUser, orgRole: { key: MEMBER_ROLE_KEY } },
              }),
        );
      }
      const row = await organizations.upsertPendingInvite(orgId, {
        email,
        roleKey,
        invitedBy: inviterUserId,
        tokenHash,
        expiresAt,
      });
      events.push(
        organizationEvents.inviteCreated.make({
          orgId,
          data: row,
          metadata: { actorId: actor.id },
        }),
      );
      await outbox.append(events);
      return row;
    });
    if (sendEmail) {
      try {
        await this.sendInviteEmail(invite, token, role);
      } catch (err) {
        this.logger.error('failed to send invite email', {
          orgId,
          inviteId: invite.id,
          roleKey,
          err: err instanceof Error ? err : new Error(String(err)),
        });
      }
    }
    this.logger.info('invite created', {
      orgId,
      inviteId: invite.id,
      roleKey,
      sendEmail,
      actorId: actor.id,
    });
    return invite;
  }

  async resendInvite(orgUserId: string, actor: Actor, inviterUserId: string): Promise<void> {
    actor.permissions.require('people:write');
    const orgId = actor.orgId;
    const { invite, role } = await this.pendingInviteOf(orgId, orgUserId);
    this.assertHolds(actor, role.permissions);
    const { token, tokenHash } = generateInviteToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const refreshed = await this.repo.setInviteToken(
      orgId,
      invite.id,
      tokenHash,
      expiresAt,
      inviterUserId,
    );
    if (!refreshed) {
      throw new NotFoundError('Invite', invite.id);
    }
    await this.sendInviteEmail(refreshed, token, role);
    this.logger.info('invite resent', {
      orgId,
      orgUserId,
      inviteId: invite.id,
      actorId: actor.id,
    });
  }

  async cancelInvite(orgUserId: string, actor: Actor): Promise<void> {
    actor.permissions.require('people:write');
    const orgId = actor.orgId;
    const { invite, role, orgUser } = await this.pendingInviteOf(orgId, orgUserId);
    this.assertHolds(actor, role.permissions);
    const held = await this.roles.assignmentsOf(orgId, orgUserId);
    const holdsGrant = this.grants ? await this.grants().holdsAnyGrant(orgId, orgUserId) : true;
    await this.uow.run(async (scope) => {
      const canceled = await scope.organizations.setInviteStatus(orgId, invite.id, 'canceled');
      if (!canceled) {
        throw new NotFoundError('Invite', invite.id);
      }
      await scope.outbox.append([
        organizationEvents.inviteCanceled.make({
          orgId,
          data: canceled,
          metadata: { actorId: actor.id },
        }),
      ]);
      if (orgUser.status === 'invited' && held.length === 0 && !holdsGrant) {
        await this.deleteOrgUserIn(scope, orgId, orgUser, held, actor.id);
      }
    });
    this.logger.info('invite canceled', {
      orgId,
      orgUserId,
      inviteId: invite.id,
      actorId: actor.id,
    });
  }

  async peekInvite(token: string): Promise<Invite | null> {
    const invite = await this.repo.findInviteByTokenHash(hashInviteToken(token));
    if (!invite || invite.status !== 'pending') {
      return null;
    }
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return null;
    }
    return invite;
  }

  async describeInvite(token: string): Promise<InviteDetails> {
    const invite = await this.peekInvite(token);
    if (!invite) {
      throw new NotFoundError('Invite', 'token');
    }
    const person = await this.people.getUserByEmail(invite.email);
    return {
      email: invite.email,
      firstName: person?.firstName ?? null,
      lastName: person?.lastName ?? null,
    };
  }

  async acceptInvite(input: AcceptInviteInput, headers: AuthHeaders): Promise<OrgUser> {
    const invite = await this.peekInvite(input.token);
    if (!invite) {
      this.logger.warn('invite accept refused: token invalid or expired');
      throw new InviteError('invalid invite');
    }
    if (invite.email.toLowerCase() !== input.email.toLowerCase()) {
      this.logger.warn('invite accept refused: email mismatch', {
        orgId: invite.orgId,
        inviteId: invite.id,
      });
      throw new InviteError('emails must match');
    }
    const orgId = invite.orgId;
    const org = await this.repo.findById(orgId);
    if (!org) {
      throw new InviteError('Org not found');
    }
    const person = await this.people.getUserByExternalId(input.authUserId);
    if (!person?.externalId) {
      throw new NotFoundError('User', input.authUserId);
    }
    const orgUser = await this.repo.findOrgUser(orgId, person.id);
    if (!orgUser) {
      throw new NotFoundError('Person', person.id);
    }
    const inviter = await this.repo.findOrgUser(orgId, invite.invitedBy);
    if (!inviter) {
      this.logger.warn('invite accept refused: inviter left', { orgId, inviteId: invite.id });
      throw new InviteError('This invitation is no longer valid; ask for a new one');
    }
    await this.uow.run((scope) => this.checkAcceptance(scope, invite, orgUser, inviter.id));
    await this.orgAdmin().grantMembership(org.externalId ?? org.id, person.externalId);
    const accepted = await this.uow.run(async (scope) => {
      const { organizations, roles, outbox } = scope;
      const seen = (await roles.assignmentsOf(orgId, orgUser.id)).find(
        (row) => row.contentId === null,
      );
      await roles.lock(
        lockKeys(
          orgId,
          [invite.roleKey, seen?.roleKey ?? MEMBER_ROLE_KEY],
          [orgUser.id, inviter.id],
        ),
      );
      const previousKey = await this.checkAcceptance(scope, invite, orgUser, inviter.id);
      const activated =
        orgUser.status === 'active'
          ? orgUser
          : await organizations.updateOrgUser(orgId, orgUser.id, { status: 'active' });
      if (!activated) {
        throw new NotFoundError('Person', orgUser.id);
      }
      const acceptedInvite = await organizations.setInviteStatus(orgId, invite.id, 'accepted');
      if (!acceptedInvite) {
        throw new NotFoundError('Invite', invite.id);
      }
      await roles.setOrgRole(
        orgId,
        orgUser.id,
        invite.roleKey === MEMBER_ROLE_KEY ? null : invite.roleKey,
        inviter.id,
      );
      const events: NewOrganizationEvent[] = [
        organizationEvents.inviteAccepted.make({ orgId, data: acceptedInvite }),
      ];
      if (orgUser.status !== 'active') {
        events.push(
          organizationEvents.orgUserUpdated.make({
            orgId,
            data: { ...activated, orgRole: { key: invite.roleKey } },
          }),
        );
        if (invite.roleKey === MEMBER_ROLE_KEY) {
          events.push(organizationEvents.studentLinked.make({ orgId, data: activated }));
        }
      }
      if (previousKey !== invite.roleKey) {
        events.push(
          organizationEvents.roleAssigned.make({
            orgId,
            data: {
              orgUserId: orgUser.id,
              roleKey: invite.roleKey,
              contentId: null,
              contentType: null,
              previousRoleKey: previousKey,
            },
            metadata: { actorId: inviter.id },
          }),
        );
      }
      await outbox.append(events);
      return activated;
    });
    await this.sessions().stampActiveOrganization(headers, orgId);
    this.logger.info('invite accepted', { orgId, inviteId: invite.id, orgUserId: orgUser.id });
    return accepted;
  }

  private async checkAcceptance(
    scope: OrganizationsWriteScope,
    invite: Invite,
    orgUser: OrgUser,
    inviterOrgUserId: string,
  ): Promise<string> {
    const orgId = invite.orgId;
    const stored = await scope.roles.storedRoles(orgId);
    const role = this.resolveIn(stored, invite.roleKey);
    if (!role || invite.roleKey === OWNER_ROLE_KEY) {
      throw new InviteError('The invited role no longer exists');
    }
    const current = (await scope.roles.assignmentsOf(orgId, orgUser.id)).find(
      (row) => row.contentId === null,
    );
    if (current?.roleKey === OWNER_ROLE_KEY) {
      throw new InviteError("The owner's role changes only by transfer");
    }
    const currentRole = this.resolveIn(stored, current?.roleKey ?? MEMBER_ROLE_KEY);
    const facts = await scope.roles.actorFacts(orgId, inviterOrgUserId);
    const inviter =
      facts && facts.status === 'active'
        ? resolvePermissions({
            assignments: facts.assignments,
            roles: this.roleMap(facts.storedRoles),
          })
        : null;
    const needed: Permission[] = [
      'people:write',
      ...role.permissions,
      ...(currentRole?.permissions ?? []),
    ];
    const missing = inviter ? needed.filter((p) => !inviter.has(p)) : needed;
    if (missing.length > 0) {
      this.logger.warn('invite accept refused: inviter no longer holds the role', {
        orgId,
        inviteId: invite.id,
        inviterOrgUserId,
        missing,
      });
      throw new InviteError('This invitation is no longer valid; ask for a new one');
    }
    return current?.roleKey ?? MEMBER_ROLE_KEY;
  }

  async listApiKeys(actor: Actor): Promise<ApiKeySummary[]> {
    actor.permissions.require('api_keys:read');
    const { orgExternalId, userExternalId } = await this.externalIdsOf(actor);
    return this.apiKeys().list(orgExternalId, userExternalId);
  }

  async createApiKey(input: CreateApiKeyInput, actor: Actor): Promise<CreatedApiKey> {
    actor.permissions.require('api_keys:write');
    const missing = input.scopes.filter((scope) => !actor.permissions.anywhere(scope));
    if (missing.length > 0) {
      this.logger.warn('api key refused: scopes not held', {
        orgId: actor.orgId,
        actorId: actor.id,
        missing,
      });
      throw new ForbiddenError(`You don't hold ${missing.join(', ')}`);
    }
    const { orgExternalId, userExternalId } = await this.externalIdsOf(actor);
    const created = await this.apiKeys().create(
      orgExternalId,
      userExternalId,
      input.name,
      input.scopes,
    );
    this.logger.info('api key created', {
      orgId: actor.orgId,
      actorId: actor.id,
      keyId: created.id,
    });
    return created;
  }

  async deleteApiKey(keyId: string, actor: Actor): Promise<void> {
    actor.permissions.require('api_keys:delete');
    const { orgExternalId, userExternalId } = await this.externalIdsOf(actor);
    await this.apiKeys().revoke(orgExternalId, userExternalId, keyId);
    this.logger.info('api key revoked', { orgId: actor.orgId, actorId: actor.id, keyId });
  }

  async listConnectedApps(actor: Actor): Promise<ConnectedApp[]> {
    const { orgExternalId, userExternalId } = await this.externalIdsOf(actor);
    return this.apiKeys().listApps(orgExternalId, userExternalId);
  }

  async revokeConnectedApp(clientId: string, actor: Actor): Promise<void> {
    const { orgExternalId, userExternalId } = await this.externalIdsOf(actor);
    await this.apiKeys().revokeApp(orgExternalId, userExternalId, clientId);
    this.logger.info('connected app revoked', {
      orgId: actor.orgId,
      actorId: actor.id,
      clientId,
    });
  }

  private async cleanUpAfterRemoval(
    orgId: string,
    orgUserId: string,
    person: { email: string; externalId: string | null } | null,
  ): Promise<void> {
    const steps: Array<[string, () => Promise<unknown>]> = [];
    const org = await this.repo.findById(orgId);
    if (person?.externalId && org) {
      const orgExternalId = org.externalId ?? org.id;
      const userExternalId = person.externalId;
      steps.push([
        'membership',
        () => this.orgAdmin().removeMembership(orgExternalId, userExternalId),
      ]);
      steps.push([
        'api keys and tokens',
        () => this.apiKeys().revokeAllFor(orgExternalId, userExternalId),
      ]);
    }
    steps.push(['profile photo', () => this.images.syncPublicImage(orgId, orgUserId, null)]);
    if (person) {
      steps.push([
        'pending invite',
        async () => {
          const pending = await this.repo.findPendingInvite(orgId, person.email);
          if (pending) {
            await this.repo.setInviteStatus(orgId, pending.id, 'canceled');
          }
        },
      ]);
    }
    for (const [step, run] of steps) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await run();
          break;
        } catch (err) {
          this.logger.error('cleanup after removal failed', {
            orgId,
            orgUserId,
            step,
            attempt,
            err: err instanceof Error ? err : new Error(String(err)),
          });
        }
      }
    }
  }

  private apiKeys(): ApiKeys {
    if (!this.apiKeysPort) {
      throw new Error('api keys are not configured');
    }
    return this.apiKeysPort();
  }

  private async externalIdsOf(
    actor: Actor,
  ): Promise<{ orgExternalId: string; userExternalId: string }> {
    const [org, orgUser] = await Promise.all([
      this.repo.findById(actor.orgId),
      this.repo.findOrgUserById(actor.orgId, actor.id),
    ]);
    if (!org || !orgUser) {
      throw new NotFoundError('Person', actor.id);
    }
    const person = await this.people.getUserById(orgUser.userId);
    if (!person?.externalId) {
      throw new NotFoundError('User', orgUser.userId);
    }
    return { orgExternalId: org.externalId ?? org.id, userExternalId: person.externalId };
  }

  private async pendingInviteOf(
    orgId: string,
    orgUserId: string,
  ): Promise<{ invite: Invite; role: OrgRole; orgUser: OrgUser }> {
    const orgUser = await this.repo.findOrgUserById(orgId, orgUserId);
    if (!orgUser) {
      throw new NotFoundError('Person', orgUserId);
    }
    const person = await this.people.getUserById(orgUser.userId);
    const invite = person ? await this.repo.findPendingInvite(orgId, person.email) : null;
    if (!invite) {
      throw new NotFoundError('Invite', orgUserId);
    }
    const stored = await this.roles.storedRoles(orgId);
    const role = this.resolveIn(stored, invite.roleKey);
    if (!role) {
      throw new NotFoundError('Role', invite.roleKey);
    }
    return { invite, role, orgUser };
  }

  private async deleteOrgUserRow(orgId: string, orgUser: OrgUser): Promise<OrgUser | null> {
    const held = await this.roles.assignmentsOf(orgId, orgUser.id);
    return this.uow.run((scope) => this.deleteOrgUserIn(scope, orgId, orgUser, held, SYSTEM_ID));
  }

  private async deleteOrgUserIn(
    scope: OrganizationsWriteScope,
    orgId: string,
    orgUser: OrgUser,
    held: { roleKey: string; contentId: string | null }[],
    actorId: string,
  ): Promise<OrgUser | null> {
    const orgRoleKey = held.find((row) => row.contentId === null)?.roleKey ?? MEMBER_ROLE_KEY;
    const deleted = await scope.organizations.deleteOrgUser(orgId, orgUser.id);
    if (!deleted) {
      return null;
    }
    const events: NewOrganizationEvent[] = [
      organizationEvents.orgUserDeleted.make({
        orgId,
        data: { ...deleted, orgRole: { key: orgRoleKey } },
        metadata: { actorId },
      }),
    ];
    if (orgRoleKey === MEMBER_ROLE_KEY) {
      events.push(organizationEvents.studentDeleted.make({ orgId, data: deleted }));
    }
    await scope.outbox.append(events);
    return deleted;
  }

  private async sendInviteEmail(invite: Invite, token: string, role: OrgRole): Promise<void> {
    if (!this.mailer || !this.inviteUrls) {
      throw new Error('invite delivery is not configured (mailer / invite urls missing)');
    }
    const learner = role.permissions.length === 0;
    const base = learner
      ? `${this.inviteUrls.studentPortalUrl}/welcome`
      : `${this.inviteUrls.adminAppUrl}/invite`;
    const query = learner
      ? new URLSearchParams({ token })
      : new URLSearchParams({ token, email: invite.email });
    const inviteUrl = `${base}?${query.toString()}`;
    if (learner) {
      await this.mailer.send(invite.email, 'studentInvite', {
        inviteUrl,
        studentName: invite.email,
      });
    } else {
      await this.mailer.send(invite.email, 'memberInvite', {
        inviteUrl,
        inviterName: 'Your team',
        role: role.name,
      });
    }
  }

  private toMember(row: TeamRow, nameOf: (key: string) => string): Member {
    const orgRoleKey =
      row.status === 'invited' && row.inviteRoleKey
        ? row.inviteRoleKey
        : (row.orgRoleKey ?? MEMBER_ROLE_KEY);
    return {
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      image: row.image,
      orgRole: { key: orgRoleKey, name: nameOf(orgRoleKey) },
      isOwner: row.orgRoleKey === OWNER_ROLE_KEY,
      items: row.items.map((item) => ({ ...item, roleName: nameOf(item.roleKey) })),
      status: row.status,
      joinedAt: row.status === 'active' ? row.joinedAt.toISOString() : null,
      invitedAt: row.invitedAt ? row.invitedAt.toISOString() : null,
    };
  }

  private async assignmentViews(orgId: string, orgUserId: string): Promise<AssignmentView[]> {
    const [rows, stored] = await Promise.all([
      this.roles.assignmentsOf(orgId, orgUserId),
      this.roles.storedRoles(orgId),
    ]);
    const roles = this.roleMap(stored);
    const views: AssignmentView[] = rows.map((row) => ({
      orgUserId,
      roleKey: row.roleKey,
      roleName: roles.get(row.roleKey)?.name ?? row.roleKey,
      contentId: row.contentId,
      contentType: row.contentType,
    }));
    if (!rows.some((row) => row.contentId === null)) {
      views.unshift({
        orgUserId,
        roleKey: MEMBER_ROLE_KEY,
        roleName: roles.get(MEMBER_ROLE_KEY)?.name ?? 'Member',
        contentId: null,
        contentType: null,
      });
    }
    return views;
  }

  private roleMap(stored: readonly StoredOrgRole[]): Map<string, OrgRole> {
    return new Map(resolveOrgRoles(this.catalog, stored).map((role) => [role.key, role]));
  }

  private resolveIn(stored: readonly StoredOrgRole[], key: string): OrgRole | null {
    return resolveRole(
      key,
      this.catalog,
      stored.find((row) => row.key === key),
    );
  }

  private async findRole(orgId: string, key: string): Promise<OrgRole> {
    const role = this.resolveIn(await this.roles.storedRoles(orgId), key);
    if (!role) {
      throw new NotFoundError('Role', key);
    }
    return role;
  }

  private async relockedActor(scope: OrganizationsWriteScope, actor: Actor): Promise<Actor> {
    if (actor.id === SYSTEM_ID) {
      return actor;
    }
    const facts = await scope.roles.actorFacts(actor.orgId, actor.id);
    if (!facts || facts.status !== 'active') {
      throw new ForbiddenError('You are no longer an active member of this organization');
    }
    const fresh = resolvePermissions({
      assignments: facts.assignments,
      roles: this.roleMap(facts.storedRoles),
    });
    return {
      ...actor,
      permissions: {
        has: (p, on) => fresh.has(p, on) && actor.permissions.has(p, on),
        require: (p, on) => {
          if (!(fresh.has(p, on) && actor.permissions.has(p, on))) {
            throw new ForbiddenError(`You need ${p}`);
          }
        },
        anywhere: (p) => fresh.anywhere(p) && actor.permissions.anywhere(p),
        where: (p) => actor.permissions.where(p),
        roleOn: (on) => fresh.roleOn(on),
        isOwner: () => fresh.isOwner() && actor.permissions.isOwner(),
      },
    };
  }

  private itemPermissions(role: OrgRole | null, type: ContentType): Permission[] {
    if (!role || !role.levels.includes(type)) {
      return [];
    }
    return role.permissions.filter((p) => permissionAbout(p) === type);
  }

  private assertHolds(actor: Actor, permissions: readonly Permission[]): void {
    const missing = [...new Set(permissions)].filter((p) => !actor.permissions.has(p));
    if (missing.length > 0) {
      this.logger.warn('refused: editor lacks permissions', {
        orgId: actor.orgId,
        actorId: actor.id,
        missing,
      });
      throw new ForbiddenError(`You need ${missing.join(', ')}`);
    }
  }

  private assertHoldsOn(actor: Actor, permissions: readonly Permission[], contentId: string): void {
    const missing = [...new Set(permissions)].filter((p) => !actor.permissions.has(p, contentId));
    if (missing.length > 0) {
      this.logger.warn('refused: editor lacks permissions on the item', {
        orgId: actor.orgId,
        actorId: actor.id,
        contentId,
        missing,
      });
      throw new ForbiddenError(`You need ${missing.join(', ')} there`);
    }
  }

  private assertNotSelf(actor: Actor, orgUserId: string): void {
    if (actor.id === orgUserId) {
      this.logger.warn('refused: changing own roles', { orgId: actor.orgId, orgUserId });
      throw new ForbiddenError("You can't change your own roles");
    }
  }

  private assertUniqueName(stored: readonly StoredOrgRole[], key: string, name: string): void {
    const wanted = name.trim().toLowerCase();
    if (wanted.length === 0) {
      throw new OrganizationRuleError('A role needs a name');
    }
    const taken = resolveOrgRoles(this.catalog, stored).some(
      (role) => role.key !== key && role.name.trim().toLowerCase() === wanted,
    );
    if (taken) {
      throw new OrganizationRuleError(`A role named ${name} already exists`);
    }
  }

  private parseLevels(levels: Level[]): Level[] {
    if (levels.length === 0) {
      throw new OrganizationRuleError('A role needs at least one level');
    }
    for (const level of levels) {
      if (!levelSchema.safeParse(level).success) {
        throw new OrganizationRuleError(`Unknown level ${String(level)}`);
      }
    }
    return [...new Set(levels)];
  }

  private assertFits(row: StoredOrgRole): void {
    const base = this.catalog.get(row.base);
    const levels = row.levels ?? base?.levels ?? [];
    const misfits = Object.entries(row.permissions)
      .filter(([, held]) => held)
      .map(([p]) => p as Permission)
      .filter((p) => !fitsLevels(p, levels));
    if (misfits.length > 0) {
      throw new OrganizationRuleError(
        `${misfits.join(', ')} ${misfits.length === 1 ? "doesn't" : "don't"} fit the role's levels`,
      );
    }
  }

  private async assertLevelsNotInUse(
    roles: RolesRepository,
    orgId: string,
    before: OrgRole,
    after: OrgRole,
  ): Promise<void> {
    const removed = before.levels.filter((level) => !after.levels.includes(level));
    for (const level of removed) {
      const count = await roles.countHolders(orgId, before.key, level);
      if (count > 0) {
        throw new OrganizationRuleError(
          `${before.name} is given on ${level === 'org' ? 'the organization' : `a ${level}`}; remove those first`,
        );
      }
    }
  }
}
