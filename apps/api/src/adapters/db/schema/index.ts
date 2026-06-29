// Centralized Drizzle schema. All domain tables live here, grouped by the
// bounded context that owns them. Re-exported so drizzle-kit and the
// repositories have a single import surface.
export * from "./organizations.js";
export * from "./courses.js";
export * from "./modules.js";
export * from "./enrollments.js";
export * from "./entitlements.js";
export * from "./offers.js";
export * from "./billing.js";
export * from "./progress.js";
export * from "./identity.js";
export * from "./assets.js";
