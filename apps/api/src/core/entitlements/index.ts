// entitlements context — public surface. Re-export only what other contexts may use.
export { EntitlementsServiceImpl } from "./service.js";
export type { EntitlementsService, EntitlementsRepository } from "./ports.js";
export type {
  Entitlement,
  EntitlementStatus,
  EntitlementSource,
  EntitlementsQuery,
  GrantEntitlementInput,
  Page,
} from "./model.js";
