// integrations context — domain entities & DTOs. Framework-free.
// A Connection is an org's authenticated link to one external service: which
// service it is, its configuration, whether it's active, and a reference to
// its credentials in the shared secure credential store. The domain owns the
// connection and its lifecycle; it never calls the external service.

export interface Connection {
  readonly id: string;
  /** Which integration this connection links to (an Integration id, e.g. "stripe"). */
  integrationId: string;
  /** Integration-specific configuration (e.g. field mappings). Never secret. */
  config: Record<string, unknown>;
  active: boolean;
  /** Reference into the secure credential store; callers reveal at point of use. */
  credentialRef: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectInput {
  integrationId: string;
  /** The connection's secrets (API keys, tokens, …) — encrypted as one JSON document. */
  secrets: Record<string, unknown>;
  config?: Record<string, unknown> | undefined;
}

export interface ConfigureInput {
  config?: Record<string, unknown> | undefined;
  active?: boolean | undefined;
}

/** Result of an Integration validating a connection's config. */
export type ConfigValidation = { ok: true } | { ok: false; errors: string[] };

/** An org already has a connection for this integration (one per integration per org). */
export class AlreadyConnectedError extends Error {
  constructor(readonly integrationId: string) {
    super(`a connection for "${integrationId}" already exists`);
    this.name = "AlreadyConnectedError";
  }
}

/** The named integration is not declared in the registry. */
export class UnknownIntegrationError extends Error {
  constructor(readonly integrationId: string) {
    super(`unknown integration "${integrationId}"`);
    this.name = "UnknownIntegrationError";
  }
}

/** The config was rejected by the integration's validator. */
export class InvalidConfigError extends Error {
  constructor(
    readonly integrationId: string,
    readonly errors: string[],
  ) {
    super(`invalid config for "${integrationId}": ${errors.join("; ")}`);
    this.name = "InvalidConfigError";
  }
}
