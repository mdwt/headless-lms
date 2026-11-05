import type { NotificationCategory, NotificationTypeDeclaration } from '../types/index.js';
import type { ChannelRegistry, NotificationTypeRegistry } from '../shared/ports.js';
import type { Actor } from '../shared/actor.js';
import { ForbiddenError } from '../shared/errors.js';
import { requires, type Declarations } from '../shared/declarations.js';
import { typesForList, type CategoryListScope } from '../shared/notification-categories.js';

export interface NotificationCatalogService {
  types(
    actor: Actor,
    scope: CategoryListScope,
  ): Pick<NotificationTypeDeclaration, 'type' | 'scopes' | 'reasons'>[];
  channels(actor: Actor): { channel: string }[];
  defaults(actor: Actor, scope: CategoryListScope): NotificationCategory[];
}

export type NotificationCatalogParams = {
  types: NotificationTypeRegistry;
  channels: Pick<ChannelRegistry, 'list'>;
};

export class NotificationCatalog implements NotificationCatalogService {
  private readonly registry: NotificationTypeRegistry;
  private readonly channelRegistry: Pick<ChannelRegistry, 'list'>;

  constructor(params: NotificationCatalogParams) {
    this.registry = params.types;
    this.channelRegistry = params.channels;
  }

  types(
    actor: Actor,
    scope: CategoryListScope,
  ): Pick<NotificationTypeDeclaration, 'type' | 'scopes' | 'reasons'>[] {
    this.requireFor(actor, scope);
    return typesForList(this.registry, scope);
  }

  channels(actor: Actor): { channel: string }[] {
    this.requireFor(actor, 'community');
    return this.channelRegistry.list().map((channel) => ({ channel }));
  }

  defaults(actor: Actor, scope: CategoryListScope): NotificationCategory[] {
    this.requireFor(actor, scope);
    return this.registry.defaults(scope);
  }

  private requireFor(actor: Actor, scope: CategoryListScope): void {
    if (actor.permissions.has('notification_categories:read')) {
      return;
    }
    if (scope === 'community' && actor.permissions.anywhere('communities:read')) {
      return;
    }
    throw new ForbiddenError(
      scope === 'org'
        ? 'You need notification_categories:read'
        : 'You need notification_categories:read or communities:read',
    );
  }
}

export const notificationCatalogDeclarations = {
  types: requires('notification_categories:read', 'communities:read'),
  channels: requires('notification_categories:read', 'communities:read'),
  defaults: requires('notification_categories:read', 'communities:read'),
} as const satisfies Declarations<NotificationCatalogService>;
