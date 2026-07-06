import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge auth gate for the `(dashboard)` route group.
 *
 * This is a cheap **presence-only** check: it looks for the better-auth session
 * cookie and bounces obviously-unauthenticated deep links to `/login` instantly,
 * without a network round-trip on the edge hot path. Real validation (expired /
 * invalid cookie, org, role) happens in the `(dashboard)` server layout, which
 * forwards the raw cookie to the API's get-session endpoint — a round-trip it
 * needs anyway for the session data.
 *
 * Cookie names cover both the dev (host-only) and prod (`__Secure-` prefixed)
 * forms better-auth emits. We never reconstruct or parse the cookie by name for
 * validation — that stays server-side by forwarding the whole `Cookie:` header.
 */
const SESSION_COOKIE_HINTS = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
];

export function proxy(req: NextRequest) {
  const hasSession = SESSION_COOKIE_HINTS.some((name) => req.cookies.has(name));
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Guard everything except the login page, Next internals, and the (unused
  // here) /api namespace. The dashboard group is what remains.
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico|api).*)"],
};
