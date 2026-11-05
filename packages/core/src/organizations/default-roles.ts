import { levelSchema } from '../types/schemas/organizations.js';
import type { Level, Permission } from '../types/index.js';
import { ALL_PERMISSIONS, fitsLevels, isPermission } from './permissions.js';

export interface RoleDefinition {
  key: string;
  name: string;
  description: string;
  levels: Level[];
  team: boolean;
  permissions: Permission[];
}

export const OWNER_ROLE_KEY = 'owner';
export const MEMBER_ROLE_KEY = 'member';

const ADMIN_PERMISSIONS: Permission[] = [...ALL_PERMISSIONS];

export const DEFAULT_ROLES: readonly RoleDefinition[] = [
  {
    key: OWNER_ROLE_KEY,
    name: 'Owner',
    description: 'Owns the organization and holds every permission.',
    levels: ['org'],
    team: true,
    permissions: [...ALL_PERMISSIONS],
  },
  {
    key: 'admin',
    name: 'Admin',
    description: 'Runs the organization: content, people, access, automations and settings.',
    levels: ['org'],
    team: true,
    permissions: ADMIN_PERMISSIONS,
  },
  {
    key: 'instructor',
    name: 'Instructor',
    description:
      'Teaches courses: edits and publishes them, moderates lesson comments and sees learners.',
    levels: ['org', 'course'],
    team: true,
    permissions: [
      'courses:read',
      'courses:write',
      'courses:moderate',
      'progress:read',
      'api_keys:read',
      'api_keys:write',
      'api_keys:delete',
    ],
  },
  {
    key: 'moderator',
    name: 'Moderator',
    description: 'Moderates communities: posts, comments, chats, reports and space members.',
    levels: ['org', 'community'],
    team: true,
    permissions: ['communities:moderate'],
  },
  {
    key: MEMBER_ROLE_KEY,
    name: 'Member',
    description: 'Everyone who was not given another role.',
    levels: ['org'],
    team: false,
    permissions: [],
  },
];

export class RoleSetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoleSetError';
  }
}

export function validateRoleSet(roles: readonly RoleDefinition[]): void {
  const keys = new Set<string>();
  for (const role of roles) {
    if (keys.has(role.key)) {
      throw new RoleSetError(`role key ${role.key} is repeated`);
    }
    keys.add(role.key);
    if (role.levels.length === 0) {
      throw new RoleSetError(`role ${role.key} has no level`);
    }
    for (const level of role.levels) {
      if (!levelSchema.safeParse(level).success) {
        throw new RoleSetError(`role ${role.key} names an unknown level ${String(level)}`);
      }
    }
    for (const permission of role.permissions) {
      if (!isPermission(permission)) {
        throw new RoleSetError(
          `role ${role.key} names an unknown permission ${String(permission)}`,
        );
      }
      if (!fitsLevels(permission, role.levels)) {
        throw new RoleSetError(
          `role ${role.key} holds ${permission}, which doesn't fit its levels ${role.levels.join(', ')}`,
        );
      }
    }
  }
  const owner = roles.find((role) => role.key === OWNER_ROLE_KEY);
  const member = roles.find((role) => role.key === MEMBER_ROLE_KEY);
  if (!owner) {
    throw new RoleSetError(`the role set lacks ${OWNER_ROLE_KEY}`);
  }
  if (!member) {
    throw new RoleSetError(`the role set lacks ${MEMBER_ROLE_KEY}`);
  }
  if (owner.levels.length !== 1 || owner.levels[0] !== 'org') {
    throw new RoleSetError(`${OWNER_ROLE_KEY} must list the org only`);
  }
  if (owner.permissions.length !== ALL_PERMISSIONS.length) {
    throw new RoleSetError(`${OWNER_ROLE_KEY} must hold every permission`);
  }
  if (member.levels.length !== 1 || member.levels[0] !== 'org' || member.permissions.length > 0) {
    throw new RoleSetError(`${MEMBER_ROLE_KEY} must list the org only and hold nothing`);
  }
}
