import { describe, expect, it } from 'vitest';
import { ForbiddenError } from '../shared/errors.js';
import {
  ACCESS_SCOPES,
  assertRoleHoldsScopes,
  isAccessScope,
  isDeleteScope,
  scopeOptions,
  scopesForRole,
} from './access-scopes.js';

describe('access scopes', () => {
  it('lets owners and admins hold all 21 scopes', () => {
    expect(ACCESS_SCOPES).toHaveLength(21);
    expect(scopesForRole('owner')).toEqual([...ACCESS_SCOPES]);
    expect(scopesForRole('admin')).toEqual([...ACCESS_SCOPES]);
  });

  it('lets an instructor hold only the scopes that need no permission', () => {
    expect(scopesForRole('instructor')).toEqual([
      'courses:read',
      'downloads:read',
      'bundles:read',
      'media:read',
      'automations:read',
      'comments:read',
    ]);
  });

  it('gives a student no scope', () => {
    expect(scopesForRole('student')).toEqual([]);
    expect(scopeOptions('student').some((option) => option.allowed)).toBe(false);
  });

  it('lists every scope with whether the role may grant it', () => {
    const options = scopeOptions('instructor');
    expect(options.map((option) => option.scope)).toEqual([...ACCESS_SCOPES]);
    expect(options.find((option) => option.scope === 'courses:read')?.allowed).toBe(true);
    expect(options.find((option) => option.scope === 'courses:write')?.allowed).toBe(false);
  });

  it('refuses a scope the role cannot grant', () => {
    expect(() => assertRoleHoldsScopes('instructor', ['courses:write'])).toThrow(ForbiddenError);
    expect(() => assertRoleHoldsScopes('instructor', ['courses:read'])).not.toThrow();
  });

  it('marks exactly the four delete scopes', () => {
    expect(ACCESS_SCOPES.filter((scope) => isDeleteScope(scope))).toEqual([
      'courses:delete',
      'downloads:delete',
      'bundles:delete',
      'automations:delete',
    ]);
  });

  it('recognises only catalogue scopes', () => {
    expect(isAccessScope('courses:read')).toBe(true);
    expect(isAccessScope('offline_access')).toBe(false);
    expect(isAccessScope('courses:publish')).toBe(false);
  });
});
