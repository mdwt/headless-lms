import { ForbiddenError } from '../shared/errors.js';
import { capability, isStaffRole, type Permission, type Role } from './roles.js';

export const ACCESS_SCOPES = [
  'courses:read',
  'courses:write',
  'courses:delete',
  'downloads:read',
  'downloads:write',
  'downloads:delete',
  'bundles:read',
  'bundles:write',
  'bundles:delete',
  'media:read',
  'students:read',
  'students:invite',
  'access:read',
  'access:write',
  'analytics:read',
  'automations:read',
  'automations:write',
  'automations:delete',
  'comments:read',
  'comments:moderate',
  'communities:read',
  'communities:write',
  'communities:delete',
  'community_members:read',
  'community_members:write',
  'community_moderation:read',
  'community_moderation:write',
] as const;

export type AccessScope = (typeof ACCESS_SCOPES)[number];

export const SCOPE_PERMISSION: Record<AccessScope, Permission | null> = {
  'courses:read': null,
  'courses:write': 'create_course',
  'courses:delete': 'create_course',
  'downloads:read': null,
  'downloads:write': 'create_course',
  'downloads:delete': 'create_course',
  'bundles:read': null,
  'bundles:write': 'create_course',
  'bundles:delete': 'create_course',
  'media:read': null,
  'students:read': 'view_student_progress',
  'students:invite': 'manage_users',
  'access:read': 'view_student_progress',
  'access:write': 'manage_users',
  'analytics:read': 'view_student_progress',
  'automations:read': null,
  'automations:write': 'manage_org_settings',
  'automations:delete': 'manage_org_settings',
  'comments:read': null,
  'comments:moderate': 'edit_assigned_course',
  'communities:read': null,
  'communities:write': 'create_course',
  'communities:delete': 'create_course',
  'community_members:read': null,
  'community_members:write': 'moderate',
  'community_moderation:read': null,
  'community_moderation:write': 'moderate',
};

export type ScopeOption = { scope: AccessScope; allowed: boolean };

export function isAccessScope(value: string): value is AccessScope {
  return (ACCESS_SCOPES as readonly string[]).includes(value);
}

export function isDeleteScope(scope: AccessScope): boolean {
  return scope.endsWith(':delete');
}

export function roleHoldsScope(role: Role, scope: AccessScope): boolean {
  if (!isStaffRole(role)) {
    return false;
  }
  const permission = SCOPE_PERMISSION[scope];
  return permission === null || capability(role, permission) === true;
}

export function scopesForRole(role: Role): AccessScope[] {
  return ACCESS_SCOPES.filter((scope) => roleHoldsScope(role, scope));
}

export function scopeOptions(role: Role): ScopeOption[] {
  return ACCESS_SCOPES.map((scope) => ({ scope, allowed: roleHoldsScope(role, scope) }));
}

export function assertRoleHoldsScopes(role: Role, scopes: readonly AccessScope[]): void {
  const missing = scopes.filter((scope) => !roleHoldsScope(role, scope));
  if (missing.length > 0) {
    throw new ForbiddenError(`Your role cannot grant ${missing.join(', ')}`);
  }
}
