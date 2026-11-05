import type { EffectivePermissions } from '../shared/actor.js';

export type ReviewedItem = { communityId: string } | { courseId: string };

export interface TeamBadge {
  team: boolean;
  roleName: string | null;
}

export const NO_BADGE: TeamBadge = { team: false, roleName: null };

export function skipsReview(permissions: EffectivePermissions, item: ReviewedItem): boolean {
  return 'communityId' in item
    ? permissions.has('communities:moderate', item.communityId)
    : permissions.has('courses:moderate', item.courseId);
}

export function isTeam(permissions: EffectivePermissions, itemId: string): boolean {
  return permissions.roleOn(itemId).team || permissions.roleOn().team;
}

export function teamBadge(
  permissions: EffectivePermissions | undefined,
  itemId: string | null,
): TeamBadge {
  if (!permissions || itemId === null || !isTeam(permissions, itemId)) {
    return NO_BADGE;
  }
  return { team: true, roleName: permissions.roleOn(itemId).name };
}
