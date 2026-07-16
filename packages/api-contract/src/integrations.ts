// Integrations resource schemas. A Connection is an org's link to one external
// service (Stripe, Slack, …). Secrets are WRITE-ONLY: accepted on
// connect/reconnect, stored encrypted server-side, and never appear in any
// response — responses carry configuration and state only.
import { z } from "zod";

/** An action an integration can be invoked with; schemas are JSON Schema. */
export const IntegrationActionInfo = z.object({
  id: z.string(),
  description: z.string(),
  inputSchema: z.record(z.string(), z.unknown()),
  outputSchema: z.record(z.string(), z.unknown()),
});
export type IntegrationActionInfo = z.infer<typeof IntegrationActionInfo>;

/** An integration this deployment supports; configSchema is JSON Schema for its config. */
export const AvailableIntegration = z.object({
  id: z.string(),
  configSchema: z.record(z.string(), z.unknown()),
  /** JSON Schema of the secrets the integration needs (form rendering only). */
  secretsSchema: z.record(z.string(), z.unknown()),
  actions: z.array(IntegrationActionInfo),
});
export type AvailableIntegration = z.infer<typeof AvailableIntegration>;

export const AvailableIntegrationsList = z.array(AvailableIntegration);
export type AvailableIntegrationsList = z.infer<typeof AvailableIntegrationsList>;

export const Connection = z.object({
  id: z.string(),
  /** Which integration this connection links to (e.g. "stripe"). Must be declared server-side. */
  integrationId: z.string(),
  config: z.record(z.string(), z.unknown()),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Connection = z.infer<typeof Connection>;

export const ConnectionsList = z.array(Connection);
export type ConnectionsList = z.infer<typeof ConnectionsList>;

export const ConnectionIdParam = z.object({ id: z.string() });
export type ConnectionIdParam = z.infer<typeof ConnectionIdParam>;

export const ConnectRequest = z.object({
  integrationId: z.string().min(1),
  /** The connection's secrets (API keys, tokens, …). Write-only, never returned;
   *  stored as one encrypted JSON document. */
  secrets: z.record(z.string(), z.unknown()),
  config: z.record(z.string(), z.unknown()).optional(),
});
export type ConnectRequest = z.infer<typeof ConnectRequest>;

export const ReconnectRequest = z.object({
  secrets: z.record(z.string(), z.unknown()),
});
export type ReconnectRequest = z.infer<typeof ReconnectRequest>;

export const ConfigureRequest = z.object({
  config: z.record(z.string(), z.unknown()).optional(),
  active: z.boolean().optional(),
});
export type ConfigureRequest = z.infer<typeof ConfigureRequest>;
