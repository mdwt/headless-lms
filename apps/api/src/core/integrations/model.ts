// integrations context — domain entities & DTOs. Framework-free.
// A Connection is an org's authenticated link to one external service: which
// service it is, its configuration, whether it's active, and a reference to
// its credentials in the shared secure credential store. The domain owns the
// connection and its lifecycle; it never calls the external service.

export interface Connection {
  readonly id: string;
  /** The external service this connection links to (e.g. "stripe", "slack"). */
  service: string;
  /** Service-specific configuration (e.g. field mappings). Never secret. */
  config: Record<string, unknown>;
  active: boolean;
  /** Reference into the secure credential store; callers reveal at point of use. */
  credentialRef: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectInput {
  service: string;
  /** The secret to hold for this connection (API key, token, …), any shape. */
  credential: string;
  config?: Record<string, unknown> | undefined;
}

export interface ConfigureInput {
  config?: Record<string, unknown> | undefined;
  active?: boolean | undefined;
}

/** An org already has a connection for this service (one per service per org). */
export class AlreadyConnectedError extends Error {
  constructor(readonly service: string) {
    super(`a connection for "${service}" already exists`);
    this.name = "AlreadyConnectedError";
  }
}
