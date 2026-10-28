import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { NotificationsQuery, NotificationsRepository } from "@headless-lms/core/identity";
import type { Notification, NotificationPreference } from "@headless-lms/core/types";
import { notificationPreferences, notifications } from "../schema/index.js";
import { translateDbErrors } from "./pg-errors.js";

export class DrizzleNotificationsRepository implements NotificationsRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async insert(orgId: string, rows: Notification[]): Promise<void> {
    if (rows.length === 0) {
      return;
    }
    await this.db.insert(notifications).values(rows.map((row) => ({ ...row, orgId })));
  }

  async page(
    orgId: string,
    userId: string,
    query: NotificationsQuery,
  ): Promise<{ rows: Notification[]; total: number; unreadCount: number }> {
    const mine = and(eq(notifications.orgId, orgId), eq(notifications.userId, userId));
    const [rows, counts] = await Promise.all([
      this.db
        .select()
        .from(notifications)
        .where(mine)
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.db
        .select({
          total: sql<number>`count(*)::int`,
          unread: sql<number>`(count(*) filter (where ${notifications.readAt} is null))::int`,
        })
        .from(notifications)
        .where(mine),
    ]);
    return {
      rows,
      total: Number(counts[0]?.total ?? 0),
      unreadCount: Number(counts[0]?.unread ?? 0),
    };
  }

  async markRead(
    orgId: string,
    userId: string,
    notificationId: string,
    at: Date,
  ): Promise<Notification | null> {
    const [row] = await this.db
      .update(notifications)
      .set({ readAt: sql`coalesce(${notifications.readAt}, ${at.toISOString()}::timestamptz)` })
      .where(
        and(
          eq(notifications.orgId, orgId),
          eq(notifications.userId, userId),
          eq(notifications.id, notificationId),
        ),
      )
      .returning();
    return row ?? null;
  }

  async markAllRead(orgId: string, userId: string, at: Date): Promise<number> {
    const rows = await this.db
      .update(notifications)
      .set({ readAt: at })
      .where(
        and(
          eq(notifications.orgId, orgId),
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
        ),
      )
      .returning({ id: notifications.id });
    return rows.length;
  }

  async preferences(
    orgId: string,
    userIds: string[],
  ): Promise<(NotificationPreference & { userId: string })[]> {
    if (userIds.length === 0) {
      return [];
    }
    return this.db
      .select({
        userId: notificationPreferences.userId,
        kind: notificationPreferences.kind,
        inApp: notificationPreferences.inApp,
        email: notificationPreferences.email,
      })
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.orgId, orgId),
          inArray(notificationPreferences.userId, userIds),
        ),
      );
  }

  async upsertPreferences(
    orgId: string,
    userId: string,
    preferences: NotificationPreference[],
  ): Promise<void> {
    if (preferences.length === 0) {
      return;
    }
    await this.db
      .insert(notificationPreferences)
      .values(preferences.map((pref) => ({ orgId, userId, ...pref })))
      .onConflictDoUpdate({
        target: [
          notificationPreferences.orgId,
          notificationPreferences.userId,
          notificationPreferences.kind,
        ],
        set: {
          inApp: sql`excluded.in_app`,
          email: sql`excluded.email`,
          updatedAt: sql`now()`,
        },
      });
  }
}

translateDbErrors(DrizzleNotificationsRepository);
