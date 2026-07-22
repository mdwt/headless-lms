// entitlements context — public surface. Re-export only what other contexts may use.
export { EntitlementsServiceImpl } from "./service.js";
export type { EntitlementsService, EntitlementsRepository } from "./ports.js";
export type {
  Entitlement,
  EntitlementStatus,
  ContentRef,
  EntitlementsQuery,
  GrantEntitlementInput,
  Page,
} from "./model.js";
export type {
  EntitlementCreated,
  EntitlementUpdated,
  EntitlementDeleted,
  EntitlementExpired,
  EntitlementEvent,
} from "./events.js";
