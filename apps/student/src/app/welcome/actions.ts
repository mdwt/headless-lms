"use server";

/**
 * The invite landing page's only API call.
 *
 * Runs on the Next server so the browser never talks to the API directly: the
 * session cookie minted by the sign-up/sign-in that just happened rides along on
 * the action request and is forwarded verbatim (see `lib/api/server-call.ts`).
 *
 * The token is the one from the invite link. The API re-derives the invitee's
 * email from the invitation row and refuses a token whose email doesn't match
 * the session, so nothing here is steerable from the query string.
 */
import { People } from "@headless-lms/sdk";

import { authHeaders } from "@/lib/api/server-call";
import { ApiError } from "@/lib/api/shared";

export type AcceptInviteState = { error: string } | null;

export async function acceptInvite(token: string): Promise<AcceptInviteState> {
  try {
    await People.acceptInvite({ token }, await authHeaders());
  } catch (e) {
    // Only a failed request becomes a message. Anything else — including the
    // redirect server-call.ts throws on 401 — is not ours to handle.
    if (!(e instanceof ApiError)) throw e;
    return { error: messageFor(e) };
  }
  // No redirect from here: accepting stamps the session's active org, and the
  // browser's cached session still predates that stamp. The caller refreshes it
  // before navigating, or the first portal read 401s.
  return null;
}

function messageFor(e: ApiError): string {
  if (e.status === 400) {
    return "This invitation is no longer valid. Ask your course admin for a new one.";
  }
  return e.message;
}
