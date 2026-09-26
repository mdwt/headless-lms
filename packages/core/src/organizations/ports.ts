// organizations context — ports.
import type { Invite, Organization, OrgUser } from './model.js';
import type { Member, MembersQuery, Page } from './members.js';
import type { Role } from './roles.js';
import type { OutboxAppender, UnitOfWork } from '../shared/ports.js';
import type {
  AcceptInviteInput,
  AddOrgUserInput,
  CreateInviteInput,
  CreateOrganizationInput,
  CreateOrgUserInput,
  InviteRole,
  NewOrganizationInput,
  ResendStudentInviteInput,
  UpdateOrganizationInput,
  UpdateStudentInput,
} from './types.js';

// Sessions are identity's, so the header shape it forwards is declared there.
export type { AuthHeaders } from '../identity/index.js';
import type { AuthHeaders } from '../identity/index.js';

// Inbound port (use cases the service exposes).
export interface OrganizationService {
  createOrganization(input: CreateOrganizationInput): Promise<Organization>;
  updateOrganization(id: string, input: UpdateOrganizationInput): Promise<Organization>;
  deleteOrganization(id: string): Promise<Organization>;
  addOrgUser(input: AddOrgUserInput): Promise<OrgUser>;
  removeOrgUser(orgId: string, id: string): Promise<OrgUser>;
  getByExternalId(externalId: string): Promise<Organization | null>;
  getOrgUser(orgId: string, userId: string): Promise<OrgUser | null>;
  getOrgUsersForUser(userId: string): Promise<OrgUser[]>;
  getById(id: string): Promise<Organization | null>;
  // Mints a domain-owned invite (token + row + event, one transaction) and
  // emails the invite link. A pending invite for the same email is re-issued
  // with a fresh token. Throws OrganizationRuleError on rule violations.
  createInvite(input: CreateInviteInput): Promise<Invite>;
  // The invite a valid (pending, unexpired) token points at; null otherwise.
  peekInvite(token: string): Promise<Invite | null>;
  // Token-based acceptance by the logged-in account: links the account to the
  // invite's org under the invited role and returns the new org user.
  acceptInvite(input: AcceptInviteInput): Promise<OrgUser>;
  deleteOrgUser(orgId: string, id: string): Promise<OrgUser>;
  // Re-issues the pending student invite for an existing org user, rotating the
  // token and emailing it. Throws NotFoundError when the org user is unknown,
  // OrganizationRuleError when they have already joined.
  resendStudentInvite(input: ResendStudentInviteInput): Promise<void>;
  // Corrects the person behind a student row — the names and the address an
  // admin typed on the invite form. Throws NotFoundError when the org user is
  // unknown, ConflictError when the address is taken. Changing the address of a
  // student who has not accepted kills their pending invite, since the token
  // was minted against the old one.
  updateStudent(input: UpdateStudentInput): Promise<OrgUser>;
  // Resolve an org by its public slug — used by the student portal boundary to
  // map the portal org slug to the tenant org id.
  getBySlug(slug: string): Promise<Organization | null>;
  // Member-management operations (formerly the `team` context). Reads come from
  // the domain mirror; writes go through Better Auth via OrgAdmin.
  listMembers(orgId: string, query: MembersQuery): Promise<Page<Member>>;
  updateMemberRole(ctx: MemberWriteContext, id: string, role: Role): Promise<Member | null>;
  removeMember(ctx: MemberWriteContext, id: string): Promise<boolean>;
}

/** Atomic write scope: tx-bound repo + outbox appender, one transaction. */
export interface OrganizationsWriteScope {
  organizations: OrganizationsRepository;
  outbox: OutboxAppender;
}
export type OrganizationsUnitOfWork = UnitOfWork<OrganizationsWriteScope>;

/** Repo-facing write shape for a new org row. The service mints the id and
 *  resolves the defaults, so nothing is optional by the time it lands here. */
export interface NewOrganizationRow {
  id: string;
  externalId?: string | null;
  name: string;
  slug: string;
  ownerId: string;
}

/** Repo-facing write shape for a freshly minted invite. */
export interface NewInviteRow {
  email: string;
  role: InviteRole;
  invitedBy: string;
  tokenHash: string;
  expiresAt: Date;
}

