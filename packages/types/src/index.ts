// @headless-lms/types — the platform's published type surface. Pure type
// declarations only: domain entities, DTOs, domain events, the integration
// contract, and the deployment-swappable ports adapter packages implement.
// One file per bounded context, mirroring apps/api/src/core/.
export * from "./shared.js";
export * from "./ports.js";
export * from "./email-templates.js";
export * from "./identity.js";
export * from "./organizations.js";
export * from "./content.js";
export * from "./entitlements.js";
export * from "./progress.js";
export * from "./assets.js";
export * from "./integrations.js";
