import "server-only";

/**
 * Server-side session/org resolver for Server Components.
 *
 * The cross-origin shared-cookie model means the incoming request to the Next
 * server already carries the better-auth session cookie (not port-scoped in
 * dev; `Domain=.example.com` in prod). We read the raw `Cookie:` header via
 * `next/headers` and **forward it verbatim** to the API's better-auth endpoints
 * to validate — never reconstructing the cookie by name, so cookie-prefix /
 * `crossSubDomainCookies` changes don't break SSR validation. No proxy, no
 * rewrite, no better-auth running inside Next.
 *
 * The API enriches get-session via `customSession` with the caller's active
 * org and memberships, so the whole resolution is a single call —
 * no fan-out to get-active-member / get-full-organization / organization/list.
 *
 * Wrapped in `React.cache` so the `(dashboard)` layout and every page in the
 * same request share a single resolution (no duplicate fetches).
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { API_URL } from "../api/api-url";
import { logger } from "@/lib/log";

const log = logger.child({ name: "auth" });

type SessionPerson = { id: string; name: string; email: string; image: string | null };

export type ServerSession = {
  user: SessionPerson;
  organization: { id: string; name: string; slug: string } | null;
  organizations: { id: string; name: string; slug: string }[];
  status: "authenticated" | "no-organization" | "no-active-org";
};

export const getServerSession = cache(async (): Promise<ServerSession | null> => {
  const cookie = (await cookies()).toString();
  if (!cookie) return null;

  const res = await fetch(`${API_URL}/api/auth/get-session`, {
    headers: { cookie },
    cache: "no-store",
  });
  if (!res.ok) {
    log.warn({ status: res.status }, "session rejected by api");
    return null;
  }
  const data = (await res.json()) as {
    user?: SessionPerson;
    session?: { activeOrganizationId?: string | null };
    activeOrganization?: { id?: string; name?: string; slug?: string } | null;
    organizations?: unknown;
  } | null;
  if (!data?.user) {
    log.debug("no session on request");
    return null;
  }

  const activeOrgId = data.session?.activeOrganizationId ?? null;

  const organization: ServerSession["organization"] = data.activeOrganization?.id
    ? {
        id: data.activeOrganization.id,
        name: data.activeOrganization.name ?? "",
        slug: data.activeOrganization.slug ?? "",
      }
    : null;

  const raw = data.organizations;
  const organizations: ServerSession["organizations"] = Array.isArray(raw)
    ? raw
        .filter(
          (o): o is { id: string; name?: string; slug?: string } =>
            !!o && typeof o === "object" && typeof (o as { id?: unknown }).id === "string",
        )
        .map((o) => ({ id: o.id, name: o.name ?? "", slug: o.slug ?? "" }))
    : [];

  const status: ServerSession["status"] = organization
    ? "authenticated"
    : organizations.length > 0
      ? "no-active-org"
      : "no-organization";

  log.debug(
    { userId: data.user.id, status, activeOrgId, orgCount: organizations.length },
    "session resolved",
  );

  return {
    user: {
      id: data.user.id,
      name: data.user.name,
      email: data.user.email,
      image: data.user.image ?? null,
    },
    organization,
    organizations,
    status,
  };
});

/**
 * The data-access gate: every server-side API call runs through this via
 * `authHeaders()`, so authorization is enforced where the data is fetched
 * rather than re-declared on each route.
 *
 * It requires a valid session and nothing more. An active org
 * is deliberately not required: the org-creation and org-activation flows call
 * the API while the session still has no active org, so gating on one here
 * would deadlock onboarding. Route-level org and permission expectations stay with
 * `requireAuth` / `requirePermission`.
 *
 * Free after the first call in a request — it wraps the `React.cache`'d resolver.
 */
export async function requireOrgSession(): Promise<ServerSession> {
  const session = await getServerSession();
  if (!session) redirect("/login");
  return session;
}

/** An authenticated session with a resolved active org (`organization` non-null). */
export type AuthenticatedSession = ServerSession & {
  status: "authenticated";
  organization: NonNullable<ServerSession["organization"]>;
};

/**
 * Gate a Server Component on an authenticated session with an active org,
 * returning it with `organization` narrowed non-null; `redirect("/login")`
 * otherwise. Free per request — it wraps the `React.cache`'d resolver, so the
 * layout and every page in the request share a single auth resolution.
 *
 * Pass any fetches you kicked off *before* the gate (to overlap them with auth)
 * as `pending`: on the redirect path they're discarded so a late rejection
 * doesn't surface as an unhandled rejection while the request unwinds.
 */
export async function requireAuth(...pending: Promise<unknown>[]): Promise<AuthenticatedSession> {
  const session = await getServerSession();
  if (!session || session.status !== "authenticated" || !session.organization) {
    for (const p of pending) void p.catch(() => {});
    redirect(session ? "/onboarding" : "/login");
  }
  return session as AuthenticatedSession;
}
