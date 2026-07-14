// integrations context — ports.
import type { ConfigureInput, ConnectInput, Connection } from "./model.js";

// Inbound port (use cases the service exposes).
export interface IntegrationsService {
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
  /** The connection consumers (billing, automations) resolve a service by name. */
  getByService(orgId: string, service: string): Promise<Connection | null>;
}

// Outbound port (persistence contract the repository fulfils).
export interface ConnectionsRepository {
  insert(orgId: string, connection: Connection): Promise<Connection>;
  findById(orgId: string, id: string): Promise<Connection | null>;
  findByService(orgId: string, service: string): Promise<Connection | null>;
  list(orgId: string): Promise<Connection[]>;
  update(
    orgId: string,
    id: string,
    patch: Partial<Pick<Connection, "config" | "active" | "updatedAt">>,
  ): Promise<Connection | null>;
  delete(orgId: string, id: string): Promise<boolean>;
}
