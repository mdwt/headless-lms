// organizations context — ports.
import type { Organization, Membership, Invitation } from "./model.js";
import type {
  ProvisionOrganizationInput,
  AddMembershipInput,
  RecordInvitationInput,
  AcceptInvitationInput,
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
}

// Inbound port (use cases the service exposes).
export interface OrganizationService extends OrganizationProvisioner {
  getByAuthOrgId(authOrgId: string): Promise<Organization | null>;
}

// Outbound port (persistence contract the repository fulfils).
export interface OrganizationsRepository {
  insertOrganization(input: ProvisionOrganizationInput): Promise<Organization>;
  findByAuthOrgId(authOrgId: string): Promise<Organization | null>;
  insertMembership(orgId: string, input: AddMembershipInput): Promise<Membership>;
  deleteMembershipByAuthMemberId(authMemberId: string): Promise<void>;
  insertInvitation(orgId: string, input: RecordInvitationInput): Promise<Invitation>;
  setInvitationStatusByAuthId(authInvitationId: string, status: string): Promise<void>;
}
