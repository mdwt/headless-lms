// organizations context — public surface.
export { OrganizationServiceImpl } from './service.js';
export type { OrganizationServiceParams, InviteUrls } from './service.js';
export {
  OrgNotificationCategories,
  orgNotificationCategoriesDeclarations,
} from './notification-categories.js';
export { NotificationCatalog, notificationCatalogDeclarations } from './notification-catalog.js';
export type {
  NotificationCatalogParams,
  NotificationCatalogService,
} from './notification-catalog.js';
export { organizationEvents } from './events.js';
export { organizationsDeclarations } from './declarations.js';
export { actorWith } from './testing.js';
export type { ActorShape } from './testing.js';

export type {
  OrganizationService,
  MembersRepository,
  TeamRow,
  OrgAdmin,
  ApiKeys,
  GrantReader,
  TransferOwnershipInput,
  CreateApiKeyInput,
  OrganizationsWriteScope,
  OrganizationsUnitOfWork,
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
export type {
  AssignmentView,
  CreateRoleInput,
  InviteDetails,
  ItemRole,
  Member,
  MemberStatus,
  MembersQuery,
  Page,
  RoleView,
  UpdateRoleInput,
  ViewerPermissions,
} from './members.js';
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
  CreateOrgUserInput,
  UpdateOrgUserInput,
  OrgUserStatus,
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
  RoleUpdated,
  RoleCreated,
  RoleDeleted,
  RoleAssigned,
  RoleUnassigned,
  OwnershipTransferred,
} from './events.js';
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
