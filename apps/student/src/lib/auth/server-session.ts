import "server-only";

/**
 * Server-side session resolver for Server Components.
 *
 * The browser signs in through `/api` on this app's own domain, so the request
 * to the Next server carries the better-auth session cookie. We read the raw
 * `Cookie:` header via `next/headers` and **forward it verbatim** to the API's
 * better-auth get-session endpoint to validate — never reconstructing the
 * cookie by name, so cookie-prefix / `crossSubDomainCookies` changes don't
 * break SSR validation. No better-auth running inside Next.
 *
 * Wrapped in `React.cache` so every page in the same request shares a single
 * resolution (no duplicate fetches). The student app has no org/role, so the
 * resolver returns just the authenticated user.
 */

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { API_URL } from "@/lib/api/api-url";
import { visitorHeaders } from "@/lib/api/visitor";
import { requireCourseApp } from "@/lib/app";

type SessionPerson = { id: string; name: string; email: string; image: string | null };

export interface ServerSession {
  user: SessionPerson;
}

export const getServerSession = cache(async (): Promise<ServerSession | null> => {
  const cookie = (await cookies()).toString();
  if (!cookie) return null;
  const res = await fetch(`${API_URL}/api/auth/get-session`, {
    headers: { cookie, ...visitorHeaders(await headers()) },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    user?: SessionPerson;
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
 * Gate a Server Component on this domain being an app that serves courses (404
 * otherwise) and on an authenticated session; `redirect("/login")` otherwise.
 * Free per request — it wraps the `React.cache`'d resolvers.
 *
 * Pass any fetches you kicked off *before* the gate (to overlap them with auth)
 * as `pending`: on the redirect path they're discarded so a late rejection
 * doesn't surface as an unhandled rejection while the request unwinds.
 */
export async function requireAuth(...pending: Promise<unknown>[]): Promise<ServerSession> {
  for (const p of pending) void p.catch(() => {});
  await requireCourseApp();
  const session = await getServerSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}
