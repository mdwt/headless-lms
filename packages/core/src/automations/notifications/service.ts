import { NotFoundError } from '../../shared/errors.js';
import { noopLogger } from '../../shared/logger.js';
import type { Logger } from '../../shared/ports.js';
import type { NotificationFilter } from '../../types/index.js';
import type { MemberActor } from '../../identity/index.js';
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
    filter: NotificationFilter,
    page: { page: number; pageSize: number },
    actor: MemberActor,
  ): Promise<NotificationPage> {
    return this.repo.page(actor.orgId, actor.userId, filter, page);
  }

  get(notificationId: string, actor: MemberActor): Promise<ListedNotification | null> {
    return this.repo.find(actor.orgId, actor.userId, notificationId);
  }

  async unreadCounts(communityIds: string[], actor: MemberActor): Promise<UnreadCounts> {
    const ids = [...new Set(communityIds)];
    const counts = await this.repo.unreadCounts(actor.orgId, actor.userId, ids);
    const byCommunity = new Map(counts.communities.map((row) => [row.communityId, row.unread]));
    return {
      org: counts.org,
      communities: ids.map((communityId) => ({
        communityId,
        unread: byCommunity.get(communityId) ?? 0,
      })),
    };
  }

  async markRead(notificationId: string, actor: MemberActor): Promise<void> {
    if (!(await this.repo.markRead(actor.orgId, actor.userId, notificationId, new Date()))) {
      throw new NotFoundError('Notification', notificationId);
    }
  }

  async markAllRead(filter: NotificationFilter, actor: MemberActor): Promise<{ marked: number }> {
    const marked = await this.repo.markAllRead(actor.orgId, actor.userId, filter, new Date());
    this.logger.debug('notifications marked read', {
      orgId: actor.orgId,
      userId: actor.userId,
      marked,
    });
    return { marked };
  }
}
