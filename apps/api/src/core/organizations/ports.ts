// organizations context — ports.
import type { Organization, Membership, Invitation, CourseAssignment } from "./model.js";
import type { Member, MembersQuery, InviteMemberInput, Page } from "./members.js";
import type { Role } from "./roles.js";
import type {
  CreateOrganizationInput,
  AddMembershipInput,
  RecordInvitationInput,
  AcceptInvitationInput,
  AssignCourseInput,
} from "./types.js";

// Capability used by the auth adapter to mirror the organization plugin's
// records (org, members, invitations) into the domain. A narrow slice of the
// organization service. The adapter resolves auth user ids to domain USER ids
// before calling, so core stays decoupled from the auth schema.
export interface OrganizationProvisioner {
  createOrg(input: CreateOrganizationInput): Promise<Organization>;
  addMembership(input: AddMembershipInput): Promise<Membership>;
  removeMembership(externalId: string): Promise<void>;
  recordInvitation(input: RecordInvitationInput): Promise<Invitation>;
  acceptInvitation(input: AcceptInvitationInput): Promise<void>;
  // Lets the adapter detect whether an org is already mirrored (used to make
  // the creator's membership hook resilient to firing before provisioning).
  getByExternalId(externalId: string): Promise<Organization | null>;
}

// Inbound port (use cases the service exposes).
export interface OrganizationService extends OrganizationProvisioner {
  assignCourse(input: AssignCourseInput): Promise<CourseAssignment>;
  unassignCourse(input: AssignCourseInput): Promise<void>;
  assignedCourseIds(orgId: string, membershipId: string): Promise<string[]>;
  getMembershipByUser(userId: string): Promise<Membership | null>;
  // Member-management operations (formerly the `team` context). Reads come from
  // the domain mirror; writes go through Better Auth via OrgAdmin.
  listMembers(orgId: string, query: MembersQuery): Promise<Page<Member>>;
  inviteMember(ctx: MemberWriteContext, input: InviteMemberInput): Promise<Member>;
  updateMemberRole(ctx: MemberWriteContext, id: string, role: Role): Promise<Member | null>;
  removeMember(ctx: MemberWriteContext, id: string): Promise<boolean>;
}

// Outbound port (persistence contract the repository fulfils).
export interface OrganizationsRepository {
  create(input: CreateOrganizationInput): Promise<Organization>;
  findByExternalId(externalId: string): Promise<Organization | null>;
  insertMembership(orgId: string, input: AddMembershipInput): Promise<Membership>;
  deleteMembershipByExternalId(externalId: string): Promise<void>;
  insertInvitation(orgId: string, input: RecordInvitationInput): Promise<Invitation>;
  setInvitationStatusByAuthId(authInvitationId: string, status: string): Promise<void>;
  insertCourseAssignment(orgId: string, input: AssignCourseInput): Promise<CourseAssignment>;
  deleteCourseAssignment(orgId: string, membershipId: string, courseId: string): Promise<void>;
  findAssignedCourseIds(orgId: string, membershipId: string): Promise<string[]>;
  findMembershipByUser(userId: string): Promise<Membership | null>;
}

/** A member row enriched with the auth-provider ids needed to drive writes. */
export interface MemberRecord extends Member {
  kind: "member" | "invitation";
  authMemberId: string | null;
  authInvitationId: string | null;
}

// Outbound: reads the org's members + pending invitations from the domain mirror.
export interface MembersRepository {
  list(orgId: string, query: MembersQuery): Promise<Page<Member>>;
  findByEmail(orgId: string, email: string): Promise<MemberRecord | null>;
  findById(orgId: string, id: string): Promise<MemberRecord | null>;
}

/** Context for a write: domain org (reads/rules) + auth org & session (writes). */
export interface MemberWriteContext {
  orgId: string;
  authOrgId: string;
  headers: Record<string, string | string[] | undefined>;
}

/** Outbound: org membership writes, fulfilled by the auth provider (Better Auth). */
export interface OrgAdmin {
  invite(ctx: MemberWriteContext, input: InviteMemberInput): Promise<void>;
  updateRole(ctx: MemberWriteContext, authMemberId: string, role: Role): Promise<void>;
  removeMember(ctx: MemberWriteContext, authMemberId: string): Promise<void>;
  cancelInvitation(ctx: MemberWriteContext, authInvitationId: string): Promise<void>;
}
