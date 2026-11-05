import type { Level, Permission } from '../types/index.js';
import { ALL_PERMISSIONS, fitsLevels } from './permissions.js';
import { MEMBER_ROLE_KEY, OWNER_ROLE_KEY, type RoleDefinition } from './default-roles.js';

export interface StoredOrgRole {
  key: string;
  name: string | null;
  description: string | null;
  base: string;
  levels: Level[] | null;
  permissions: Partial<Record<Permission, boolean>>;
  team: boolean | null;
}

export interface OrgRole {
  key: string;
  name: string;
  description: string;
  base: string;
  levels: Level[];
  team: boolean;
  permissions: Permission[];
  system: boolean;
  added: boolean;
  customized: boolean;
}

export type RoleCatalog = ReadonlyMap<string, RoleDefinition>;

export function catalogOf(roles: readonly RoleDefinition[]): RoleCatalog {
  return new Map(roles.map((role) => [role.key, role]));
}

export function isSystemRole(key: string): boolean {
  return key === OWNER_ROLE_KEY || key === MEMBER_ROLE_KEY;
}

export function resolveRole(
  key: string,
  catalog: RoleCatalog,
  stored: StoredOrgRole | undefined,
): OrgRole | null {
  const baseKey = stored?.base ?? key;
  const base = catalog.get(baseKey);
  if (!base) {
    return null;
  }
  const own = catalog.get(key);
  if (!own && !stored) {
    return null;
  }
  const levels = stored?.levels ?? base.levels;
  const permissions =
    key === OWNER_ROLE_KEY
      ? [...ALL_PERMISSIONS]
      : key === MEMBER_ROLE_KEY
        ? []
        : ALL_PERMISSIONS.filter((permission) => {
            const explicit = stored?.permissions[permission];
            const held = explicit ?? base.permissions.includes(permission);
            return held && fitsLevels(permission, levels);
          });
  return {
    key,
    name: stored?.name ?? own?.name ?? base.name,
    description: stored?.description ?? own?.description ?? base.description,
    base: baseKey,
    levels: key === OWNER_ROLE_KEY || key === MEMBER_ROLE_KEY ? ['org'] : levels,
    team: stored?.team ?? own?.team ?? base.team,
    permissions,
    system: isSystemRole(key),
    added: !own,
    customized: stored !== undefined,
  };
}

export function resolveOrgRoles(catalog: RoleCatalog, stored: readonly StoredOrgRole[]): OrgRole[] {
  const byKey = new Map(stored.map((row) => [row.key, row]));
  const out: OrgRole[] = [];
  for (const key of catalog.keys()) {
    const role = resolveRole(key, catalog, byKey.get(key));
    if (role) {
      out.push(role);
    }
  }
  for (const row of stored) {
    if (!catalog.has(row.key)) {
      const role = resolveRole(row.key, catalog, row);
      if (role) {
        out.push(role);
      }
    }
  }
  return out;
}
