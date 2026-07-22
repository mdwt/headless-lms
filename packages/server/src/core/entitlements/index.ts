// entitlements context — public surface. Re-export only what other contexts may use.
export { EntitlementsServiceImpl } from './service.js';
export type { EntitlementsService, EntitlementsRepository } from './ports.js';
export type {
  Enrollment,
  EntitlementStatus,
  EntitlementSource,
  EntitlementsQuery,
  GrantEnrollmentInput,
  Page,
} from './model.js';
export type {
  EnrollmentCreated,
  EnrollmentUpdated,
  EnrollmentDeleted,
  EnrollmentExpired,
  EnrollmentEvent,
} from './events.js';
