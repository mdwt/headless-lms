// entitlements context — public surface. Re-export only what other contexts may use.
export { EntitlementsServiceImpl } from './service.js';
export { entitlementEvents } from './events.js';
export type { EntitlementsService, EntitlementsRepository } from './ports.js';
export type {
  Entitlement,
  EntitlementStatus,
  EntitlementsQuery,
  GrantEntitlementInput,
  Page,
} from './model.js';
export type {
  EntitlementCreated,
  EntitlementUpdated,
  EntitlementDeleted,
  EntitlementExpired,
  EntitlementEvent,
} from './events.js';
