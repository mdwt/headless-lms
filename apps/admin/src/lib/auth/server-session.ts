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
 * The API enriches get-session via `customSession` with the caller's active
 * role, active org, and memberships, so the whole resolution is a single call —
 * no fan-out to get-active-member / get-full-organization / organization/list.
 *
 * Wrapped in `React.cache` so the `(dashboard)` layout and every page in the
 * same request share a single resolution (no duplicate fetches).
 */

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { API_URL } from "../api/api-url";
import { isManager } from "../roles";
import { logger } from "@/lib/log";

const log = logger.child({ name: "auth" });

export type ServerRole = "owner" | "admin" | "instructor";

type SessionPerson = { id: string; name: string; email: string; image: string | null };

export type ServerSession = {
  user: SessionPerson;
  organization: { id: string; name: string; slug: string } | null;
  /** Every org the user is a member of. Populated when no org is active yet. */
  organizations: { id: string; name: string; slug: string }[];
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
  if (!res.ok) {
    log.warn({ status: res.status }, "session rejected by api");
    return null;
  }
  const data = (await res.json()) as {
    user?: SessionPerson;
    session?: { activeOrganizationId?: string | null };
    activeMemberRole?: unknown;
    activeOrganization?: { id?: string; name?: string; slug?: string } | null;
    organizations?: unknown;
  } | null;
  if (!data?.user) {
    log.debug("no session on request");
    return null;
  }

  const activeOrgId = data.session?.activeOrganizationId ?? null;

  // Authenticated only when the active org resolved AND the user holds a
  // known staff role in it. Student logins get their org stamped onto the
  // session (`activeOrganizationId`) with no membership row — without the
  // role check they'd resolve as dashboard users.
  const role = toRole(data.activeMemberRole);
  if (!role && data.activeMemberRole != null)
    log.debug({ rawRole: data.activeMemberRole }, "active member holds no staff role");

  let organization: ServerSession["organization"] = data.activeOrganization?.id
    ? {
        id: data.activeOrganization.id,
        name: data.activeOrganization.name ?? "",
        slug: data.activeOrganization.slug ?? "",
      }
    : null;

  let status: ServerSession["status"];
  let organizations: ServerSession["organizations"] = [];
  if (organization && role) {
    status = "authenticated";
  } else {
    // Valid cookie but no usable active org + staff membership. Distinguish:
    //  - member of ≥1 org, none active → the picker can offer them
    //  - no memberships, but the session carries a stamped org → a student
    //    (or otherwise non-staff) cookie: deny
    //  - no memberships, nothing stamped → fresh staff signup, prompt to create
    const raw = data.organizations;
    organizations = Array.isArray(raw)
      ? raw
          .filter(
            (o): o is { id: string; name?: string; slug?: string } =>
              !!o && typeof o === "object" && typeof (o as { id?: unknown }).id === "string",
          )
          .map((o) => ({ id: o.id, name: o.name ?? "", slug: o.slug ?? "" }))
      : [];
    status =
      organizations.length > 0 ? "no-active-org" : activeOrgId ? "denied" : "no-organization";
    organization = null;
  }

  // The single line that explains every redirect the gates make.
  log.debug(
    { userId: data.user.id, status, activeOrgId, orgCount: organizations.length, role },
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
    role: role ?? "instructor",
    status,
  };
});

/**
 * The data-access gate: every server-side API call runs through this via
 * `authHeaders()`, so authorization is enforced where the data is fetched
 * rather than re-declared on each route.
 *
 * It requires a *valid, staff-eligible* session and nothing more. An active org
 * is deliberately not required: the org-creation and org-activation flows call
 * the API while the session still has no active org, so gating on one here
 * would deadlock onboarding. Route-level org and role expectations stay with
 * `requireAuth` / `requireManager`.
 *
 * Free after the first call in a request — it wraps the `React.cache`'d resolver.
 */
export async function requireOrgSession(): Promise<ServerSession> {
  const session = await getServerSession();
  if (!session) redirect("/login");
  // Valid cookie, no staff role — /onboarding explains it.
  if (session.status === "denied") redirect("/onboarding");
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

/**
 * Like {@link requireAuth}, but also requires a manager (owner|admin): serves
 * `notFound()` to authenticated non-managers (and `redirect("/login")` when
 * there's no session). Same `pending` contract as `requireAuth`.
 */
export async function requireManager(
  ...pending: Promise<unknown>[]
): Promise<AuthenticatedSession> {
  const session = await getServerSession();
  if (!session || session.status !== "authenticated" || !isManager(session.role)) {
    for (const p of pending) void p.catch(() => {});
    if (!session) redirect("/login");
    if (session.status !== "authenticated") redirect("/onboarding");
    notFound();
  }
  return session as AuthenticatedSession;
}
