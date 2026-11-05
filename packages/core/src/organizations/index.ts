// organizations context — public surface.
export { OrganizationServiceImpl } from './service.js';
export { OrgNotificationCategories } from './notification-categories.js';
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
  RolesRepository,
  ActorFacts,
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
export {
  PERMISSIONS,
  ALL_PERMISSIONS,
  isPermission,
  fitsLevels,
  withImplied,
  permissionList,
} from './permissions.js';
export type { PermissionDefinition, PermissionGroup, PermissionListEntry } from './permissions.js';
export {
  DEFAULT_ROLES,
  OWNER_ROLE_KEY,
  MEMBER_ROLE_KEY,
  RoleSetError,
  validateRoleSet,
} from './default-roles.js';
export type { RoleDefinition } from './default-roles.js';
export { catalogOf, resolveRole, resolveOrgRoles, isSystemRole } from './org-roles.js';
export type { OrgRole, StoredOrgRole, RoleCatalog } from './org-roles.js';
export {
  ResolvedPermissions,
  resolvePermissions,
  systemPermissions,
} from './effective-permissions.js';
export type { AssignmentRow, ResolveInput } from './effective-permissions.js';
