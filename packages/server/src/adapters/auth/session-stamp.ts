// Stamps activeOrganizationId onto the caller's current session row. Used by
// the invite-accept route: the session predates the grant/link, and students
// are never org members, so the org plugin's set-active cannot do this. The
// 5-minute cookie cache still holds the pre-stamp session — callers refresh it
// client-side via getSession({ disableCookieCache: true }).
import { fromNodeHeaders } from 'better-auth/node';
import type { Auth } from './index.js';

export async function stampSessionActiveOrg(
  auth: Auth,
  headers: Record<string, string | string[] | undefined>,
  orgExternalId: string,
): Promise<boolean> {
  const sessionData = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
  const token = (sessionData?.session as { token?: string } | undefined)?.token;
  if (!token) {
    return false;
  }
  const ctx = await auth.$context;
  await ctx.internalAdapter.updateSession(token, { activeOrganizationId: orgExternalId });
  return true;
}
