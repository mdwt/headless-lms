// @headless-lms/core/types — the platform's published type surface: domain
// entities, DTOs, domain event envelope types, the integration contract, and the
// deployment-swappable ports adapter packages implement.
// One file per bounded context, mirroring the core contexts.
export * from './shared.js';
export * from './events.js';
export * from './ports.js';
export * from './email-templates.js';
export * from './identity.js';
export * from './organizations.js';
export * from './content.js';
export * from './entitlements.js';
export * from './progress.js';
export * from './assets.js';
export * from './integrations.js';
export * from './automations.js';
export * from './discussion.js';
