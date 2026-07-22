// Centralized Drizzle schema. All domain tables live here, grouped by the
// bounded context that owns them. Re-exported so drizzle-kit and the
// repositories have a single import surface.
export * from "./organizations.js";
export * from "./content.js";
export * from "./entitlements.js";
export * from "./progress.js";
export * from "./identity.js";
export * from "./assets.js";
export * from "./credentials.js";
export * from "./integrations.js";
export * from "./outbox.js";
