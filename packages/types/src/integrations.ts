// integrations context — the integration contract, connection entities, and
// events. The contract (Integration, Action, ActionContext, Validation) is what
// an integration package implements to be loaded by the platform; Connection is
// an org's authenticated link to one external service.
import type { DomainEvent } from "./shared.js";

// --- The integration contract ------------------------------------------------

/** Result of an Integration validating a connection's config or an action's input. */
export type Validation = { ok: true } | { ok: false; errors: string[] };

/** What an action receives when invoked: the connection's secrets (revealed by
 *  the caller at point of use) and its configuration. */
export interface ActionContext {
  secrets: Record<string, unknown>;
  config: Record<string, unknown>;
}

/**
 * A named capability an integration exposes (e.g. slack's postToChannel).
 * Callers (automations) discover actions by id and input/output definitions,
 * then invoke them; the action's code makes the external call.
 */
export interface Action {
  id: string;
  /** One line, human-readable: what invoking this action does. */
  description: string;
  /** The input the action accepts, as JSON Schema. */
  inputSchema(): Record<string, unknown>;
  /** The output the action resolves with, as JSON Schema. */
  outputSchema(): Record<string, unknown>;
  /** Run the action against the external service. */
  invoke(ctx: ActionContext, input: unknown): Promise<unknown>;
}

/**
 * An available integration. Each integration is a module (one folder per
 * integration) satisfying this port; the set the system supports is declared
 * at startup by building a registry from them.
 */
export interface Integration {
  /** Registry key and Connection.integrationId (e.g. "stripe", "slack"). */
  id: string;
  /** The config this integration accepts, as JSON Schema (drives clients/forms). */
  configSchema(): Record<string, unknown>;
  /** The secrets this integration needs, as JSON Schema. Discovery/form
   *  rendering only — secrets stay opaque to the domain, never validated. */
  secretsSchema(): Record<string, unknown>;
  /** Validate a connection's config against this integration's schema. */
  validateConfig(config: unknown): Validation;
  /** The actions this integration can be invoked with (may be empty). */
  actions: Action[];
}

// --- Connections ---------------------------------------------------------

/**
 * A Connection is an org's authenticated link to one external service: which
 * service it is, its configuration, whether it's active, and a reference to
 * its credentials in the shared secure credential store.
 */
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

// --- Domain events (published on the shared EventBus) -----------------------

export interface ConnectionCreated extends DomainEvent {
  type: "connection.created";
  connectionId: string;
  integrationId: string;
}

export interface ConnectionUpdated extends DomainEvent {
  type: "connection.updated";
  connectionId: string;
  integrationId: string;
  /** What changed: the stored credential or the configuration/active flag. */
  changed: "credentials" | "configuration";
}

export interface ConnectionRemoved extends DomainEvent {
  type: "connection.removed";
  connectionId: string;
  integrationId: string;
}
