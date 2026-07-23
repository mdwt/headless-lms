// organizations context — public surface.
export { OrganizationServiceImpl } from './service.js';
export type {
  OrganizationService,
  OrganizationProvisioner,
  MembersRepository,
  MemberRecord,
  MemberWriteContext,
  OrgAdmin,
  AuthHeaders,
} from './ports.js';
export type { Organization, Membership, Invitation, CourseAssignment } from './model.js';
export { OrganizationRuleError } from './members.js';
export type { Member, MemberStatus, MembersQuery, InviteMemberInput, Page } from './members.js';
export { ROLES, STUDENT_ROLE, isRole, parseRole, normalizeRole, capability, canForCourse } from './roles.js';
export type { Role, Permission, Capability } from './roles.js';
export type {
  OrganizationId,
  MembershipId,
  InvitationId,
  CreateOrganizationInput,
  NewOrganizationInput,
  UpdateOrganizationInput,
  AddMembershipInput,
  RecordInvitationInput,
  AcceptInviteInput,
  AssignCourseInput,
} from './types.js';
