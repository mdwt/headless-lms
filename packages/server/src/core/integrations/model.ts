// integrations context — entities & DTOs are owned by @headless-lms/types;
// the domain errors below are runtime code and stay in core.
export type { Connection, ConnectInput, ConfigureInput } from '@headless-lms/types';

/** An org already has a connection for this integration (one per integration per org). */
export class AlreadyConnectedError extends Error {
  constructor(readonly integrationId: string) {
    super(`a connection for "${integrationId}" already exists`);
    this.name = 'AlreadyConnectedError';
  }
}

/** The named integration is not declared in the registry. */
export class UnknownIntegrationError extends Error {
  constructor(readonly integrationId: string) {
    super(`unknown integration "${integrationId}"`);
    this.name = 'UnknownIntegrationError';
  }
}

/** The config was rejected by the integration's validator. */
export class InvalidConfigError extends Error {
  constructor(
    readonly integrationId: string,
    readonly errors: string[],
  ) {
    super(`invalid config for "${integrationId}": ${errors.join('; ')}`);
    this.name = 'InvalidConfigError';
  }
}
