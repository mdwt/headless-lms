// Connected-apps resource contract. Exposes the OAuth access tokens a user
// has issued to MCP clients so the user can inspect and revoke them.
import { z } from "zod";

export const ConnectedApp = z.object({
  id: z.string(),
  clientName: z.string(),
  scopes: z.array(z.string()),
  createdAt: z.string(),
  expiresAt: z.string().nullable(),
});
export type ConnectedApp = z.infer<typeof ConnectedApp>;

export const ConnectedAppsList = z.array(ConnectedApp);
export type ConnectedAppsList = z.infer<typeof ConnectedAppsList>;

export const ConnectedAppIdParam = z.object({ id: z.string() });
export type ConnectedAppIdParam = z.infer<typeof ConnectedAppIdParam>;
