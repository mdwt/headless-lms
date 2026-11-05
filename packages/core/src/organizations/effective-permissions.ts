import type { ContentId, ContentType, Permission } from '../types/index.js';
import type { EffectivePermissions, RoleRef } from '../shared/actor.js';
import { ForbiddenError } from '../shared/errors.js';
import { ALL_PERMISSIONS, permissionAbout, withImplied } from './permissions.js';
import { MEMBER_ROLE_KEY, OWNER_ROLE_KEY } from './default-roles.js';
import type { OrgRole } from './org-roles.js';

export interface AssignmentRow {
  roleKey: string;
  contentId: ContentId | null;
  contentType: ContentType | null;
}

export interface ResolveInput {
  assignments: readonly AssignmentRow[];
  roles: ReadonlyMap<string, OrgRole>;
  tokenScopes?: readonly Permission[];
}

interface ContentEntry {
  permissions: Set<Permission>;
  role: RoleRef;
}

const MEMBER_REF: RoleRef = { key: MEMBER_ROLE_KEY, name: 'Member', team: false };

function refOf(role: OrgRole): RoleRef {
  return { key: role.key, name: role.name, team: role.team };
}

function intersect(set: Set<Permission>, scopes: Set<Permission> | null): Set<Permission> {
  if (!scopes) {
    return set;
  }
  return new Set([...set].filter((permission) => scopes.has(permission)));
}

export class ResolvedPermissions implements EffectivePermissions {
  constructor(
    private readonly org: Set<Permission>,
    private readonly orgRole: RoleRef,
    private readonly content: Map<ContentId, ContentEntry>,
    private readonly owner: boolean,
  ) {}

  has(permission: Permission, on?: ContentId): boolean {
    if (this.org.has(permission)) {
      return true;
    }
    return on !== undefined && (this.content.get(on)?.permissions.has(permission) ?? false);
  }

  require(permission: Permission, on?: ContentId): void {
    if (!this.has(permission, on)) {
      throw new ForbiddenError(`You need ${permission}`);
    }
  }

  anywhere(permission: Permission): boolean {
    if (this.org.has(permission)) {
      return true;
    }
    for (const entry of this.content.values()) {
      if (entry.permissions.has(permission)) {
        return true;
      }
    }
    return false;
  }

  where(permission: Permission): { org: boolean; content: ContentId[] } {
    if (this.org.has(permission)) {
      return { org: true, content: [] };
    }
    const content: ContentId[] = [];
    for (const [id, entry] of this.content) {
      if (entry.permissions.has(permission)) {
        content.push(id);
      }
    }
    return { org: false, content };
  }

  roleOn(on?: ContentId): RoleRef {
    if (on !== undefined) {
      const entry = this.content.get(on);
      if (entry) {
        return entry.role;
      }
    }
    return this.orgRole;
  }

  isOwner(): boolean {
    return this.owner;
  }

  orgPermissions(): Permission[] {
    return ALL_PERMISSIONS.filter((permission) => this.org.has(permission));
  }

  contentPermissions(): Record<ContentId, Permission[]> {
    const out: Record<ContentId, Permission[]> = {};
    for (const [id, entry] of this.content) {
      out[id] = ALL_PERMISSIONS.filter((permission) => entry.permissions.has(permission));
    }
    return out;
  }

  teamOn(on?: ContentId): boolean {
    if (on !== undefined && this.content.get(on)?.role.team) {
      return true;
    }
    return this.orgRole.team;
  }
}

export function resolvePermissions({
  assignments,
  roles,
  tokenScopes,
}: ResolveInput): ResolvedPermissions {
  const scopes = tokenScopes ? withImplied(tokenScopes) : null;
  const orgRow = assignments.find((row) => row.contentId === null);
  const listed = orgRow ? roles.get(orgRow.roleKey) : undefined;
  const orgRole = listed?.levels.includes('org') ? listed : undefined;
  const orgSet = orgRole ? withImplied(orgRole.permissions) : new Set<Permission>();
  const content = new Map<ContentId, ContentEntry>();
  for (const row of assignments) {
    if (row.contentId === null || row.contentType === null) {
      continue;
    }
    const role = roles.get(row.roleKey);
    if (!role || !role.levels.includes(row.contentType)) {
      continue;
    }
    const type = row.contentType;
    const own = role.permissions.filter((permission) => permissionAbout(permission) === type);
    const expanded = [...withImplied(own)].filter(
      (permission) => permissionAbout(permission) === type,
    );
    content.set(row.contentId, {
      permissions: intersect(new Set(expanded), scopes),
      role: refOf(role),
    });
  }
  const owner = orgRow?.roleKey === OWNER_ROLE_KEY && orgRole !== undefined;
  return new ResolvedPermissions(
    intersect(orgSet, scopes),
    orgRole
      ? refOf(orgRole)
      : roles.get(MEMBER_ROLE_KEY)
        ? refOf(roles.get(MEMBER_ROLE_KEY)!)
        : MEMBER_REF,
    content,
    owner && scopes === null,
  );
}

export function systemPermissions(): ResolvedPermissions {
  return new ResolvedPermissions(
    new Set(ALL_PERMISSIONS),
    { key: 'system', name: 'System', team: false },
    new Map(),
    false,
  );
}
