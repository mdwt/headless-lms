import type { Invite, Organization, OrgUser } from './model.js';
import type {
  AssignmentView,
  CreateRoleInput,
  Member,
  MembersQuery,
  Page,
  RoleView,
  UpdateRoleInput,
  ViewerPermissions,
} from './members.js';
import type { OutboxAppender, UnitOfWork } from '../shared/ports.js';
import type { Actor, EffectivePermissions } from '../shared/actor.js';
import type {
  ApiKeySummary,
  ConnectedApp,
  ContentType,
  CreatedApiKey,
  OrgUserProfile,
  Permission,
  RoleAssignment,
} from '../types/index.js';
import type { AssignmentRow } from './effective-permissions.js';
import type { StoredOrgRole } from './org-roles.js';
import type { PermissionListEntry } from './permissions.js';
import type {
  AcceptInviteInput,
  AddOrgUserInput,
  CreateInviteInput,
  CreateOrganizationInput,
  CreateOrgUserInput,
  NewOrganizationInput,
  UpdateOrganizationInput,
  UpdateOrgUserInput,
} from './types.js';

export type { AuthHeaders } from '../identity/index.js';
import type { AuthHeaders } from '../identity/index.js';

export interface TransferOwnershipInput {
  newOwnerOrgUserId: string;
  previousOwnerRoleKey?: string | undefined;
}

export interface CreateApiKeyInput {
  name: string;
  scopes: Permission[];
}

export interface OrganizationService {
  createOrganization(input: CreateOrganizationInput): Promise<Organization>;
  updateOrganization(input: UpdateOrganizationInput, actor: Actor): Promise<Organization>;
  deleteOrganization(id: string): Promise<Organization>;
  addOrgUser(input: AddOrgUserInput): Promise<OrgUser>;
  removeOrgUser(orgId: string, userId: string): Promise<OrgUser | null>;
  getByExternalId(externalId: string): Promise<Organization | null>;
  getBySlug(slug: string): Promise<Organization | null>;
  getById(id: string): Promise<Organization | null>;
  portalIdentity(id: string): Promise<Pick<Organization, 'id' | 'name' | 'slug'> | null>;
  getOrgUser(orgId: string, userId: string): Promise<OrgUser | null>;
  getOrgUserById(orgId: string, id: string): Promise<OrgUser | null>;
  getOrgUsersByIds(orgId: string, ids: string[]): Promise<OrgUser[]>;
  getOrgUsersForUser(userId: string): Promise<OrgUser[]>;
  orgIds(): Promise<string[]>;

  actorFor(
    orgId: string,
    orgUserId: string,
    tokenScopes?: readonly Permission[],
  ): Promise<Actor | null>;
  systemActor(orgId: string): Actor;
  permissionsOfMany(
    orgId: string,
    orgUserIds: string[],
  ): Promise<Map<string, EffectivePermissions>>;
  holders(orgId: string, permission: Permission, on?: string): Promise<string[]>;
  permissionList(): PermissionListEntry[];
  viewerPermissions(actor: Actor): ViewerPermissions;

  listRoles(actor: Actor): Promise<RoleView[]>;
  getRole(key: string, actor: Actor): Promise<RoleView>;
  updateRole(key: string, input: UpdateRoleInput, actor: Actor): Promise<RoleView>;
  createRole(input: CreateRoleInput, actor: Actor): Promise<RoleView>;
  resetRole(key: string, actor: Actor): Promise<RoleView>;
  deleteRole(key: string, actor: Actor): Promise<void>;

  listTeam(query: MembersQuery, actor: Actor): Promise<Page<Member>>;
  listAssignments(orgUserId: string, actor: Actor): Promise<AssignmentView[]>;
  listAssignmentsOn(contentId: string, actor: Actor): Promise<AssignmentView[]>;
  setOrgRole(orgUserId: string, roleKey: string, actor: Actor): Promise<AssignmentView[]>;
  assignRole(
    orgUserId: string,
    contentId: string,
    roleKey: string,
    actor: Actor,
  ): Promise<AssignmentView[]>;
  unassignRole(orgUserId: string, contentId: string, actor: Actor): Promise<AssignmentView[]>;
  removePerson(orgUserId: string, actor: Actor): Promise<void>;
  transferOwnership(input: TransferOwnershipInput, actor: Actor): Promise<void>;

  createInvite(input: CreateInviteInput, actor: Actor, inviterUserId: string): Promise<Invite>;
  resendInvite(orgUserId: string, actor: Actor, inviterUserId: string): Promise<void>;
  cancelInvite(orgUserId: string, actor: Actor): Promise<void>;
  peekInvite(token: string): Promise<Invite | null>;
  acceptInvite(input: AcceptInviteInput): Promise<OrgUser>;

  listApiKeys(actor: Actor): Promise<ApiKeySummary[]>;
  createApiKey(input: CreateApiKeyInput, actor: Actor): Promise<CreatedApiKey>;
  deleteApiKey(keyId: string, actor: Actor): Promise<void>;
  listConnectedApps(actor: Actor): Promise<ConnectedApp[]>;
  revokeConnectedApp(clientId: string, actor: Actor): Promise<void>;
}

export interface ActorFacts {
  orgUserId: string;
  status: OrgUser['status'];
  assignments: AssignmentRow[];
  storedRoles: StoredOrgRole[];
}

