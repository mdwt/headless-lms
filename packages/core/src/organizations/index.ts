// organizations context — public surface.
export { OrganizationServiceImpl } from './service.js';
export { organizationEvents } from './events.js';

export type {
  OrganizationService,
  MembersRepository,
  MemberRecord,
  MemberWriteContext,
  OrgAdmin,
  AuthHeaders,
  AuthOrganization,
  OrganizationsRepository,
  NewOrganizationRow,
  NewInviteRow,
} from './ports.js';
export type { Organization, OrgUser, Invite } from './model.js';
export { OrganizationRuleError } from './members.js';
export type { Member, MemberStatus, MembersQuery, Page } from './members.js';
export {
  ROLES,
  STAFF_ROLES,
  STUDENT_ROLE,
  isRole,
  isStaffRole,
  parseRole,
  normalizeRole,
  capability,
} from './roles.js';
export type { Role, StaffRole, Permission, Capability } from './roles.js';
export type {
  OrganizationId,
  OrgUserId,
  InviteId,
  CreateOrganizationInput,
  NewOrganizationInput,
  UpdateOrganizationInput,
  AddOrgUserInput,
  CreateInviteInput,
  AcceptInviteInput,
  InviteRole,
  CreateOrgUserInput,
  UpdateOrgUserInput,
  OrgUserStatus,
  ResendStudentInviteInput,
  UpdatePersonInput,
  UpdateStudentInput,
  LinkOrgUserInput,
  UnlinkOrgUserInput,
} from './types.js';
export type {
  OrganizationEvent,
  OrganizationCreated,
  OrganizationUpdated,
  OrganizationDeleted,
  OrgUserLinked,
  OrgUserDeleted,
  InviteCreated,
  InviteAccepted,
  InviteCanceled,
  StudentCreated,
  StudentDeleted,
  StudentLinked,
} from './events.js';
