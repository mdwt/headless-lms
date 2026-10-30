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
export { InviteError, OrganizationRuleError } from './members.js';
export type { Member, MemberRoleChange, MemberStatus, MembersQuery, Page } from './members.js';
export {
  ROLES,
  STAFF_ROLES,
  STUDENT_ROLE,
  isRole,
  isStaffRole,
  canModerate,
  parseRole,
  normalizeRole,
  capability,
} from './roles.js';
export type { Role, StaffRole, TeamRole, Permission, Capability } from './roles.js';
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
  OrgUserUpdated,
  InviteCreated,
  InviteAccepted,
  InviteCanceled,
  StudentCreated,
  StudentDeleted,
  StudentLinked,
} from './events.js';
export * from './access-scopes.js';
