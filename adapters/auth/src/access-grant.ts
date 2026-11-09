import type { AccessGrant } from "@headless-lms/core/types";
import { ORG_CLAIM } from "@headless-lms/core/identity";
import { isPermission } from "@headless-lms/core/organizations";
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
    typeof claims.scope === "string" ? claims.scope.split(" ").filter(isPermission) : [];
  return { userId, clientId, orgId, limit: { scopes } };
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

function metadataField(metadata: unknown, field: string): string | null {
  let value = metadata;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  const found = (value as Record<string, unknown> | null)?.[field];
  return typeof found === "string" && found.length > 0 ? found : null;
}

export function orgIdFromMetadata(metadata: unknown): string | null {
  return metadataField(metadata, "organizationId");
}

export function roleFromMetadata(metadata: unknown): string | null {
  return metadataField(metadata, "role");
}
