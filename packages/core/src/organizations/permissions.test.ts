import { describe, it, expect } from 'vitest';
import type { Permission } from '../types/index.js';
import { contentTypeSchema } from '../types/schemas/content.js';
import { levelSchema, roleKeySchema } from '../types/schemas/organizations.js';
import { prefixId } from '../shared/id.js';
import { ForbiddenError } from '../shared/errors.js';
import { ALL_PERMISSIONS, PERMISSIONS, fitsLevels, withImplied } from './permissions.js';
import {
  DEFAULT_ROLES,
  RoleSetError,
  validateRoleSet,
  type RoleDefinition,
} from './default-roles.js';
import { catalogOf, resolveOrgRoles, resolveRole, type OrgRole } from './org-roles.js';
import { resolvePermissions, systemPermissions } from './effective-permissions.js';

const catalog = catalogOf(DEFAULT_ROLES);
const roles = new Map<string, OrgRole>(
  resolveOrgRoles(catalog, []).map((role) => [role.key, role]),
);

function withRole(
  key: string,
  levels: RoleDefinition['levels'],
  permissions: RoleDefinition['permissions'],
) {
  return [...DEFAULT_ROLES, { key, name: key, description: '', levels, team: false, permissions }];
}

describe('permission list', () => {
  it('gives every permission a label, description, group and a level as its about', () => {
    for (const key of ALL_PERMISSIONS) {
      const def = PERMISSIONS[key];
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
      expect(def.group.length).toBeGreaterThan(0);
      expect(levelSchema.safeParse(def.about).success).toBe(true);
    }
  });

  it('names only existing permissions as implications', () => {
    for (const key of ALL_PERMISSIONS) {
      const implies: readonly string[] =
        (PERMISSIONS[key] as { implies?: readonly string[] }).implies ?? [];
      for (const implied of implies) {
        expect(ALL_PERMISSIONS).toContain(implied);
      }
    }
  });

  it('follows the naming rules', () => {
    const levelPrefix = new RegExp(`^(${contentTypeSchema.options.join('|')}|org)_`);
    for (const key of ALL_PERMISSIONS) {
      const [resource, action] = key.split(':');
      expect(['read', 'write', 'delete', 'moderate']).toContain(action);
      expect(resource).not.toMatch(levelPrefix);
    }
  });

  it('makes every write and delete imply its read', () => {
    for (const key of ALL_PERMISSIONS) {
      const [resource, action] = key.split(':');
      const read = `${resource}:read`;
      if ((action === 'write' || action === 'delete') && ALL_PERMISSIONS.includes(read as never)) {
        expect([...withImplied([key])]).toContain(read);
      }
    }
  });

  it('fits a course permission to org or course levels only', () => {
    expect(fitsLevels('courses:write', ['course'])).toBe(true);
    expect(fitsLevels('courses:write', ['org'])).toBe(true);
    expect(fitsLevels('courses:write', ['community'])).toBe(false);
    expect(fitsLevels('people:write', ['course'])).toBe(false);
  });
});

describe('role keys', () => {
  it('accepts the default keys and the keys the org adds', () => {
    for (const key of ['owner', 'instructor', 'member', prefixId('role')]) {
      expect(roleKeySchema.safeParse(key).success, key).toBe(true);
    }
    expect(roleKeySchema.safeParse('Owner').success).toBe(false);
    expect(roleKeySchema.safeParse('role-1').success).toBe(false);
  });
});

describe('default set', () => {
  it('is valid', () => {
    expect(() => validateRoleSet(DEFAULT_ROLES)).not.toThrow();
  });

  it('refuses a set without owner or member', () => {
    expect(() => validateRoleSet(DEFAULT_ROLES.filter((r) => r.key !== 'owner'))).toThrow(
      RoleSetError,
    );
    expect(() => validateRoleSet(DEFAULT_ROLES.filter((r) => r.key !== 'member'))).toThrow(
      RoleSetError,
    );
  });

  it('refuses a repeated key, an unknown permission, an unknown level, no level and a misfit', () => {
    expect(() => validateRoleSet([...DEFAULT_ROLES, DEFAULT_ROLES[1]!])).toThrow(/repeated/);
    expect(() => validateRoleSet(withRole('x', ['org'], ['nope:read' as never]))).toThrow(
      /unknown permission/,
    );
    expect(() => validateRoleSet(withRole('x', ['event' as never], []))).toThrow(/unknown level/);
    expect(() => validateRoleSet(withRole('x', [], []))).toThrow(/no level/);
    expect(() => validateRoleSet(withRole('x', ['course'], ['people:write']))).toThrow(
      /doesn't fit/,
    );
  });

  it('refuses a member that holds something, and an owner that lacks something', () => {
    const set = DEFAULT_ROLES.map((r) =>
      r.key === 'member' ? { ...r, permissions: ['courses:read' as const] } : r,
    );
    expect(() => validateRoleSet(set)).toThrow(RoleSetError);
    const owner = DEFAULT_ROLES.map((r) =>
      r.key === 'owner' ? { ...r, permissions: r.permissions.slice(1) } : r,
    );
    expect(() => validateRoleSet(owner)).toThrow(/must hold every permission/);
    const wider = DEFAULT_ROLES.map((r) =>
      r.key === 'owner' ? { ...r, levels: ['org' as const, 'course' as const] } : r,
    );
    expect(() => validateRoleSet(wider)).toThrow(/org only/);
  });
});

