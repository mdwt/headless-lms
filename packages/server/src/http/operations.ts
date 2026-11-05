import {
  notificationCatalogDeclarations,
  orgNotificationCategoriesDeclarations,
  organizationsDeclarations,
} from '@headless-lms/core/organizations';
import {
  communityNotificationCategoriesDeclarations,
  contentDeclarations,
} from '@headless-lms/core/content';
import { entitlementsDeclarations } from '@headless-lms/core/entitlements';
import { progressDeclarations } from '@headless-lms/core/progress';
import {
  chatsDeclarations,
  discussionDeclarations,
  postsDeclarations,
  subscriptionsDeclarations,
} from '@headless-lms/core/discussion';
import { assetsDeclarations } from '@headless-lms/core/assets';
import { integrationsDeclarations } from '@headless-lms/core/integrations';
import {
  automationsDeclarations,
  notificationListDeclarations,
} from '@headless-lms/core/automations';
import {
  devicesDeclarations,
  identityDeclarations,
  notificationSettingsDeclarations,
} from '@headless-lms/core/identity';
import { adminReportDeclarations } from '@headless-lms/core/reporting/admin';
import { memberReportDeclarations } from '@headless-lms/core/reporting/member';
import { declaredPermissions, type Declaration } from '@headless-lms/core/shared/declarations';
import type { Permission } from '@headless-lms/core/types';

export const OPERATION_REGISTRY: Readonly<Record<string, Readonly<Record<string, Declaration>>>> = {
  organizations: organizationsDeclarations,
  notificationCatalog: notificationCatalogDeclarations,
  orgNotificationCategories: orgNotificationCategoriesDeclarations,
  communityNotificationCategories: communityNotificationCategoriesDeclarations,
  content: contentDeclarations,
  entitlements: entitlementsDeclarations,
  progress: progressDeclarations,
  discussion: discussionDeclarations,
  posts: postsDeclarations,
  chats: chatsDeclarations,
  subscriptions: subscriptionsDeclarations,
  assets: assetsDeclarations,
  integrations: integrationsDeclarations,
  automations: automationsDeclarations,
  notificationList: notificationListDeclarations,
  identity: identityDeclarations,
  devices: devicesDeclarations,
  notificationSettings: notificationSettingsDeclarations,
  'reporting.admin': adminReportDeclarations,
  'reporting.member': memberReportDeclarations,
};

export function declarationOf(operation: string): Declaration | null {
  const dot = operation.lastIndexOf('.');
  if (dot <= 0) {
    return null;
  }
  return OPERATION_REGISTRY[operation.slice(0, dot)]?.[operation.slice(dot + 1)] ?? null;
}

export function permissionFor(operation: string): readonly Permission[] {
  const declaration = declarationOf(operation);
  return declaration ? declaredPermissions(declaration) : [];
}

export function describeOperation(operation: string): string {
  const declaration = declarationOf(operation);
  if (!declaration) {
    return '';
  }
  if (typeof declaration !== 'string') {
    const list = declaration.permissions.map((p) => `\`${p}\``);
    return list.length === 1 ? `Requires ${list[0]}.` : `Requires one of ${list.join(', ')}.`;
  }
  if (declaration === 'owner') {
    return 'Owner only.';
  }
  if (declaration === 'member') {
    return 'Any active member of the organization.';
  }
  return '';
}
