import { NotFoundError } from '../shared/errors.js';
import { genId } from '../shared/id.js';
import { noopLogger } from '../shared/logger.js';
import type { Logger } from '../shared/ports.js';
import { notificationKindSchema } from '../types/schemas/identity.js';
import type { Notification, NotificationKind, NotificationPreference } from './model.js';
import type {
  NewNotification,
  NotificationPage,
  NotificationService,
  NotificationsQuery,
  NotificationsRepository,
} from './ports.js';

export function defaultPreference(kind: NotificationKind): NotificationPreference {
  return { kind, inApp: true, email: true };
}

export class NotificationServiceImpl implements NotificationService {
  private readonly repo: NotificationsRepository;
  private readonly logger: Logger;

  constructor(params: { repo: NotificationsRepository; logger?: Logger }) {
    this.repo = params.repo;
    this.logger = params.logger ?? noopLogger;
  }

  async notify(orgId: string, notifications: NewNotification[]): Promise<void> {
    if (notifications.length === 0) {
      return;
    }
    const now = new Date();
    const rows: Notification[] = notifications.map((notification) => ({
      ...notification,
      orgId,
      id: genId('notification'),
      createdAt: now,
      readAt: null,
    }));
    await this.repo.insert(orgId, rows);
    this.logger.info('notifications added', {
      orgId,
      kinds: [...new Set(rows.map((row) => row.kind))],
      count: rows.length,
    });
  }

  async preferencesFor(
    orgId: string,
    userIds: string[],
    kind: NotificationKind,
  ): Promise<Record<string, NotificationPreference>> {
    const unique = [...new Set(userIds)];
    const stored = await this.repo.preferences(orgId, unique);
    const result: Record<string, NotificationPreference> = {};
    for (const userId of unique) {
      result[userId] = defaultPreference(kind);
    }
    for (const row of stored) {
      if (row.kind === kind) {
        result[row.userId] = { kind, inApp: row.inApp, email: row.email };
      }
    }
    return result;
  }

  async listNotifications(
    orgId: string,
    userId: string,
    query: NotificationsQuery,
  ): Promise<NotificationPage> {
    const page = await this.repo.page(orgId, userId, query);
    this.logger.debug('notifications listed', { orgId, userId, count: page.rows.length });
    return { ...page, page: query.page, pageSize: query.pageSize };
  }

  async markNotificationRead(
    orgId: string,
    userId: string,
    notificationId: string,
  ): Promise<Notification> {
    const row = await this.repo.markRead(orgId, userId, notificationId, new Date());
    if (!row) {
      throw new NotFoundError('Notification', notificationId);
    }
    return row;
  }

  async markAllNotificationsRead(orgId: string, userId: string): Promise<{ updated: number }> {
    const updated = await this.repo.markAllRead(orgId, userId, new Date());
    this.logger.debug('notifications marked read', { orgId, userId, updated });
    return { updated };
  }

  async notificationPreferences(orgId: string, userId: string): Promise<NotificationPreference[]> {
    const stored = await this.repo.preferences(orgId, [userId]);
    const byKind = new Map(stored.map((row) => [row.kind, row]));
    return notificationKindSchema.options.map((kind) => {
      const row = byKind.get(kind);
      return row ? { kind, inApp: row.inApp, email: row.email } : defaultPreference(kind);
    });
  }

  async setNotificationPreferences(
    orgId: string,
    userId: string,
    preferences: NotificationPreference[],
  ): Promise<NotificationPreference[]> {
    await this.repo.upsertPreferences(orgId, userId, preferences);
    this.logger.info('notification preferences updated', {
      orgId,
      userId,
      kinds: preferences.map((pref) => pref.kind),
    });
    return this.notificationPreferences(orgId, userId);
  }
}
