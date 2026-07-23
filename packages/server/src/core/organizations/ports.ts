// organizations context — ports.
import type { Organization, Membership, Invitation, CourseAssignment } from './model.js';
import type { Member, MembersQuery, InviteMemberInput, Page } from './members.js';
import type { Role } from './roles.js';
import type {
  CreateOrganizationInput,
  NewOrganizationInput,
  UpdateOrganizationInput,
  AddMembershipInput,
  RecordInvitationInput,
  AcceptInviteInput,
  AssignCourseInput,
} from './types.js';

/** Inbound HTTP headers carrying the session, forwarded to the auth provider. */
export type AuthHeaders = Record<string, string | string[] | undefined>;

// Capability used by the auth adapter to mirror the organization plugin's
// records (org, members, invitations) into the domain. A narrow slice of the
// organization service. The adapter resolves auth user ids to domain USER ids
// before calling, so core stays decoupled from the auth schema.
export interface OrganizationProvisioner {
  createOrg(input: CreateOrganizationInput): Promise<Organization>;
  addMembership(input: AddMembershipInput): Promise<Membership>;
  removeMembership(externalId: string): Promise<void>;
  recordInvitation(input: RecordInvitationInput): Promise<Invitation>;
  // Captures a freshly minted student invite on the pending student row
  // (identity persists the pointer; organizations owns the invite lifecycle).
  recordStudentInvite(orgExternalId: string, email: string, inviteExternalId: string): Promise<void>;
  // Invitation acceptance: an organizations-domain event. Student invites link
  // the student row (delegated to identity); staff invites grant the membership
  // recorded for the invitation — refused unless the mirror is still pending.
  // Returns the org the account should act in, for session stamping.
  acceptInvite(input: AcceptInviteInput): Promise<{ orgExternalId: string | null }>;
  // Lets the adapter detect whether an org is already mirrored (used to make
  // the creator's membership hook resilient to firing before provisioning).
  getByExternalId(externalId: string): Promise<Organization | null>;
  // Lets the auth adapter gate invite creation to staff (users with a
  // membership somewhere).
  getMembershipByUser(userId: string): Promise<Membership | null>;
}

// Inbound port (use cases the service exposes).
export interface OrganizationService extends OrganizationProvisioner {
  // Creates a new organization on the caller's behalf and makes it the session's
  // active org. Drives Better Auth (via OrgAdmin); its hooks mirror the org into
  // the domain, which this method then returns.
  createOrganization(headers: AuthHeaders, input: NewOrganizationInput): Promise<Organization>;
  // Updates the caller's active org (name/slug) via Better Auth, then returns the
  // re-read domain org. `authOrgId` is the Better Auth organization id.
  updateOrganization(
    headers: AuthHeaders,
    authOrgId: string,
    input: UpdateOrganizationInput,
  ): Promise<Organization>;
  assignCourse(input: AssignCourseInput): Promise<CourseAssignment>;
  unassignCourse(input: AssignCourseInput): Promise<void>;
  assignedCourseIds(orgId: string, membershipId: string): Promise<string[]>;
  // Resolve an org by its public slug — used by the student portal boundary to
  // map the portal org slug to the tenant org id.
  getBySlug(slug: string): Promise<Organization | null>;
  // Member-management operations (formerly the `team` context). Reads come from
  // the domain mirror; writes go through Better Auth via OrgAdmin.
  listMembers(orgId: string, query: MembersQuery): Promise<Page<Member>>;
  inviteMember(ctx: MemberWriteContext, input: InviteMemberInput): Promise<Member>;
  // Invites a student to create their portal account. Invitations are an
  // organizations-domain concern for every population; only the role differs.
  inviteStudent(ctx: MemberWriteContext, email: string): Promise<void>;
  updateMemberRole(ctx: MemberWriteContext, id: string, role: Role): Promise<Member | null>;
  removeMember(ctx: MemberWriteContext, id: string): Promise<boolean>;
}