describe('org roles', () => {
  it('stores a rename without touching permissions', () => {
    const role = resolveRole('instructor', catalog, {
      key: 'instructor',
      name: 'Tutor',
      description: null,
      base: 'instructor',
      levels: null,
      permissions: {},
      team: null,
    })!;
    expect(role.name).toBe('Tutor');
    expect(role.permissions).toEqual(roles.get('instructor')!.permissions);
  });

  it('keeps saved choices and resolves the rest from the base', () => {
    const role = resolveRole('instructor', catalog, {
      key: 'instructor',
      name: null,
      description: null,
      base: 'instructor',
      levels: null,
      permissions: { 'courses:delete': true, 'courses:moderate': false },
      team: null,
    })!;
    expect(role.permissions).toContain('courses:delete');
    expect(role.permissions).not.toContain('courses:moderate');
    expect(role.permissions).toContain('courses:write');
  });

  it('drops permissions that no longer fit the levels', () => {
    const role = resolveRole('instructor', catalog, {
      key: 'instructor',
      name: null,
      description: null,
      base: 'instructor',
      levels: ['course'],
      permissions: {},
      team: null,
    })!;
    expect(role.permissions).not.toContain('api_keys:write');
    expect(role.permissions).toContain('courses:write');
  });

  it('resolves a role the org added from its base', () => {
    const list = resolveOrgRoles(catalog, [
      {
        key: 'role_1',
        name: 'Teaching assistant',
        description: null,
        base: 'instructor',
        levels: ['course'],
        permissions: { 'courses:write': false },
        team: true,
      },
    ]);
    const added = list.find((r) => r.key === 'role_1')!;
    expect(added.added).toBe(true);
    expect(added.permissions).toEqual(['courses:read', 'courses:moderate', 'progress:read']);
  });

  it('gives the owner every permission, including one the base never listed', () => {
    expect(roles.get('owner')!.permissions).toEqual([...ALL_PERMISSIONS]);
    expect(roles.get('member')!.permissions).toEqual([]);
  });
});

