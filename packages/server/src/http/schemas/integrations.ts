// Integrations resource schemas. A Connection is an org's link to one external
// service (Stripe, Slack, …). Secrets are WRITE-ONLY: accepted on
// connect/reconnect, stored encrypted server-side, and never appear in any
// response — responses carry configuration and state only.
import { z } from 'zod';
import { connectionSchema, jsonRecordSchema } from '@headless-lms/core/schemas';

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

/** The connection row minus credentialRef — not even the reference leaks. */
export const Connection = connectionSchema.omit({ credentialRef: true });
export type Connection = z.infer<typeof Connection>;

export const ConnectionsList = z.array(Connection);
export type ConnectionsList = z.infer<typeof ConnectionsList>;

export const ConnectionIdParam = z.object({ id: z.string() });
export type ConnectionIdParam = z.infer<typeof ConnectionIdParam>;

export const ConnectRequest = z.object({
  integrationId: z.string().min(1),
  /** The connection's secrets (API keys, tokens, …). Write-only, never returned;
   *  stored as one encrypted JSON document. */
  secrets: jsonRecordSchema,
  config: jsonRecordSchema.optional(),
});
export type ConnectRequest = z.infer<typeof ConnectRequest>;

export const ReconnectRequest = z.object({
  secrets: jsonRecordSchema,
});
export type ReconnectRequest = z.infer<typeof ReconnectRequest>;

export const ConfigureRequest = z.object({
  config: jsonRecordSchema.optional(),
  active: z.boolean().optional(),
});
export type ConfigureRequest = z.infer<typeof ConfigureRequest>;

export const ConnectionActionParams = z.object({ id: z.string(), actionId: z.string() });
export type ConnectionActionParams = z.infer<typeof ConnectionActionParams>;

/** The action's input, per its declared inputSchema. */
export const InvokeActionRequest = z.object({
  input: z.record(z.string(), z.unknown()).optional(),
});
export type InvokeActionRequest = z.infer<typeof InvokeActionRequest>;

/** Whatever the action resolved with, per its declared outputSchema. */
export const ActionInvocationResult = z.object({
  output: z.record(z.string(), z.unknown()),
});
export type ActionInvocationResult = z.infer<typeof ActionInvocationResult>;
