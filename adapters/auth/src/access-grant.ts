import type { AccessGrant } from "@headless-lms/core/types";
import { ORG_CLAIM } from "@headless-lms/core/identity";
import { ACCESS_SCOPES, type AccessScope, isAccessScope } from "@headless-lms/core/organizations";
import { type AccessTokenAuthorization, parseAccessTokenAuthorization } from "better-auth/oauth2";

export function accessTokenAuthorization(
  header: string | string[] | undefined,
): AccessTokenAuthorization | null {
  if (typeof header !== "string") {
    return null;
  }
  const authorization = parseAccessTokenAuthorization(header);
  if (!authorization?.token || authorization.scheme === "Unknown") {
    return null;
  }
  return authorization;
}

export function isCompactJws(token: string): boolean {
  const parts = token.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

export function grantFromClaims(claims: Record<string, unknown>): AccessGrant | null {
  const userId = claims.sub;
  const clientId = claims.client_id ?? claims.azp;
  const orgId = claims[ORG_CLAIM];
  if (typeof userId !== "string" || typeof clientId !== "string" || typeof orgId !== "string") {
    return null;
  }
  const scopes =
    typeof claims.scope === "string" ? claims.scope.split(" ").filter(isAccessScope) : [];
  return { userId, clientId, orgId, scopes };
}

export async function needsOrgChoice(
  activeOrgId: string | null,
  memberOrgIds: () => Promise<readonly string[]>,
): Promise<boolean> {
  if (activeOrgId === null) {
    return true;
  }
  return !(await memberOrgIds()).includes(activeOrgId);
}

export async function consentOrgId(
  activeOrgId: string | null,
  memberOrgIds: () => Promise<readonly string[]>,
): Promise<string | null> {
  return activeOrgId !== null && !(await needsOrgChoice(activeOrgId, memberOrgIds))
    ? activeOrgId
    : null;
}

export function orgIdFromMetadata(metadata: unknown): string | null {
  let value = metadata;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  const orgId = (value as { organizationId?: unknown } | null)?.organizationId;
  return typeof orgId === "string" ? orgId : null;
}

export function scopesToPermissions(scopes: string[]): Record<string, string[]> {
  const permissions: Record<string, string[]> = {};
  for (const scope of new Set(scopes.filter(isAccessScope))) {
    const separator = scope.indexOf(":");
    const resource = scope.slice(0, separator);
    permissions[resource] = [...(permissions[resource] ?? []), scope.slice(separator + 1)];
  }
  return permissions;
}

export function permissionsToScopes(permissions: unknown): AccessScope[] {
  if (permissions === null || typeof permissions !== "object") {
    return [];
  }
  const granted = new Set<string>();
  for (const [resource, actions] of Object.entries(permissions)) {
    if (Array.isArray(actions)) {
      for (const action of actions) {
        granted.add(`${resource}:${String(action)}`);
      }
    }
  }
  return ACCESS_SCOPES.filter((scope) => granted.has(scope));
}
