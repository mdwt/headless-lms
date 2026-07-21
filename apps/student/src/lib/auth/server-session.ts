import "server-only";

/**
 * Server-side session resolver for Server Components.
 *
 * The cross-origin shared-cookie model means the incoming request to the Next
 * server already carries the better-auth session cookie (not port-scoped in
 * dev; `Domain=.example.com` in prod). We read the raw `Cookie:` header via
 * `next/headers` and **forward it verbatim** to the API's better-auth
 * get-session endpoint to validate — never reconstructing the cookie by name,
 * so cookie-prefix / `crossSubDomainCookies` changes don't break SSR
 * validation. No proxy, no rewrite, no better-auth running inside Next.
 *
 * Wrapped in `React.cache` so every page in the same request shares a single
 * resolution (no duplicate fetches). The student app has no org/role, so the
 * resolver returns just the authenticated user.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

export const API_URL =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface ServerSession {
  user: { id: string; name: string; email: string; image: string | null };
}

export const getServerSession = cache(async (): Promise<ServerSession | null> => {
  const cookie = (await cookies()).toString();
  if (!cookie) return null;
  const res = await fetch(`${API_URL}/api/auth/get-session`, {
    headers: { cookie },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    user?: { id: string; name: string; email: string; image?: string | null };
  } | null;
  if (!data?.user) return null;
  return {
    user: {
      id: data.user.id,
      name: data.user.name,
      email: data.user.email,
      image: data.user.image ?? null,
    },
  };
});

/**
 * Gate a Server Component on an authenticated session; `redirect("/login")`
 * otherwise. Free per request — it wraps the `React.cache`'d resolver.
 *
 * Pass any fetches you kicked off *before* the gate (to overlap them with auth)
 * as `pending`: on the redirect path they're discarded so a late rejection
 * doesn't surface as an unhandled rejection while the request unwinds.
 */
export async function requireAuth(...pending: Promise<unknown>[]): Promise<ServerSession> {
  const session = await getServerSession();
  if (!session) {
    for (const p of pending) void p.catch(() => {});
    redirect("/login");
  }
  return session;
}