// Outbound port (persistence contract the repository fulfils).
export interface OrganizationsRepository {
  create(input: NewOrganizationRow): Promise<Organization>;
  update(id: string, input: UpdateOrganizationInput): Promise<Organization | null>;
  /** Drops the org row and its dependents; null when none matched. */
  delete(id: string): Promise<Organization>;
  findById(id: string): Promise<Organization | null>;
  findByExternalId(externalId: string): Promise<Organization | null>;
  findBySlug(slug: string): Promise<Organization | null>;
  upsertOrgUser(orgId: string, input: AddOrgUserInput): Promise<OrgUser>;
  /** Inserts a pending invite, or re-issues the org's existing pending one
   *  for this email (fresh token/expiry/role) — atomic upsert. */
  upsertPendingInvite(orgId: string, input: NewInviteRow): Promise<Invite>;
  setInviteStatus(orgId: string, id: string, status: string): Promise<Invite | null>;
  findInviteByTokenHash(tokenHash: string): Promise<Invite | null>;
  findPendingInvite(orgId: string, email: string): Promise<Invite | null>;
  setInviteToken(orgId: string, id: string, tokenHash: string, expiresAt: Date): Promise<Invite | null>;
  /** The person's row in one org. `(org_id, user_id)` is unique. */
  findOrgUser(orgId: string, userId: string): Promise<OrgUser | null>;
  /** Every org this person belongs to, oldest first. */
  findOrgUsersByUser(userId: string): Promise<OrgUser[]>;
  findOrgUserById(orgId: string, id: string): Promise<OrgUser | null>;
  /** Links a user to the org under a role. Throws ConflictError when they
   *  already hold a row there. */
  createOrgUser(input: CreateOrgUserInput): Promise<OrgUser>;
  /** createOrgUser, but idempotent on `(org_id, user_id)`: an existing row is
   *  promoted to the requested status rather than refused. `created` says
   *  whether a row appeared, so `student.created` fires exactly once. */
  ensureOrgUser(input: CreateOrgUserInput): Promise<{ orgUser: OrgUser; created: boolean }>;
  /** Every org this person is a student in — the scope of `student.linked`. */
  findStudentOrgUsers(userId: string): Promise<OrgUser[]>;
  /** Kills the org's pending invite for an address, if any. */
  cancelPendingInvite(orgId: string, email: string): Promise<Invite | null>;

  deleteOrgUser(orgId: string, id: string): Promise<OrgUser | null>;
}

/** A member row enriched with the ids needed to drive writes. */
export interface MemberRecord extends Member {
  kind: 'member' | 'invite';
  // The person's better-auth user id. Member writes go through the auth
  // provider, which locates its own member record from this plus the auth org.
  userExternalId: string | null;
  // Domain invite id (invites are domain-owned).
  inviteId: string | null;
}

// Outbound: reads the org's members + pending invites from the domain mirror.
export interface MembersRepository {
  list(orgId: string, query: MembersQuery): Promise<Page<Member>>;
  findByEmail(orgId: string, email: string): Promise<MemberRecord | null>;
  findById(orgId: string, id: string): Promise<MemberRecord | null>;
}

/** The person as this context reads them back after a correction. */
export interface PersonRecord {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

/** Context for a write: domain org (reads/rules) + auth org & session (writes). */
export interface MemberWriteContext {
  orgId: string;
  authOrgId: string;
  headers: Record<string, string | string[] | undefined>;
}

/*
 * Outbound: separate interface to allow auth systems or similar to own orgs.
 * E.g. Better-Auth API owns the create org, but integrated with the domain using
 * their hooks, so the domain org is created in the same call.
 */
/** The provider's view of an org: what it stores itself, minus the fields only
 *  the domain row carries (`ownerId`, `externalId`, `updatedAt`). */
export type AuthOrganization = Pick<Organization, 'id' | 'name' | 'slug' | 'createdAt'>;

export interface OrgAdmin {
  // Creates an org (owner inferred from the session) and returns its auth id.
  createOrganization(headers: AuthHeaders, input: NewOrganizationInput): Promise<AuthOrganization>;
  // Marks an org as the session's active organization.
  setActiveOrganization(headers: AuthHeaders, externalId: string): Promise<void>;
  // Updates an org's profile (name/slug). Throws OrganizationRuleError on a
  // conflict (e.g. slug already taken) so the route can map it to 409.
  updateOrganization(
    headers: AuthHeaders,
    id: string,
    input: UpdateOrganizationInput,
  ): Promise<AuthOrganization>;
  // Deletes the org. Throws OrganizationRuleError when the provider refuses
  // (e.g. the caller is not its owner).
  deleteOrganization(headers: AuthHeaders, externalId: string): Promise<void>;
  // Grants a orgUser server-side when an accepted invitation is honoured
  // (no acting session — the invitee's acceptance IS the authorisation).
  grantMembership(orgExternalId: string, userExternalId: string, role: string): Promise<void>;
  // Both take the person's auth USER id; the adapter resolves the auth member
  // record from it, so nothing about auth's member ids leaks into the domain.
  updateRole(ctx: MemberWriteContext, userExternalId: string, role: Role): Promise<void>;
  removeMember(ctx: MemberWriteContext, userExternalId: string): Promise<void>;
}
