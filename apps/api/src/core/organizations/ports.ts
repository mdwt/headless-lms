// organizations context — ports.
import type { Organization, Membership, Invitation, CourseAssignment } from "./model.js";
import type {
  ProvisionOrganizationInput,
  AddMembershipInput,
  RecordInvitationInput,
  AcceptInvitationInput,
  AssignCourseInput,
} from "./types.js";

// Capability used by the auth adapter to mirror the organization plugin's
// records (org, members, invitations) into the domain. A narrow slice of the
// organization service. The adapter resolves auth user ids to domain student
// ids before calling, so core stays decoupled from the auth schema.
export interface OrganizationProvisioner {
  provisionOrganization(input: ProvisionOrganizationInput): Promise<Organization>;
  addMembership(input: AddMembershipInput): Promise<Membership>;
  removeMembership(authMemberId: string): Promise<void>;
  recordInvitation(input: RecordInvitationInput): Promise<Invitation>;
  acceptInvitation(input: AcceptInvitationInput): Promise<void>;
  // Lets the adapter detect whether an org is already mirrored (used to make
  // the creator's membership hook resilient to firing before provisioning).
  getByAuthOrgId(authOrgId: string): Promise<Organization | null>;
}

// Inbound port (use cases the service exposes).
export interface OrganizationService extends OrganizationProvisioner {
  assignCourse(input: AssignCourseInput): Promise<CourseAssignment>;
  unassignCourse(input: AssignCourseInput): Promise<void>;
  assignedCourseIds(orgId: string, membershipId: string): Promise<string[]>;
}

// Outbound port (persistence contract the repository fulfils).
export interface OrganizationsRepository {
  insertOrganization(input: ProvisionOrganizationInput): Promise<Organization>;
  findByAuthOrgId(authOrgId: string): Promise<Organization | null>;
  insertMembership(orgId: string, input: AddMembershipInput): Promise<Membership>;
  deleteMembershipByAuthMemberId(authMemberId: string): Promise<void>;
  insertInvitation(orgId: string, input: RecordInvitationInput): Promise<Invitation>;
  setInvitationStatusByAuthId(authInvitationId: string, status: string): Promise<void>;
  insertCourseAssignment(orgId: string, input: AssignCourseInput): Promise<CourseAssignment>;
  deleteCourseAssignment(orgId: string, membershipId: string, courseId: string): Promise<void>;
  findAssignedCourseIds(orgId: string, membershipId: string): Promise<string[]>;
}
