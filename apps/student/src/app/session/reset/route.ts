/**
 * Disposes of a session the API has rejected, then lands on /login.
 *
 * A member read answering 401 means the cookie no longer resolves to a portal
 * student, but better-auth still considers it a live session — so it has to be
 * revoked, not merely navigated away from. A Server Component render cannot set
 * cookies; a route handler can, which is why the 401 path redirects here
 * (`lib/api/server-call.ts`) instead of to the login page.
 *
 * Sign-out is delegated to the API, which owns the cookie: we forward the raw
 * `Cookie:` header and relay its `Set-Cookie` responses verbatim. Nothing here
 * names a cookie, so prefixes (`__Secure-`), `crossSubDomainCookies` and the
 * signed session-data cache stay the API's business — the same
 * forward-don't-reconstruct rule `lib/auth/server-session.ts` follows.
 */
import { type NextRequest, NextResponse } from "next/server";

import { API_URL } from "@/lib/api/server-call";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const response = NextResponse.redirect(new URL("/login", req.nextUrl), {
    // 303: whatever the browser was doing, what follows is a plain GET.
    status: 303,
  });

  const cookie = req.headers.get("cookie");
  if (cookie) {
    // better-auth rejects a cross-origin POST whose Origin it doesn't trust, so
    // send the portal's own — it is already a trusted origin for this API.
    const signedOut = await fetch(`${API_URL}/api/auth/sign-out`, {
      method: "POST",
      headers: {
        cookie,
        origin: req.nextUrl.origin,
        "content-type": "application/json",
      },
      body: "{}",
      cache: "no-store",
    }).catch(() => null);

    // A failed revocation must not strand the student on a blank error: they
    // still reach the form, and signing in mints a session that replaces this
    // one. Losing the redirect would leave them with nowhere to go.
    for (const expiry of signedOut?.headers.getSetCookie() ?? []) {
      response.headers.append("set-cookie", expiry);
    }
  }

  return response;
}
