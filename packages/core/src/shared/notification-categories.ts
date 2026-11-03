import type { NotificationCategory, NotificationTypeDeclaration, Scope } from '../types/index.js';
import { notificationCategoryListSchema } from '../types/schemas/notifications.js';
import { ValidationError } from './errors.js';
import type { NotificationTypeRegistry } from './ports.js';

export type CategoryListScope = 'org' | 'community';

const LIST_SCOPES: Record<CategoryListScope, Scope[]> = {
  org: ['org'],
  community: ['community', 'space', 'chat'],
};

export function coversListScope(
  declaration: Pick<NotificationTypeDeclaration, 'scopes'>,
  listScope: CategoryListScope,
): boolean {
  return declaration.scopes.some((scope) => LIST_SCOPES[listScope].includes(scope));
}

export function typesForList(
  types: Pick<NotificationTypeRegistry, 'list'>,
  listScope: CategoryListScope,
): Pick<NotificationTypeDeclaration, 'type' | 'scopes' | 'reasons'>[] {
  return types.list().filter((declaration) => coversListScope(declaration, listScope));
}

export function categoryListProblems(
  categories: NotificationCategory[],
  listScope: CategoryListScope,
  types: Pick<NotificationTypeRegistry, 'get'>,
  configured: string[],
): string[] {
  const problems: string[] = [];
  const keys = new Set<string>();
  const covered = new Set<string>();
  categories.forEach((category, index) => {
    const at = `categories[${index}] (${category.key})`;
    if (keys.has(category.key)) {
      problems.push(`${at}: the key is used by an earlier category`);
    }
    keys.add(category.key);
    const pairs: string[] = [];
    category.covers.forEach((cover, coverIndex) => {
      const coverAt = `${at}.covers[${coverIndex}]`;
      const declaration = types.get(cover.type);
      if (!declaration) {
        problems.push(`${coverAt}: ${cover.type} is not a notification type`);
        return;
      }
      if (!coversListScope(declaration, listScope)) {
        problems.push(`${coverAt}: ${cover.type} cannot be in the ${listScope} list`);
      }
      for (const reason of cover.reasons) {
        if (!declaration.reasons.includes(reason)) {
          problems.push(`${coverAt}: ${cover.type} does not allow the reason ${reason}`);
        }
        pairs.push(`${cover.type}:${reason}`);
      }
      if (category.perSpace === true && !declaration.scopes.includes('space')) {
        problems.push(
          `${coverAt}: ${cover.type} cannot occur in a space, so it cannot be per space`,
        );
      }
    });
    if (Object.keys(category.channels).length === 0) {
      problems.push(`${at}: the category offers no channel`);
    }
    for (const channel of Object.keys(category.channels)) {
      if (!configured.includes(channel)) {
        problems.push(`${at}: the channel ${channel} is not configured`);
      }
    }
    if (category.perSpace === true && listScope === 'org') {
      problems.push(`${at}: only a community list can have a per-space category`);
    }
    if (category.spaceDefaults !== undefined) {
      if (category.perSpace !== true) {
        problems.push(`${at}: spaceDefaults needs perSpace`);
      }
      for (const [spaceId, channels] of Object.entries(category.spaceDefaults)) {
        for (const channel of Object.keys(channels)) {
          if (!(channel in category.channels)) {
            problems.push(
              `${at}: spaceDefaults for ${spaceId} names the channel ${channel}, which the category does not offer`,
            );
          }
        }
      }
    }
    if (pairs.length > 0 && pairs.every((pair) => covered.has(pair))) {
      problems.push(`${at}: earlier categories already cover everything it covers`);
    }
    for (const pair of pairs) {
      covered.add(pair);
    }
  });
  return problems;
}

export function assertValidCategoryList(
  categories: NotificationCategory[],
  listScope: CategoryListScope,
  types: Pick<NotificationTypeRegistry, 'get'>,
  configured: string[],
): void {
  const problems = categoryListProblems(categories, listScope, types, configured);
  if (problems.length > 0) {
    throw new ValidationError(problems.join('; '), problems);
  }
}

export function offeringConfigured(
  categories: NotificationCategory[],
  configured: string[],
): NotificationCategory[] {
  return categories.flatMap((category) => {
    const channels = Object.fromEntries(
      Object.entries(category.channels).filter(([channel]) => configured.includes(channel)),
    );
    if (Object.keys(channels).length === 0) {
      return [];
    }
    const { spaceDefaults, ...rest } = category;
    return [
      {
        ...rest,
        channels,
        ...(spaceDefaults !== undefined && {
          spaceDefaults: Object.fromEntries(
            Object.entries(spaceDefaults).map(([spaceId, values]) => [
              spaceId,
              Object.fromEntries(Object.entries(values).filter(([channel]) => channel in channels)),
            ]),
          ),
        }),
      },
    ];
  });
}

export function storedCategoryList(value: unknown): NotificationCategory[] | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = notificationCategoryListSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`stored notification categories are invalid: ${parsed.error.message}`);
  }
  return parsed.data;
}
