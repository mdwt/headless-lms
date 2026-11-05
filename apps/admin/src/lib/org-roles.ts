import type { OrgRole } from "./api/types";

export function givableOrgRoles(roles: OrgRole[]): OrgRole[] {
  return roles.filter((role) => role.givable && role.levels.includes("org"));
}

export function defaultOrgRole(roles: OrgRole[]): OrgRole | undefined {
  return roles.find((role) => role.system && role.permissions.length === 0);
}

export function teamRoleKeys(roles: OrgRole[]): Set<string> {
  return new Set(roles.filter((role) => role.team).map((role) => role.key));
}
