import type { EffectivePermissions } from '../../shared/actor.js';
import type { NotificationCategory, Reason, SettingsScope } from '../../types/index.js';

function reasonApplies(
  reason: Reason,
  permissions: EffectivePermissions,
  scope: SettingsScope,
): boolean {
  if (reason !== 'moderator') {
    return true;
  }
  return scope === 'org'
    ? permissions.anywhere('courses:moderate')
    : permissions.has('communities:moderate', scope.communityId);
}

export function applicableCategories(
  categories: NotificationCategory[],
  permissions: EffectivePermissions,
  scope: SettingsScope,
): NotificationCategory[] {
  return categories.filter((category) =>
    category.covers.some((cover) =>
      cover.reasons.some((reason) => reasonApplies(reason, permissions, scope)),
    ),
  );
}
