import "server-only";

/**
 * Server-side session/org/role resolver for Server Components.
 *
 * The cross-origin shared-cookie model means the incoming request to the Next
 * server already carries the better-auth session cookie (not port-scoped in
 * dev; `Domain=.example.com` in prod). We read the raw `Cookie:` header via
 * `next/headers` and **forward it verbatim** to the API's better-auth endpoints
 * to validate — never reconstructing the cookie by name, so cookie-prefix /
 * `crossSubDomainCookies` changes don't break SSR validation. No proxy, no
 * rewrite, no better-auth running inside Next.
 *
 * Wrapped in `React.cache` so the `(dashboard)` layout and every page in the
 * same request share a single resolution (no duplicate fetches).
 */

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { API_URL } from "../api/server-call";
import { isManager } from "../roles";


export type ServerRole = "owner" | "admin" | "instructor";

export type ServerSession = {
  user: { id: string; name: string; email: string; image: string | null };
  organization: { id: string; name: string; slug: string } | null;
  role: ServerRole;
  status: "authenticated" | "no-organization" | "no-active-org" | "denied";
};

const KNOWN_ROLES: ServerRole[] = ["owner", "admin", "instructor"];
/**
 * Strict role parse — anything that isn't a staff role resolves to `null`, and
 * the caller treats the membership as invalid. Coercing unknowns to a default
 * role would let non-staff sessions through the dashboard gate.
 */
function toRole(value: unknown): ServerRole | null {
  return KNOWN_ROLES.includes(value as ServerRole) ? (value as ServerRole) : null;
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
    session?: { activeOrganizationId?: string | null };
  } | null;
  if (!data?.user) return null;

  const activeOrgId = data.session?.activeOrganizationId ?? null;

  let role: ServerRole | null = null;
  let organization: ServerSession["organization"] = null;
  let status: ServerSession["status"] = "no-organization";

  if (activeOrgId) {
    // get-session alone lacks the org role; the org plugin's active-member does.
    const [memberRes, orgRes] = await Promise.all([
      fetch(`${API_URL}/api/auth/organization/get-active-member`, {
        headers: { cookie },
        cache: "no-store",
      }),
      fetch(`${API_URL}/api/auth/organization/get-full-organization`, {
        headers: { cookie },
        cache: "no-store",
      }),
    ]);
    if (memberRes.ok) {
      const m = (await memberRes.json()) as { role?: unknown } | null;
      role = toRole(m?.role);
    }
    if (orgRes.ok) {
      const o = (await orgRes.json()) as { id?: string; name?: string; slug?: string } | null;
      if (o?.id) organization = { id: o.id, name: o.name ?? "", slug: o.slug ?? "" };
    }
    // Authenticated only when the active org resolved AND the user holds a
    // known staff role in it. Student logins get their org stamped onto the
    // session (`activeOrganizationId`) with no membership row — without the
    // role check they'd resolve as dashboard users.
    if (organization && role) status = "authenticated";
  }

  if (status !== "authenticated") {
    // Valid cookie but no usable active org + staff membership. Distinguish:
    //  - member of ≥1 org, none active → activator can pick one
    //  - no memberships, but the session carries a stamped org → a student
    //    (or otherwise non-staff) cookie: deny, the login page force-signs-out
    //  - no memberships, nothing stamped → fresh staff signup, prompt to create
    const listRes = await fetch(`${API_URL}/api/auth/organization/list`, {
      headers: { cookie },
      cache: "no-store",
    });
    const orgs = listRes.ok ? ((await listRes.json()) as unknown) : [];
    if (Array.isArray(orgs) && orgs.length > 0) {
      status = "no-active-org";
    } else {
      status = activeOrgId ? "denied" : "no-organization";
    }
    organization = null;
  }

  return {
    user: {
      id: data.user.id,
      name: data.user.name,
      email: data.user.email,
      image: data.user.image ?? null,
    },
    organization,
    role: role ?? "instructor",
    status,
  };
});

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
    // A denied session (valid cookie, no staff role) is force-signed-out by
    // the login page; plain unauthenticated just sees the sign-in form.
    redirect(session?.status === "denied" ? "/login?denied=1" : "/login");
  }
  return session as AuthenticatedSession;
}

/**
 * Like {@link requireAuth}, but also requires a manager (owner|admin): serves
 * `notFound()` to authenticated non-managers (and `redirect("/login")` when
 * there's no session). Same `pending` contract as `requireAuth`.
 */
export async function requireManager(...pending: Promise<unknown>[]): Promise<AuthenticatedSession> {
  const session = await getServerSession();
  if (!session || session.status !== "authenticated" || !isManager(session.role)) {
    for (const p of pending) void p.catch(() => {});
    if (!session) redirect("/login");
    if (session.status === "denied") redirect("/login?denied=1");
    if (session.status !== "authenticated") redirect("/login");
    notFound();
  }
  return session as AuthenticatedSession;
}
