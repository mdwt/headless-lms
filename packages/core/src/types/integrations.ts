// integrations context — the integration contract, connection entities, and
// events. The contract (Integration, Action, ActionContext, Validation) is what
// an integration package implements to be loaded by the platform; Connection is
// an org's authenticated link to one external service.
import type { Validation } from './schemas/integrations.js';

export type {
  ConfigureInput,
  ConnectInput,
  Connection,
  Validation,
} from './schemas/integrations.js';

// --- The integration contract ------------------------------------------------

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
