// entitlements context — public surface. Re-export only what other contexts may use.
export { EntitlementsServiceImpl } from './service.js';
export { entitlementEvents } from './events.js';
export type {
  AccessFacts,
  CommunityAccessReader,
  EndingGrant,
  EndingGrantKey,
  EntitlementNotice,
  EntitlementsService,
  EntitlementsRepository,
  GrantKey,
  GrantTarget,
  InsertSpaceMemberInput,
  OpenableSpace,
  SpaceAccessRule,
  SpaceMembersQuery,
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
