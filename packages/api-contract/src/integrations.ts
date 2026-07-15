// Integrations resource schemas. A Connection is an org's link to one external
// service (Stripe, Slack, …). The credential is WRITE-ONLY: it is accepted on
// connect/reconnect, stored encrypted server-side, and never appears in any
// response — responses carry configuration and state only.
import { z } from "zod";

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
  /** The secret to store (API key, token, …). Write-only, never returned. */
  credential: z.string().min(1),
  config: z.record(z.string(), z.unknown()).optional(),
});
export type ConnectRequest = z.infer<typeof ConnectRequest>;

export const ReconnectRequest = z.object({
  credential: z.string().min(1),
});
export type ReconnectRequest = z.infer<typeof ReconnectRequest>;

export const ConfigureRequest = z.object({
  config: z.record(z.string(), z.unknown()).optional(),
  active: z.boolean().optional(),
});
export type ConfigureRequest = z.infer<typeof ConfigureRequest>;
