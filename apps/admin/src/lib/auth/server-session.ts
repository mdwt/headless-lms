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
import { cache } from "react";
import { API_URL } from "../api/server-call";


export type ServerRole = "owner" | "admin" | "instructor";

export type ServerSession = {
  user: { id: string; name: string; email: string; image: string | null };
  organization: { id: string; name: string; slug: string } | null;
  role: ServerRole;
  status: "authenticated" | "no-organization" | "no-active-org";
};

const KNOWN_ROLES: ServerRole[] = ["owner", "admin", "instructor"];
function toRole(value: unknown): ServerRole {
  return KNOWN_ROLES.includes(value as ServerRole) ? (value as ServerRole) : "instructor";
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

  let role: ServerRole = "instructor";
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
    status = "authenticated";
  } else {
    // Authenticated but no active org selected yet. Distinguish "has orgs but
    // none active" (activator can pick one) from "no orgs at all" (prompt to
    // create). The server can't set a cookie mid-render, so the activation is
    // handed to a client island.
    const listRes = await fetch(`${API_URL}/api/auth/organization/list`, {
      headers: { cookie },
      cache: "no-store",
    });
    const orgs = listRes.ok ? ((await listRes.json()) as unknown) : [];
    status = Array.isArray(orgs) && orgs.length > 0 ? "no-active-org" : "no-organization";
  }

  return {
    user: {
      id: data.user.id,
      name: data.user.name,
      email: data.user.email,
      image: data.user.image ?? null,
    },
    organization,
    role,
    status,
  };
});
