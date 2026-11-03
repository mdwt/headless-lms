import type { NotificationCategory } from '../types/index.js';
import type {
  ChannelRegistry,
  Logger,
  NotificationCategoryService,
  NotificationTypeRegistry,
} from '../shared/ports.js';
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
    orgId: string,
    scopeId: string,
  ): Promise<{ categories: NotificationCategory[]; source: 'default' | 'stored' }> {
    const value = await this.settings.get<Record<string, unknown>>(
      orgId,
      SettingsNamespace.organizations,
      scopeId,
    );
    const stored = storedCategoryList(value?.notificationCategories);
    return stored
      ? { categories: offeringConfigured(stored, this.channels.list()), source: 'stored' }
      : { categories: this.defaults(), source: 'default' };
  }

  async replace(
    orgId: string,
    scopeId: string,
    categories: NotificationCategory[],
  ): Promise<{ categories: NotificationCategory[]; source: 'stored' }> {
    const configured = this.channels.list();
    assertValidCategoryList(categories, 'org', this.types, configured);
    const ordered = offeringConfigured(categories, configured);
    await this.settings.patch(orgId, SettingsNamespace.organizations, scopeId, {
      notificationCategories: ordered,
    });
    this.logger.info('org notification categories replaced', {
      orgId,
      keys: categories.map((category) => category.key),
    });
    return { categories: ordered, source: 'stored' };
  }

  async reset(orgId: string, scopeId: string): Promise<void> {
    await this.settings.patch(orgId, SettingsNamespace.organizations, scopeId, {
      notificationCategories: null,
    });
    this.logger.info('org notification categories reset', { orgId });
  }

  defaults(): NotificationCategory[] {
    return this.types.defaults('org');
  }
}
