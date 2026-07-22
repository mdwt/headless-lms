// integrations context — ports. The integration contract itself (Integration,
// Action, ActionContext, Validation) is owned by @headless-lms/types so
// integration packages and the platform share one definition; the context
// re-exports it as part of its public surface.
import type { Integration } from "@headless-lms/types";
import type { ConfigureInput, ConnectInput, Connection } from "./model.js";
import type { CredentialStore, OutboxAppender, UnitOfWork } from "../shared/ports.js";

export type { Validation, ActionContext, Action, Integration } from "@headless-lms/types";

/** The integrations declared at startup. Unknown ids are rejected by the service. */
export interface IntegrationsRegistry {
  get(id: string): Integration | null;
  list(): Integration[];
}

/** A declared integration as surfaced to clients: id, config schema, actions. */
export interface AvailableIntegration {
  id: string;
  configSchema: Record<string, unknown>;
  secretsSchema: Record<string, unknown>;
  actions: {
    id: string;
    description: string;
    inputSchema: Record<string, unknown>;
    outputSchema: Record<string, unknown>;
  }[];
}

// Inbound port (use cases the service exposes).
export interface IntegrationsService {
  /** The integrations declared in this deployment, with their config schemas. */
  available(): AvailableIntegration[];
  /** Establish a connection for an org; stores its credential and configuration. */
  connect(orgId: string, input: ConnectInput): Promise<Connection>;
  /** Replace a connection's stored secrets (re-auth / token refresh). */
  reconnect(
    orgId: string,
    id: string,
    secrets: Record<string, unknown>,
  ): Promise<Connection | null>;
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

/** Tx-scoped port bundle for this context's mutating use cases. Folding the
 *  credential store in makes credential + connection writes + outbox append
 *  one transaction (closes the historical orphan-credential window). */
export interface IntegrationsTxScope {
  connections: ConnectionsRepository;
  credentials: CredentialStore;
  outbox: OutboxAppender;
}

export type IntegrationsUnitOfWork = UnitOfWork<IntegrationsTxScope>;