describe('resolvePermissions', () => {
  it('gives a member nothing', () => {
    const p = resolvePermissions({ assignments: [], roles });
    expect(p.anywhere('courses:read')).toBe(false);
    expect(p.roleOn().key).toBe('member');
    expect(p.isOwner()).toBe(false);
  });

  it('covers every item with a role on the org', () => {
    const p = resolvePermissions({
      assignments: [{ roleKey: 'instructor', contentId: null, contentType: null }],
      roles,
    });
    expect(p.has('courses:write', 'crs_1')).toBe(true);
    expect(p.has('courses:write', 'crs_2')).toBe(true);
    expect(p.has('api_keys:write')).toBe(true);
    expect(p.where('courses:write')).toEqual({ org: true, content: [] });
  });

  it('limits a role on a course to that course and its course permissions', () => {
    const p = resolvePermissions({
      assignments: [{ roleKey: 'instructor', contentId: 'crs_1', contentType: 'course' }],
      roles,
    });
    expect(p.has('courses:write', 'crs_1')).toBe(true);
    expect(p.has('courses:write', 'crs_2')).toBe(false);
    expect(p.has('courses:write')).toBe(false);
    expect(p.anywhere('api_keys:write')).toBe(false);
    expect(p.where('courses:read')).toEqual({ org: false, content: ['crs_1'] });
    expect(p.roleOn('crs_1')).toEqual({ key: 'instructor', name: 'Instructor', team: true });
    expect(p.roleOn('crs_2').key).toBe('member');
  });

  it('ignores a role given at a level it does not list', () => {
    const p = resolvePermissions({
      assignments: [{ roleKey: 'instructor', contentId: 'cmy_1', contentType: 'community' }],
      roles,
    });
    expect(p.anywhere('courses:write')).toBe(false);
    expect(p.roleOn('cmy_1').key).toBe('member');
  });

  it('adds the item role to the org role, per item', () => {
    const p = resolvePermissions({
      assignments: [
        { roleKey: 'moderator', contentId: 'cmy_1', contentType: 'community' },
        { roleKey: 'moderator', contentId: 'cmy_2', contentType: 'community' },
        { roleKey: 'instructor', contentId: 'crs_1', contentType: 'course' },
      ],
      roles,
    });
    expect(p.has('communities:moderate', 'cmy_1')).toBe(true);
    expect(p.has('communities:moderate', 'cmy_2')).toBe(true);
    expect(p.has('communities:moderate', 'crs_1')).toBe(false);
    expect(p.has('courses:write', 'crs_1')).toBe(true);
    expect(p.has('courses:write', 'cmy_1')).toBe(false);
  });

  it('adds a role on a course to the org role on that course only', () => {
    const p = resolvePermissions({
      assignments: [
        { roleKey: 'moderator', contentId: null, contentType: null },
        { roleKey: 'instructor', contentId: 'crs_1', contentType: 'course' },
      ],
      roles,
    });
    expect(p.has('communities:moderate', 'cmy_1')).toBe(true);
    expect(p.has('communities:moderate', 'crs_1')).toBe(true);
    expect(p.has('courses:write', 'crs_1')).toBe(true);
    expect(p.has('courses:write', 'crs_2')).toBe(false);
    expect(p.roleOn('crs_1').key).toBe('instructor');
    expect(p.roleOn('crs_2').key).toBe('moderator');
  });

  it('lets people:read see every course’s progress and courses:moderate open its course', () => {
    const only = (permissions: Permission[], levels: RoleDefinition['levels']) =>
      new Map<string, OrgRole>([
        ...roles,
        ['only', { ...roles.get('admin')!, key: 'only', levels, permissions }],
      ]);
    const reader = resolvePermissions({
      assignments: [{ roleKey: 'only', contentId: null, contentType: null }],
      roles: only(['people:read'], ['org']),
    });
    expect(reader.has('progress:read', 'crs_1')).toBe(true);
    expect(reader.has('progress:read', 'crs_9')).toBe(true);
    expect(reader.has('courses:read', 'crs_1')).toBe(false);
    const moderator = resolvePermissions({
      assignments: [{ roleKey: 'only', contentId: 'crs_1', contentType: 'course' }],
      roles: only(['courses:moderate'], ['course']),
    });
    expect(moderator.has('courses:read', 'crs_1')).toBe(true);
    expect(moderator.has('courses:read', 'crs_2')).toBe(false);
    expect(moderator.has('courses:write', 'crs_1')).toBe(false);
  });

  it('expands implications', () => {
    const p = resolvePermissions({
      assignments: [{ roleKey: 'admin', contentId: null, contentType: null }],
      roles,
    });
    expect(p.has('progress:read', 'crs_9')).toBe(true);
    const moderator = resolvePermissions({
      assignments: [{ roleKey: 'instructor', contentId: 'crs_1', contentType: 'course' }],
      roles,
    });
    expect(moderator.has('courses:read', 'crs_1')).toBe(true);
  });

  it('makes the owner the owner, and never under token scopes', () => {
    const assignments = [{ roleKey: 'owner', contentId: null, contentType: null }];
    expect(resolvePermissions({ assignments, roles }).isOwner()).toBe(true);
    const key = resolvePermissions({ assignments, roles, tokenScopes: ['courses:read'] });
    expect(key.isOwner()).toBe(false);
    expect(key.has('courses:read')).toBe(true);
    expect(key.has('courses:delete')).toBe(false);
    expect(() => key.require('people:write')).toThrow(ForbiddenError);
  });

  it('intersects item permissions with token scopes', () => {
    const p = resolvePermissions({
      assignments: [{ roleKey: 'instructor', contentId: 'crs_1', contentType: 'course' }],
      roles,
      tokenScopes: ['courses:write'],
    });
    expect(p.has('courses:write', 'crs_1')).toBe(true);
    expect(p.has('courses:read', 'crs_1')).toBe(true);
    expect(p.has('courses:moderate', 'crs_1')).toBe(false);
  });

  it('ignores an org row whose role no longer lists the org', () => {
    const narrowed = new Map(roles);
    narrowed.set('instructor', { ...roles.get('instructor')!, levels: ['course'] });
    const p = resolvePermissions({
      assignments: [{ roleKey: 'instructor', contentId: null, contentType: null }],
      roles: narrowed,
    });
    expect(p.anywhere('courses:write')).toBe(false);
    expect(p.roleOn().key).toBe('member');
  });

  it('gives the system every permission and no ownership', () => {
    const system = systemPermissions();
    for (const permission of ALL_PERMISSIONS) {
      expect(system.has(permission), permission).toBe(true);
      expect(system.has(permission, 'crs_9'), permission).toBe(true);
    }
    expect(system.isOwner()).toBe(false);
  });
});