// Outbound port (persistence contract the repository fulfils).
export interface OrganizationsRepository {
  create(input: CreateOrganizationInput): Promise<Organization>;
  updateByExternalId(
    externalId: string,
    input: UpdateOrganizationInput,
  ): Promise<Organization | null>;
  findByExternalId(externalId: string): Promise<Organization | null>;
  findBySlug(slug: string): Promise<Organization | null>;
  insertMembership(orgId: string, input: AddMembershipInput): Promise<Membership>;
  deleteMembershipByExternalId(externalId: string): Promise<void>;
  insertInvitation(orgId: string, input: RecordInvitationInput): Promise<Invitation>;
  setInvitationStatusByExternalId(externalId: string, status: string): Promise<void>;
  findInvitationByExternalId(
    externalId: string,
  ): Promise<{ orgExternalId: string; role: string; status: string } | null>;
  insertCourseAssignment(orgId: string, input: AssignCourseInput): Promise<CourseAssignment>;
  deleteCourseAssignment(orgId: string, membershipId: string, courseId: string): Promise<void>;
  findAssignedCourseIds(orgId: string, membershipId: string): Promise<string[]>;
  findMembershipByUser(userId: string): Promise<Membership | null>;
}

/** A member row enriched with the auth-provider ids needed to drive writes. */
export interface MemberRecord extends Member {
  kind: 'member' | 'invitation';
  memberExternalId: string | null;
  invitationExternalId: string | null;
}

// Outbound: reads the org's members + pending invitations from the domain mirror.
export interface MembersRepository {
  list(orgId: string, query: MembersQuery): Promise<Page<Member>>;
  findByEmail(orgId: string, email: string): Promise<MemberRecord | null>;
  findById(orgId: string, id: string): Promise<MemberRecord | null>;
}

/** Narrow identity-context slice the invite lifecycle needs: the student rows
 *  an invite is recorded on and later linked to. Declared here (not imported
 *  from identity) so the contexts stay structurally coupled only at composition. */
export interface StudentLinker {
  recordStudentInvite(orgId: string, email: string, inviteExternalId: string): Promise<void>;
  linkStudentByInvite(inviteExternalId: string, email: string, externalId: string): Promise<void>;
  studentOrgExternalId(externalId: string): Promise<string | null>;
}

/** Context for a write: domain org (reads/rules) + auth org & session (writes). */
export interface MemberWriteContext {
  orgId: string;
  authOrgId: string;
  headers: Record<string, string | string[] | undefined>;
}

/** Outbound: org membership writes, fulfilled by the auth provider (Better Auth). */
export interface OrgAdmin {
  // Creates an org (owner inferred from the session) and returns its auth id.
  createOrganization(
    headers: AuthHeaders,
    input: NewOrganizationInput,
  ): Promise<{ externalId: string }>;
  // Marks an org as the session's active organization.
  setActiveOrganization(headers: AuthHeaders, externalId: string): Promise<void>;
  // Updates an org's profile (name/slug). Throws OrganizationRuleError on a
  // conflict (e.g. slug already taken) so the route can map it to 409.
  updateOrganization(
    headers: AuthHeaders,
    externalId: string,
    input: UpdateOrganizationInput,
  ): Promise<void>;
  invite(ctx: MemberWriteContext, input: InviteMemberInput): Promise<void>;
  // Mints a student-role invitation (portal account creation). Same invite
  // provider as staff invites; the role decides the landing app and the grant.
  inviteStudent(ctx: MemberWriteContext, email: string): Promise<void>;
  // Grants a membership server-side when an accepted invitation is honoured
  // (no acting session — the invitee's acceptance IS the authorisation).
  grantMembership(orgExternalId: string, userExternalId: string, role: string): Promise<void>;
  updateRole(ctx: MemberWriteContext, memberExternalId: string, role: Role): Promise<void>;
  removeMember(ctx: MemberWriteContext, memberExternalId: string): Promise<void>;
}
