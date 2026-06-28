// organizations context — public surface.
export { OrganizationServiceImpl } from "./service.js";
export type { OrganizationService, OrganizationProvisioner } from "./ports.js";
export type { Organization, Membership, Invitation } from "./model.js";
export { ROLES, isRole, parseRole, capability, canForCourse } from "./roles.js";
export type { Role, Permission, Capability } from "./roles.js";
export type {
  OrganizationId,
  MembershipId,
  InvitationId,
  ProvisionOrganizationInput,
  AddMembershipInput,
  RecordInvitationInput,
  AcceptInvitationInput,
} from "./types.js";
