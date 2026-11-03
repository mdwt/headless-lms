import { NotFoundError } from '../../shared/errors.js';
import { noopLogger } from '../../shared/logger.js';
import type { Logger } from '../../shared/ports.js';
import type { NotificationFilter } from '../../types/index.js';
import type {
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
    orgId: string,
    userId: string,
    filter: NotificationFilter,
    page: { page: number; pageSize: number },
  ): Promise<NotificationPage> {
    return this.repo.page(orgId, userId, filter, page);
  }

  async unreadCounts(orgId: string, userId: string, communityIds: string[]): Promise<UnreadCounts> {
    const ids = [...new Set(communityIds)];
    const counts = await this.repo.unreadCounts(orgId, userId, ids);
    const byCommunity = new Map(counts.communities.map((row) => [row.communityId, row.unread]));
    return {
      org: counts.org,
      communities: ids.map((communityId) => ({
        communityId,
        unread: byCommunity.get(communityId) ?? 0,
      })),
    };
  }

  async markRead(orgId: string, userId: string, notificationId: string): Promise<void> {
    if (!(await this.repo.markRead(orgId, userId, notificationId, new Date()))) {
      throw new NotFoundError('Notification', notificationId);
    }
  }

  async markAllRead(
    orgId: string,
    userId: string,
    filter: NotificationFilter,
  ): Promise<{ marked: number }> {
    const marked = await this.repo.markAllRead(orgId, userId, filter, new Date());
    this.logger.debug('notifications marked read', { orgId, userId, marked });
    return { marked };
  }
}
