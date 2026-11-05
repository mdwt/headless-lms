import { PERMISSION_KEYS } from '../types/schemas/organizations.js';
import type { Level, Permission } from '../types/index.js';

export type PermissionGroup =
  | 'organization'
  | 'people'
  | 'access'
  | 'content'
  | 'courses'
  | 'downloads'
  | 'communities'
  | 'automations';

export interface PermissionDefinition {
  group: PermissionGroup;
  label: string;
  description: string;
  about: Level;
  implies?: readonly Permission[];
}

export const PERMISSIONS = {
  'organizations:read': {
    group: 'organization',
    label: 'See the organization',
    description: "See the org's name, slug and general settings.",
    about: 'org',
  },
  'organizations:write': {
    group: 'organization',
    label: 'Edit the organization',
    description: "Change the org's name, slug and general settings.",
    about: 'org',
    implies: ['organizations:read'],
  },
  'api_keys:read': {
    group: 'organization',
    label: 'See your API keys',
    description: 'List your own API keys.',
    about: 'org',
  },
  'api_keys:write': {
    group: 'organization',
    label: 'Create API keys',
    description: 'Create your own API keys.',
    about: 'org',
    implies: ['api_keys:read'],
  },
  'api_keys:delete': {
    group: 'organization',
    label: 'Revoke API keys',
    description: 'Revoke your own API keys.',
    about: 'org',
    implies: ['api_keys:read'],
  },
  'notification_categories:read': {
    group: 'organization',
    label: 'See notification categories',
    description: "See the notification types, channels and the org's categories and defaults.",
    about: 'org',
  },
  'notification_categories:write': {
    group: 'organization',
    label: 'Edit notification categories',
    description: "Edit and reset the org's notification categories.",
    about: 'org',
    implies: ['notification_categories:read'],
  },
  'integrations:read': {
    group: 'organization',
    label: 'See integrations',
    description: 'See connected integrations.',
    about: 'org',
  },
  'integrations:write': {
    group: 'organization',
    label: 'Manage integrations',
    description: 'Connect, configure and run actions on integrations.',
    about: 'org',
    implies: ['integrations:read'],
  },
  'integrations:delete': {
    group: 'organization',
    label: 'Disconnect integrations',
    description: 'Disconnect integrations.',
    about: 'org',
    implies: ['integrations:read'],
  },
  'analytics:read': {
    group: 'organization',
    label: 'See the overview',
    description: "See the org's overview report.",
    about: 'org',
  },
  'people:read': {
    group: 'people',
    label: 'See people',
    description:
      "List the org's people and pending invites, with each person's roles, and open any person's record.",
    about: 'org',
    implies: ['progress:read'],
  },
  'people:write': {
    group: 'people',
    label: 'Manage people',
    description:
      "Invite people, resend and cancel invites, set a person's org role and give and remove roles on content items.",
    about: 'org',
    implies: ['people:read'],
  },
  'people:delete': {
    group: 'people',
    label: 'Remove people',
    description: 'Remove a person from the org.',
    about: 'org',
    implies: ['people:read'],
  },
  'roles:read': {
    group: 'people',
    label: 'See roles',
    description: "See the org's roles and their permissions.",
    about: 'org',
  },
  'roles:write': {
    group: 'people',
    label: 'Manage roles',
    description: 'Rename roles; change, reset and add roles through the API.',
    about: 'org',
    implies: ['roles:read'],
  },
  'roles:delete': {
    group: 'people',
    label: 'Delete roles',
    description: 'Delete a role the org added.',
    about: 'org',
    implies: ['roles:read'],
  },
  'access:read': {
    group: 'access',
    label: 'See access',
    description: "See grants, including a community's roster of grant holders.",
    about: 'org',
  },
  'access:write': {
    group: 'access',
    label: 'Manage access',
    description: 'Grant, change and revoke access.',
    about: 'org',
    implies: ['access:read'],
  },
  'bundles:read': {
    group: 'content',
    label: 'See bundles',
    description: 'See bundles and their names.',
    about: 'org',
  },
  'bundles:write': {
    group: 'content',
    label: 'Edit bundles',
    description: 'Create and edit bundles.',
    about: 'org',
    implies: ['bundles:read'],
  },
  'bundles:delete': {
    group: 'content',
    label: 'Delete bundles',
    description: 'Delete bundles.',
    about: 'org',
    implies: ['bundles:read'],
  },
  'media:read': {
    group: 'content',
    label: 'See the media library',
    description: 'See the whole media library and attach any of its files.',
    about: 'org',
  },
  'media:write': {
    group: 'content',
    label: 'Upload media',
    description: 'Upload to the media library and edit its files.',
    about: 'org',
    implies: ['media:read'],
  },
  'media:delete': {
    group: 'content',
    label: 'Delete media',
    description: 'Delete files from the media library.',
    about: 'org',
    implies: ['media:read'],
  },
  'courses:read': {
    group: 'courses',
    label: 'See courses',
    description:
      'See the course in the admin app, and open it, its lessons, files and titles without a grant, unpublished included.',
    about: 'course',
  },
  'courses:write': {
    group: 'courses',
    label: 'Edit courses',
    description:
      'Edit and publish the course; add, change and delete its modules and activities; upload media for it. Creating a course needs it on the org.',
    about: 'course',
    implies: ['courses:read'],
  },
  'courses:delete': {
    group: 'courses',
    label: 'Delete courses',
    description: 'Delete the course.',
    about: 'course',
    implies: ['courses:read'],
  },
  'courses:moderate': {
    group: 'courses',
    label: 'Moderate lesson comments',
    description:
      "See the course's lesson comments, held ones included; approve, remove, restore, reply to and resolve reports on them.",
    about: 'course',
    implies: ['courses:read'],
  },
  'progress:read': {
    group: 'courses',
    label: 'See learners and progress',
    description: "See the course's learners, their progress and the course's analytics.",
    about: 'course',
  },
  'downloads:read': {
    group: 'downloads',
    label: 'See downloads',
    description:
      'See the download in the admin app, and open it and its files without a grant, unpublished included.',
    about: 'download',
  },
  'downloads:write': {
    group: 'downloads',
    label: 'Edit downloads',
    description:
      'Edit and publish the download; upload files for it. Creating a download needs it on the org.',
    about: 'download',
    implies: ['downloads:read'],
  },
  'downloads:delete': {
    group: 'downloads',
    label: 'Delete downloads',
    description: 'Delete the download.',
    about: 'download',
    implies: ['downloads:read'],
  },
  'communities:read': {
    group: 'communities',
    label: 'See communities',
    description:
      'See the community, its spaces, notification categories and analytics in the admin app; be a member of it without a grant and open every space in it.',
    about: 'community',
  },
  'communities:write': {
    group: 'communities',
    label: 'Configure communities',
    description:
      'Configure the community, its spaces, topics, links, settings and notification categories; publish it; delete its spaces; upload media for it. Creating a community needs it on the org.',
    about: 'community',
    implies: ['communities:read'],
  },
  'communities:delete': {
    group: 'communities',
    label: 'Delete communities',
    description: 'Delete the community.',
    about: 'community',
    implies: ['communities:read'],
  },
  'communities:moderate': {
    group: 'communities',
    label: 'Moderate communities',
    description:
      'Review, approve, remove, restore, pin and lock posts, comments and messages; manage space members and join requests; resolve reports.',
    about: 'community',
  },
  'automations:read': {
    group: 'automations',
    label: 'See automations',
    description: 'See workflows, webhooks and their runs.',
    about: 'org',
  },
  'automations:write': {
    group: 'automations',
    label: 'Edit automations',
    description: "Create and edit workflows and webhooks, and reveal a webhook's signing secret.",
    about: 'org',
    implies: ['automations:read'],
  },
  'automations:delete': {
    group: 'automations',
    label: 'Delete automations',
    description: 'Delete workflows and webhooks.',
    about: 'org',
    implies: ['automations:read'],
  },
} as const satisfies Record<Permission, PermissionDefinition>;

