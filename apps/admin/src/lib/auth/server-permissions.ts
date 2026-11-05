import "server-only";

import { cache } from "react";
import { notFound } from "next/navigation";
import { Access } from "@headless-lms/sdk";

import { authHeaders } from "../api/server-call";
import {
  permissionsOf,
  type MyPermissions,
  type Permission,
  type Permissions,
} from "../permissions";
import { requireAuth, type AuthenticatedSession } from "./server-session";

export const getMyPermissions = cache(async (): Promise<MyPermissions> => {
  await requireAuth();
  return await Access.getMyPermissions(await authHeaders());
});

export async function getPermissions(): Promise<Permissions> {
  return permissionsOf(await getMyPermissions());
}

export async function requirePermission(
  permission: Permission | Permission[],
  contentId?: string,
): Promise<{ session: AuthenticatedSession; permissions: Permissions }> {
  const session = await requireAuth();
  const permissions = await getPermissions();
  const wanted = Array.isArray(permission) ? permission : [permission];
  const allowed =
    contentId === undefined
      ? permissions.anywhereAny(wanted)
      : permissions.hasAny(wanted, contentId);
  if (!allowed) notFound();
  return { session, permissions };
}
