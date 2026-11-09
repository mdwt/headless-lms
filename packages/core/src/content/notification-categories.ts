import type { NotificationCategory } from '../types/index.js';
import type {
  ChannelRegistry,
  Logger,
  NotificationCategoryService,
  NotificationTypeRegistry,
} from '../shared/ports.js';
import { ForbiddenError, NotFoundError } from '../shared/errors.js';
import type { Actor } from '../shared/actor.js';
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
    communityId: string,
    actor: Actor,
  ): Promise<{ categories: NotificationCategory[]; source: 'default' | 'stored' }> {
    actor.permissions.require('communities:read', communityId);
    const orgId = actor.orgId;
    await this.assertCommunity(orgId, communityId);
    const value = await this.settings.get<Record<string, unknown>>(
      orgId,
      SettingsNamespace.content,
      communityId,
    );
    const stored = storedCategoryList(value?.notificationCategories);
    return stored
      ? { categories: offeringConfigured(stored, this.channels.list()), source: 'stored' }
      : { categories: this.types.defaults('community'), source: 'default' };
  }

  async replace(
    communityId: string,
    categories: NotificationCategory[],
    actor: Actor,
  ): Promise<{ categories: NotificationCategory[]; source: 'stored' }> {
    actor.permissions.require('communities:write', communityId);
    const orgId = actor.orgId;
    await this.assertCommunity(orgId, communityId);
    const configured = this.channels.list();
    assertValidCategoryList(categories, 'community', this.types, configured);
    const ordered = offeringConfigured(categories, configured);
    await this.settings.patch(orgId, SettingsNamespace.content, communityId, {
      notificationCategories: ordered,
    });
    this.logger.info('community notification categories replaced', {
      orgId,
      orgUserId: actor.id,
      communityId,
      keys: categories.map((category) => category.key),
    });
    return { categories: ordered, source: 'stored' };
  }

  async reset(communityId: string, actor: Actor): Promise<void> {
    actor.permissions.require('communities:write', communityId);
    const orgId = actor.orgId;
    await this.assertCommunity(orgId, communityId);
    await this.settings.patch(orgId, SettingsNamespace.content, communityId, {
      notificationCategories: null,
    });
    this.logger.info('community notification categories reset', {
      orgId,
      orgUserId: actor.id,
      communityId,
    });
  }

  defaults(actor: Actor): NotificationCategory[] {
    if (
      !actor.permissions.has('notification_categories:read') &&
      !actor.permissions.anywhere('communities:read')
    ) {
      throw new ForbiddenError('You need notification_categories:read or communities:read');
    }
    return this.types.defaults('community');
  }

  private async assertCommunity(orgId: string, communityId: string): Promise<void> {
    const community = await this.communities.findCommunityById(orgId, communityId);
    if (!community) {
      throw new NotFoundError('Community', communityId);
    }
  }
}