export const ALL_PERMISSIONS: readonly Permission[] = PERMISSION_KEYS;

export function isPermission(value: string): value is Permission {
  return (PERMISSION_KEYS as readonly string[]).includes(value);
}

export function permissionAbout(permission: Permission): Level {
  return PERMISSIONS[permission].about;
}

export function fitsLevels(permission: Permission, levels: readonly Level[]): boolean {
  const about = permissionAbout(permission);
  if (levels.includes('org')) {
    return true;
  }
  return about !== 'org' && levels.includes(about);
}

export function withImplied(permissions: Iterable<Permission>): Set<Permission> {
  const out = new Set<Permission>();
  const queue = [...permissions];
  while (queue.length > 0) {
    const next = queue.pop()!;
    if (out.has(next)) {
      continue;
    }
    out.add(next);
    const def: PermissionDefinition = PERMISSIONS[next];
    for (const implied of def.implies ?? []) {
      queue.push(implied);
    }
  }
  return out;
}

export interface PermissionListEntry extends Omit<PermissionDefinition, 'implies'> {
  key: Permission;
  implies?: Permission[];
}

export function permissionList(): PermissionListEntry[] {
  return PERMISSION_KEYS.map((key) => {
    const { implies, ...definition }: PermissionDefinition = PERMISSIONS[key];
    return { key, ...definition, ...(implies && { implies: [...implies] }) };
  });
}
