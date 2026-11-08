// entitlements context — public surface. Re-export only what other contexts may use.
export { EntitlementsServiceImpl } from './service.js';
export { entitlementEvents } from './events.js';
export { opensSpace, seesSpace } from './rules.js';
export { entitlementsDeclarations } from './declarations.js';
export { GRANTS_EXPIRE_JOB, entitlementsJobs, entitlementsRecurringJobs } from './jobs.js';
export type {
  AccessFacts,
  CommunityAccessReader,
  CommunityReaders,
  EndingGrant,
  EndingGrantKey,
  EntitlementNotice,
  EntitlementsService,
  EntitlementsRepository,
  GrantKey,
  GrantTarget,
  InsertSpaceMemberInput,
  OpenableSpace,
  PermissionHolders,
  RevokeGrantInput,
  SpaceAccessRule,
  SpaceMembersQuery,
  SpaceReader,
} from './ports.js';
export type {
  Entitlement,
  EntitlementStatus,
  EntitlementsQuery,
  GrantEntitlementInput,
  Page,
  SpaceMember,
  SpaceMemberSource,
  SpaceMemberStatus,
} from './model.js';
export type {
  EntitlementCreated,
  EntitlementUpdated,
  EntitlementDeleted,
  EntitlementExpired,
  EntitlementEndingSoon,
  SpaceMemberCreated,
  SpaceMemberUpdated,
  SpaceMemberDeleted,
  EntitlementEvent,
} from './events.js';
