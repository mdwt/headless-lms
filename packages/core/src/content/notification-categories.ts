import type { NotificationCategory } from '../types/index.js';
import type {
  ChannelRegistry,
  Logger,
  NotificationCategoryService,
  NotificationTypeRegistry,
} from '../shared/ports.js';
import { NotFoundError } from '../shared/errors.js';
import { noopLogger } from '../shared/logger.js';
import { SettingsNamespace, type SettingsService } from '../shared/settings.js';
import {
  assertValidCategoryList,
  offeringConfigured,
  storedCategoryList,
} from '../shared/notification-categories.js';
import type { ContentRepository } from './ports.js';

export type CommunityNotificationCategoriesParams = {
  communities: Pick<ContentRepository, 'findCommunityById'>;
  settings: SettingsService;
  types: NotificationTypeRegistry;
  channels: ChannelRegistry;
  logger?: Logger;
};

export class CommunityNotificationCategories implements NotificationCategoryService {
  private readonly communities: Pick<ContentRepository, 'findCommunityById'>;
  private readonly settings: SettingsService;
  private readonly types: NotificationTypeRegistry;
  private readonly channels: ChannelRegistry;
  private readonly logger: Logger;

  constructor(params: CommunityNotificationCategoriesParams) {
    this.communities = params.communities;
    this.settings = params.settings;
    this.types = params.types;
    this.channels = params.channels;
    this.logger = params.logger ?? noopLogger;
  }

  async get(
    orgId: string,
    communityId: string,
  ): Promise<{ categories: NotificationCategory[]; source: 'default' | 'stored' }> {
    await this.assertCommunity(orgId, communityId);
    const value = await this.settings.get<Record<string, unknown>>(
      orgId,
      SettingsNamespace.content,
      communityId,
    );
    const stored = storedCategoryList(value?.notificationCategories);
    return stored
      ? { categories: offeringConfigured(stored, this.channels.list()), source: 'stored' }
      : { categories: this.defaults(), source: 'default' };
  }

  async replace(
    orgId: string,
    communityId: string,
    categories: NotificationCategory[],
  ): Promise<{ categories: NotificationCategory[]; source: 'stored' }> {
    await this.assertCommunity(orgId, communityId);
    const configured = this.channels.list();
    assertValidCategoryList(categories, 'community', this.types, configured);
    const ordered = offeringConfigured(categories, configured);
    await this.settings.patch(orgId, SettingsNamespace.content, communityId, {
      notificationCategories: ordered,
    });
    this.logger.info('community notification categories replaced', {
      orgId,
      communityId,
      keys: categories.map((category) => category.key),
    });
    return { categories: ordered, source: 'stored' };
  }

  async reset(orgId: string, communityId: string): Promise<void> {
    await this.assertCommunity(orgId, communityId);
    await this.settings.patch(orgId, SettingsNamespace.content, communityId, {
      notificationCategories: null,
    });
    this.logger.info('community notification categories reset', { orgId, communityId });
  }

  defaults(): NotificationCategory[] {
    return this.types.defaults('community');
  }

  private async assertCommunity(orgId: string, communityId: string): Promise<void> {
    const community = await this.communities.findCommunityById(orgId, communityId);
    if (!community) {
      throw new NotFoundError('Community', communityId);
    }
  }
}
