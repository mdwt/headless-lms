// Repository for the "connected apps" feature — lets users inspect and revoke
// the OAuth access tokens they have issued to MCP clients. Owned by the auth
// adapter because it directly queries the oauth_access_token and
// oauth_application tables that belong to better-auth.
import { eq, and } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { oauthAccessToken, oauthApplication } from "./schema.js";

export interface ConnectedAppRow {
  id: string;
  clientName: string;
  scopes: string[];
  createdAt: string;
  expiresAt: string | null;
}

export interface ConnectedAppsRepo {
  list(userId: string): Promise<ConnectedAppRow[]>;
  revoke(userId: string, id: string): Promise<boolean>;
}

export function createConnectedAppsRepo(db: NodePgDatabase): ConnectedAppsRepo {
  return {
    async list(userId) {
      const rows = await db
        .select({
          id: oauthAccessToken.id,
          clientName: oauthApplication.name,
          scopes: oauthAccessToken.scopes,
          createdAt: oauthAccessToken.createdAt,
          expiresAt: oauthAccessToken.accessTokenExpiresAt,
        })
        .from(oauthAccessToken)
        .leftJoin(oauthApplication, eq(oauthAccessToken.clientId, oauthApplication.clientId))
        .where(eq(oauthAccessToken.userId, userId));

      return rows.map((row) => ({
        id: row.id,
        clientName: row.clientName ?? "Unknown",
        // OAuth2 scopes are stored as a space-separated string.
        scopes: row.scopes ? row.scopes.split(" ").filter(Boolean) : [],
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt?.toISOString() ?? null,
      }));
    },

    async revoke(userId, id) {
      const deleted = await db
        .delete(oauthAccessToken)
        .where(and(eq(oauthAccessToken.id, id), eq(oauthAccessToken.userId, userId)))
        .returning({ id: oauthAccessToken.id });
      return deleted.length > 0;
    },
  };
}
