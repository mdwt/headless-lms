// Public surface of the API contract: the shared Zod schemas that the Fastify
// server validates against (request + response), the OpenAPI spec is built
// from, and the generated SDK is derived off.
export * from "./shared.js";
export * from "./courses.js";
export * from "./modules.js";
export * from "./students.js";
export * from "./entitlements.js";
export * from "./members.js";
export * from "./dashboard.js";
export * from "./assets.js";
export * from "./connected-apps.js";
