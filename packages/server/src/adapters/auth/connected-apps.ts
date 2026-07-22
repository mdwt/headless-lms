// Repository for the "connected apps" feature — lets users inspect and revoke
// the OAuth access tokens they have issued to MCP clients. Owned by the auth
// adapter because it directly queries the oauth_access_token, oauth_application,
// and oauth_consent tables that belong to better-auth.
import { eq, and, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { oauthAccessToken, oauthConsent } from './schema.js';

export interface ConnectedAppRow {
  id: string;
  clientName: string;
  scopes: string[];
  createdAt: string;
  expiresAt: string | null;
}

export interface ConnectedAppsRepo {
  list(userId: string): Promise<ConnectedAppRow[]>;
  revoke(userId: string, clientId: string): Promise<boolean>;
}

// One row per client app with raw-SQL DISTINCT ON because Drizzle's query
// builder does not expose that PostgreSQL syntax. The intersection with
// Record<string, unknown> satisfies db.execute()'s generic constraint.
type TokenRow = Record<string, unknown> & {
  id: string;
  client_name: string | null;
  scopes: string;
  created_at: Date;
  expires_at: Date;
};

export function createConnectedAppsRepo(db: NodePgDatabase): ConnectedAppsRepo {
  return {
    async list(userId) {
      // Return one row per clientId — the most-recent active authorization.
      // "Active" means refreshTokenExpiresAt is still in the future.
      const result = await db.execute<TokenRow>(sql`
        SELECT DISTINCT ON (t.client_id)
          t.client_id         AS id,
          a.name              AS client_name,
          t.scopes,
          t.created_at,
          t.refresh_token_expires_at AS expires_at
        FROM   oauth_access_token t
        LEFT JOIN oauth_application a ON a.client_id = t.client_id
        WHERE  t.user_id = ${userId}
          AND  t.refresh_token_expires_at > NOW()
        ORDER  BY t.client_id, t.created_at DESC
      `);

      return result.rows.map((row) => ({
        id: row.id,
        clientName: row.client_name ?? 'Unknown',
        // OAuth2 scopes are stored as a space-separated string (notNull).
        scopes: row.scopes.split(' ').filter(Boolean),
        createdAt: row.created_at.toISOString(),
        expiresAt: row.expires_at.toISOString(),
      }));
    },

    async revoke(userId, clientId) {
      // Delete every token row for this user+client AND the consent record so
      // Better Auth's OIDC /authorize will prompt again instead of re-issuing
      // silently.
      const [deletedTokens, deletedConsent] = await Promise.all([
        db
          .delete(oauthAccessToken)
          .where(and(eq(oauthAccessToken.userId, userId), eq(oauthAccessToken.clientId, clientId)))
          .returning({ id: oauthAccessToken.id }),
        db
          .delete(oauthConsent)
          .where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.clientId, clientId)))
          .returning({ id: oauthConsent.id }),
      ]);
      return deletedTokens.length > 0 || deletedConsent.length > 0;
    },
  };
}
