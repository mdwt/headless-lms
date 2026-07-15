// integrations context — ports.
import type { ConfigValidation, ConfigureInput, ConnectInput, Connection } from "./model.js";

/**
 * An available integration. Each integration is a module (one folder per
 * integration) satisfying this port; the set the system supports is declared
 * at startup by building an IntegrationsRegistry from them.
 */
export interface Integration {
  /** Registry key and Connection.integrationId (e.g. "stripe", "slack"). */
  id: string;
  /** The config this integration accepts, as JSON Schema (drives clients/forms). */
  configSchema(): Record<string, unknown>;
  /** Validate a connection's config against this integration's schema. */
  validateConfig(config: unknown): ConfigValidation;
}

/** The integrations declared at startup. Unknown ids are rejected by the service. */
export interface IntegrationsRegistry {
  get(id: string): Integration | null;
  list(): Integration[];
}

/** A declared integration as surfaced to clients: its id and config schema. */
export interface AvailableIntegration {
  id: string;
  configSchema: Record<string, unknown>;
}

// Inbound port (use cases the service exposes).
export interface IntegrationsService {
  /** The integrations declared in this deployment, with their config schemas. */
  available(): AvailableIntegration[];
  /** Establish a connection for an org; stores its credential and configuration. */
  connect(orgId: string, input: ConnectInput): Promise<Connection>;
  /** Replace a connection's stored credential (re-auth / token refresh). */
  reconnect(orgId: string, id: string, credential: string): Promise<Connection | null>;
  /** Set or change a connection's configuration and/or active flag. */
  configure(orgId: string, id: string, input: ConfigureInput): Promise<Connection | null>;
  /** Remove a connection and destroy its credential. */
  disconnect(orgId: string, id: string): Promise<boolean>;
  list(orgId: string): Promise<Connection[]>;
  get(orgId: string, id: string): Promise<Connection | null>;
  /** The connection consumers (billing, automations) resolve an integration by id. */
  getByIntegration(orgId: string, integrationId: string): Promise<Connection | null>;
}

// Outbound port (persistence contract the repository fulfils).
export interface ConnectionsRepository {
  insert(orgId: string, connection: Connection): Promise<Connection>;
  findById(orgId: string, id: string): Promise<Connection | null>;
  findByIntegration(orgId: string, integrationId: string): Promise<Connection | null>;
  list(orgId: string): Promise<Connection[]>;
  update(
    orgId: string,
    id: string,
    patch: Partial<Pick<Connection, "config" | "active" | "updatedAt">>,
  ): Promise<Connection | null>;
  delete(orgId: string, id: string): Promise<boolean>;
}
