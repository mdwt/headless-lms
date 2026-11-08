import type { Permission } from '../types/index.js';
import type { Actor } from '../shared/actor.js';
import { ForbiddenError } from '../shared/errors.js';

const BY_PREFIX: ReadonlyArray<[string, readonly Permission[]]> = [
  ['organization.role.', ['roles:read', 'people:read']],
  ['organization.ownership.', ['people:read']],
  ['organization.created', ['organizations:read']],
  ['organization.updated', ['organizations:read']],
  ['organization.deleted', ['organizations:read']],
  ['organization.', ['people:read']],
  ['identity.', ['people:read']],
  ['entitlement.space_member.', ['communities:moderate']],
  ['entitlement.', ['access:read']],
  ['progress.', ['progress:read']],
  ['content.course.', ['courses:read']],
  ['content.download.', ['downloads:read']],
  ['content.bundle.', ['bundles:read']],
  ['content.community.', ['communities:read']],
  ['content.event.', ['events:read']],
  ['discussion.comment.', ['courses:moderate', 'communities:moderate']],
  ['discussion.', ['communities:moderate']],
  ['asset.', ['media:read']],
  ['integration.', ['integrations:read']],
  ['automation.', ['automations:read']],
];

export function eventReadPermissions(type: string): readonly Permission[] {
  return BY_PREFIX.find(([prefix]) => type.startsWith(prefix))?.[1] ?? ['people:read'];
}

export function assertReadsEvents(actor: Actor, types: readonly string[]): void {
  const missing = [...new Set(types.flatMap((type) => eventReadPermissions(type)))].filter(
    (permission) => !actor.permissions.has(permission),
  );
  if (missing.length > 0) {
    throw Object.assign(
      new ForbiddenError(`You need ${missing.join(', ')} to receive these events`),
      {
        permission: missing[0],
      },
    );
  }
}

export function assertGrantsAllowed(actor: Actor, actions: readonly { type: string }[]): void {
  if (actions.some((action) => action.type === 'grantAccess')) {
    actor.permissions.require('access:write');
  }
}
