"use client";

/**
 * Real Better Auth client, wired to the headless-LMS API (`apps/api`), which
 * mounts better-auth at `/api/auth` with the organization plugin
 * (owner/admin/instructor/student roles).
 *
 * The dashboard UI is driven by a single `Session` shape — `useDashboardSession`
 * adapts better-auth's session + the caller's active-organization membership
 * role into it, so every page/component stays unchanged.
 */

import * as React from "react";
import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

import type { Organization, Role, SessionUser } from "../api/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export const authClient = createAuthClient({
  // better-auth appends its basePath (`/api/auth`) to this origin.
  baseURL: API_URL,
  plugins: [organizationClient()],
});

export const { signIn, signOut, signUp, organization, useSession } = authClient;

/** The shape the dashboard consumes (provided via SessionProvider). */
export interface Session {
  user: SessionUser;
  organization: Organization;
  token: string;
}

const KNOWN_ROLES: Role[] = ["owner", "admin", "instructor", "student"];
function toRole(value: unknown): Role {
  return KNOWN_ROLES.includes(value as Role) ? (value as Role) : "student";
}

export type DashboardSessionStatus =
  | "loading"
  | "unauthenticated"
  | "no-organization"
  | "authenticated";

/**
 * Resolves the full dashboard session: the signed-in user, their active
 * organization, and their role in it. Ensures an active organization is
 * selected (picks the first one when none is active yet).
 */
export function useDashboardSession(): {
  data: Session | null;
  isPending: boolean;
  status: DashboardSessionStatus;
} {
  const { data: raw, isPending: sessionPending } = authClient.useSession();
  const { data: orgs, isPending: orgsPending } = authClient.useListOrganizations();
  const { data: activeOrg, isPending: activeOrgPending } = authClient.useActiveOrganization();
  const { data: activeMember, isPending: memberPending } = authClient.useActiveMember();

  const activeOrgId = raw?.session.activeOrganizationId ?? null;
  const settingRef = React.useRef(false);

  // When signed in but no organization is active yet, activate the first one.
  React.useEffect(() => {
    if (!raw) {
      settingRef.current = false;
      return;
    }
    if (!activeOrgId && orgs && orgs.length > 0 && !settingRef.current) {
      settingRef.current = true;
      void authClient.organization
        .setActive({ organizationId: orgs[0].id })
        .catch(() => {
          settingRef.current = false;
        });
    }
  }, [raw, activeOrgId, orgs]);

  if (sessionPending) return { data: null, isPending: true, status: "loading" };
  if (!raw) return { data: null, isPending: false, status: "unauthenticated" };

  // Signed in, but not a member of any organization.
  if (!orgsPending && (orgs?.length ?? 0) === 0) {
    return { data: null, isPending: false, status: "no-organization" };
  }

  // Wait for the active org + membership to resolve.
  if (!activeOrgId || activeOrgPending || memberPending || !activeOrg || !activeMember) {
    return { data: null, isPending: true, status: "loading" };
  }

  const user: SessionUser = {
    id: raw.user.id,
    name: raw.user.name,
    email: raw.user.email,
    image: raw.user.image ?? null,
    role: toRole(activeMember.role),
    // Instructor course scoping would come from the courses API
    // (course_assignments). Managers see everything regardless.
    scopedCourseIds: [],
  };
  const organization: Organization = {
    id: activeOrg.id,
    name: activeOrg.name,
    slug: activeOrg.slug,
  };

  return {
    data: { user, organization, token: raw.session.token ?? raw.session.id ?? "" },
    isPending: false,
    status: "authenticated",
  };
}
