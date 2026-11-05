import type { NotificationCategory } from '../types/index.js';
import type {
  ChannelRegistry,
  Logger,
  NotificationCategoryService,
  NotificationTypeRegistry,
} from '../shared/ports.js';
import type { Actor } from '../shared/actor.js';
import { requires, type Declarations } from '../shared/declarations.js';
import { NotFoundError } from '../shared/errors.js';
import { noopLogger } from '../shared/logger.js';
import { SettingsNamespace, type SettingsService } from '../shared/settings.js';
import {
  assertValidCategoryList,
  offeringConfigured,
  storedCategoryList,
} from '../shared/notification-categories.js';

export type OrgNotificationCategoriesParams = {
  settings: SettingsService;
  types: NotificationTypeRegistry;
  channels: ChannelRegistry;
  logger?: Logger;
};

export class OrgNotificationCategories implements NotificationCategoryService {
  private readonly settings: SettingsService;
  private readonly types: NotificationTypeRegistry;
  private readonly channels: ChannelRegistry;
  private readonly logger: Logger;

  constructor(params: OrgNotificationCategoriesParams) {
    this.settings = params.settings;
    this.types = params.types;
    this.channels = params.channels;
    this.logger = params.logger ?? noopLogger;
  }

  async get(
    scopeId: string,
    actor: Actor,
  ): Promise<{ categories: NotificationCategory[]; source: 'default' | 'stored' }> {
    actor.permissions.require('notification_categories:read');
    this.assertOrg(scopeId, actor);
    const value = await this.settings.get<Record<string, unknown>>(
      actor.orgId,
      SettingsNamespace.organizations,
      scopeId,
    );
    const stored = storedCategoryList(value?.notificationCategories);
    return stored
      ? { categories: offeringConfigured(stored, this.channels.list()), source: 'stored' }
      : { categories: this.types.defaults('org'), source: 'default' };
  }

  async replace(
    scopeId: string,
    categories: NotificationCategory[],
    actor: Actor,
  ): Promise<{ categories: NotificationCategory[]; source: 'stored' }> {
    actor.permissions.require('notification_categories:write');
    this.assertOrg(scopeId, actor);
    const configured = this.channels.list();
    assertValidCategoryList(categories, 'org', this.types, configured);
    const ordered = offeringConfigured(categories, configured);
    await this.settings.patch(actor.orgId, SettingsNamespace.organizations, scopeId, {
      notificationCategories: ordered,
    });
    this.logger.info('org notification categories replaced', {
      orgId: actor.orgId,
      orgUserId: actor.id,
      keys: categories.map((category) => category.key),
    });
    return { categories: ordered, source: 'stored' };
  }

  async reset(scopeId: string, actor: Actor): Promise<void> {
    actor.permissions.require('notification_categories:write');
    this.assertOrg(scopeId, actor);
    await this.settings.patch(actor.orgId, SettingsNamespace.organizations, scopeId, {
      notificationCategories: null,
    });
    this.logger.info('org notification categories reset', {
      orgId: actor.orgId,
      orgUserId: actor.id,
    });
  }

  defaults(actor: Actor): NotificationCategory[] {
    actor.permissions.require('notification_categories:read');
    return this.types.defaults('org');
  }

  private assertOrg(scopeId: string, actor: Actor): void {
    if (scopeId !== actor.orgId) {
      throw new NotFoundError('Organization', scopeId);
    }
  }
}

export const orgNotificationCategoriesDeclarations = {
  get: requires('notification_categories:read'),
  replace: requires('notification_categories:write'),
  reset: requires('notification_categories:write'),
  defaults: requires('notification_categories:read'),
} as const satisfies Declarations<NotificationCategoryService>;