export interface RolesRepository {
  actorFacts(orgId: string, orgUserId: string): Promise<ActorFacts | null>;
  storedRoles(orgId: string): Promise<StoredOrgRole[]>;
  saveStoredRole(orgId: string, role: StoredOrgRole): Promise<void>;
  deleteStoredRole(orgId: string, key: string): Promise<boolean>;
  assignmentsOf(orgId: string, orgUserId: string): Promise<RoleAssignment[]>;
  assignmentsOfMany(orgId: string, orgUserIds: string[]): Promise<Map<string, AssignmentRow[]>>;
  assignmentsOn(orgId: string, contentId: string): Promise<RoleAssignment[]>;
  holdersOf(orgId: string, roleKeys: string[], contentId?: string): Promise<string[]>;
  setOrgRole(
    orgId: string,
    orgUserId: string,
    roleKey: string | null,
    assignedBy: string,
  ): Promise<void>;
  setItemRole(
    orgId: string,
    orgUserId: string,
    contentId: string,
    contentType: ContentType,
    roleKey: string,
    assignedBy: string,
  ): Promise<void>;
  removeItemRole(
    orgId: string,
    orgUserId: string,
    contentId: string,
  ): Promise<RoleAssignment | null>;
  countHolders(orgId: string, roleKey: string, contentType?: ContentType | 'org'): Promise<number>;
  holderCounts(orgId: string): Promise<Record<string, number>>;
  contentTypeOf(orgId: string, contentId: string): Promise<ContentType | null>;
  ownerOrgUserId(orgId: string): Promise<string | null>;
  lock(keys: string[]): Promise<void>;
}

export interface OrganizationsWriteScope {
  organizations: OrganizationsRepository;
  roles: RolesRepository;
  outbox: OutboxAppender;
}
export type OrganizationsUnitOfWork = UnitOfWork<OrganizationsWriteScope>;

export interface NewOrganizationRow {
  id: string;
  externalId?: string | null;
  name: string;
  slug: string;
  ownerId: string;
}

export interface NewInviteRow {
  email: string;
  roleKey: string;
  invitedBy: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface OrganizationsRepository {
  create(input: NewOrganizationRow): Promise<Organization>;
  update(id: string, input: UpdateOrganizationInput): Promise<Organization | null>;
  delete(id: string): Promise<Organization>;
  findById(id: string): Promise<Organization | null>;
  listIds(): Promise<string[]>;
  findByExternalId(externalId: string): Promise<Organization | null>;
  findBySlug(slug: string): Promise<Organization | null>;
  upsertPendingInvite(orgId: string, input: NewInviteRow): Promise<Invite>;
  setInviteStatus(orgId: string, id: string, status: string): Promise<Invite | null>;
  setInviteRole(orgId: string, id: string, roleKey: string): Promise<Invite | null>;
  findInviteByTokenHash(tokenHash: string): Promise<Invite | null>;
  findPendingInvite(orgId: string, email: string): Promise<Invite | null>;
  setInviteToken(
    orgId: string,
    id: string,
    tokenHash: string,
    expiresAt: Date,
    invitedBy: string,
  ): Promise<Invite | null>;
  findOrgUser(orgId: string, userId: string): Promise<OrgUser | null>;
  findOrgUsersByUser(userId: string): Promise<OrgUser[]>;
  findOrgUserById(orgId: string, id: string): Promise<OrgUser | null>;
  findOrgUsersByIds(orgId: string, ids: string[]): Promise<OrgUser[]>;
  createOrgUser(input: CreateOrgUserInput): Promise<OrgUser>;
  updateOrgUser(orgId: string, id: string, patch: UpdateOrgUserInput): Promise<OrgUser | null>;
  deleteOrgUser(orgId: string, id: string): Promise<OrgUser | null>;
}

export interface GrantReader {
  holdsAnyGrant(orgId: string, orgUserId: string): Promise<boolean>;
}

export interface TeamRow extends OrgUserProfile {
  status: OrgUser['status'];
  joinedAt: Date;
  invitedAt: Date | null;
  orgRoleKey: string | null;
  inviteRoleKey: string | null;
  items: { contentId: string; contentType: ContentType; roleKey: string }[];
}

export interface MembersRepository {
  teamRows(orgId: string, memberRoleKey: string): Promise<TeamRow[]>;
}

export type AuthOrganization = Pick<Organization, 'id' | 'name' | 'slug' | 'createdAt'>;

export interface OrgAdmin {
  createOrganization(headers: AuthHeaders, input: NewOrganizationInput): Promise<AuthOrganization>;
  setActiveOrganization(headers: AuthHeaders, externalId: string): Promise<void>;
  deleteOrganization(headers: AuthHeaders, externalId: string): Promise<void>;
  updateOrganization(externalId: string, input: UpdateOrganizationInput): Promise<void>;
  grantMembership(orgExternalId: string, userExternalId: string): Promise<void>;
  setMembershipOwner(orgExternalId: string, userExternalId: string, owner: boolean): Promise<void>;
  removeMembership(orgExternalId: string, userExternalId: string): Promise<void>;
}

export interface ApiKeys {
  list(orgId: string, userExternalId: string): Promise<ApiKeySummary[]>;
  create(
    orgId: string,
    userExternalId: string,
    name: string,
    scopes: Permission[],
  ): Promise<CreatedApiKey>;
  revoke(orgId: string, userExternalId: string, keyId: string): Promise<void>;
  listApps(orgId: string, userExternalId: string): Promise<ConnectedApp[]>;
  revokeApp(orgId: string, userExternalId: string, clientId: string): Promise<void>;
  revokeAllFor(orgId: string, userExternalId: string): Promise<void>;
}
