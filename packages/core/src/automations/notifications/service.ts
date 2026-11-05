import { NotFoundError } from '../../shared/errors.js';
import { noopLogger } from '../../shared/logger.js';
import type { Logger } from '../../shared/ports.js';
import type { NotificationFilter } from '../../types/index.js';
import type { Actor } from '../../shared/actor.js';
import type {
  ListedNotification,
  NotificationPage,
  NotificationsRepository,
  NotificationsService,
  UnreadCounts,
} from '../ports.js';

export class NotificationsServiceImpl implements NotificationsService {
  private readonly repo: NotificationsRepository;
  private readonly logger: Logger;

  constructor(params: { repo: NotificationsRepository; logger?: Logger }) {
    this.repo = params.repo;
    this.logger = params.logger ?? noopLogger;
  }

  list(
    userId: string,
    filter: NotificationFilter,
    page: { page: number; pageSize: number },
    actor: Actor,
  ): Promise<NotificationPage> {
    return this.repo.page(actor.orgId, userId, filter, page);
  }

  get(userId: string, notificationId: string, actor: Actor): Promise<ListedNotification | null> {
    return this.repo.find(actor.orgId, userId, notificationId);
  }

  async unreadCounts(userId: string, communityIds: string[], actor: Actor): Promise<UnreadCounts> {
    const ids = [...new Set(communityIds)];
    const counts = await this.repo.unreadCounts(actor.orgId, userId, ids);
    const byCommunity = new Map(counts.communities.map((row) => [row.communityId, row.unread]));
    return {
      org: counts.org,
      communities: ids.map((communityId) => ({
        communityId,
        unread: byCommunity.get(communityId) ?? 0,
      })),
    };
  }

  async markRead(userId: string, notificationId: string, actor: Actor): Promise<void> {
    if (!(await this.repo.markRead(actor.orgId, userId, notificationId, new Date()))) {
      throw new NotFoundError('Notification', notificationId);
    }
  }

  async markAllRead(
    userId: string,
    filter: NotificationFilter,
    actor: Actor,
  ): Promise<{ marked: number }> {
    const marked = await this.repo.markAllRead(actor.orgId, userId, filter, new Date());
    this.logger.debug('notifications marked read', { orgId: actor.orgId, userId, marked });
    return { marked };
  }
}
