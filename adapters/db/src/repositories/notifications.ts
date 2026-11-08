import {
  and,
  arrayOverlaps,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type {
  ListedNotification,
  NewDelivery,
  NewNotification,
  NotificationPage,
  NotificationsRepository,
  UnreadCounts,
} from "@headless-lms/core/automations";
import type {
  Delivery,
  NotificationFilter,
  StoredNotification,
  SubjectRef,
} from "@headless-lms/core/types";
import type { DbExecutor } from "../client.js";
import { notificationDeliveries, notifications } from "../schema/index.js";
import { translateDbErrors } from "./pg-errors.js";

const n = notifications;
const d = notificationDeliveries;

type NotificationRow = typeof notifications.$inferSelect;
type DeliveryRow = typeof notificationDeliveries.$inferSelect;

function ref(type: string | null, id: string | null): SubjectRef | null {
  return type && id ? { type: type as SubjectRef["type"], id } : null;
}

function toStored(row: NotificationRow): StoredNotification {
  return {
    id: row.id,
    orgId: row.orgId,
    userId: row.userId,
    type: row.type,
    scope: row.scope,
    reasons: row.reasons,
    matchedReason: row.matchedReason,
    category: row.category,
    communityId: row.communityId,
    spaceId: row.spaceId,
    actorId: row.actorId,
    subject: ref(row.subjectType, row.subjectId),
    parent: ref(row.parentType, row.parentId),
    display: row.display,
    createdAt: row.createdAt,
  };
}

function toDelivery(row: DeliveryRow): Delivery {
  return {
    id: row.id,
    notificationId: row.notificationId,
    channel: row.channel,
    status: row.status,
    lastError: row.lastError,
    createdAt: row.createdAt,
    sentAt: row.sentAt,
  };
}

function listed(orgId: string, userId: string, filter: NotificationFilter): SQL[] {
  const conditions: SQL[] = [eq(n.orgId, orgId), eq(n.userId, userId), eq(n.inApp, true)];
  if (filter.scope === "org") {
    conditions.push(isNull(n.communityId));
  }
  if (filter.scope === "community") {
    conditions.push(isNotNull(n.communityId));
  }
  if (filter.communityId !== undefined) {
    const community = eq(n.communityId, filter.communityId);
    conditions.push(filter.includeOrg ? or(community, isNull(n.communityId))! : community);
  }
  if (filter.category && filter.category.length > 0) {
    conditions.push(inArray(n.category, filter.category));
  }
  if (filter.reason && filter.reason.length > 0) {
    conditions.push(arrayOverlaps(n.reasons, filter.reason));
  }
  if (filter.type && filter.type.length > 0) {
    conditions.push(inArray(n.type, filter.type));
  }
  if (filter.unread === true) {
    conditions.push(isNull(n.readAt));
  }
  return conditions;
}

export class DrizzleNotificationsRepository implements NotificationsRepository {
  constructor(private readonly db: DbExecutor) {}

  async insert(orgId: string, rows: NewNotification[], deliveries: NewDelivery[]): Promise<void> {
    if (rows.length === 0) {
      return;
    }
    await this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(n)
        .values(
          rows.map((row) => ({
            orgId,
            id: row.id,
            userId: row.userId,
            sourceEventId: row.sourceEventId,
            type: row.type,
            scope: row.scope,
            reasons: row.reasons,
            matchedReason: row.matchedReason,
            category: row.category,
            communityId: row.communityId,
            spaceId: row.spaceId,
            actorId: row.actorId,
            subjectType: row.subject?.type ?? null,
            subjectId: row.subject?.id ?? null,
            parentType: row.parent?.type ?? null,
            parentId: row.parent?.id ?? null,
            display: row.display,
            inApp: row.inApp,
            createdAt: row.createdAt,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: n.id });
      const kept = new Set(inserted.map((row) => row.id));
      const pending = deliveries.filter((delivery) => kept.has(delivery.notificationId));
      if (pending.length === 0) {
        return;
      }
      await tx
        .insert(d)
        .values(
          pending.map((delivery) => ({
            orgId,
            id: delivery.id,
            notificationId: delivery.notificationId,
            channel: delivery.channel,
            status: "pending" as const,
          })),
        )
        .onConflictDoNothing();
    });
  }

  async pendingDeliveriesForEvent(orgId: string, sourceEventId: string): Promise<{ id: string }[]> {
    return this.db
      .select({ id: d.id })
      .from(d)
      .innerJoin(n, and(eq(n.orgId, d.orgId), eq(n.id, d.notificationId)))
      .where(and(eq(n.orgId, orgId), eq(n.sourceEventId, sourceEventId), eq(d.status, "pending")))
      .orderBy(d.id);
  }

  async findDelivery(
    orgId: string,
    deliveryId: string,
  ): Promise<{ delivery: Delivery; notification: StoredNotification } | null> {
    const [row] = await this.db
      .select({ delivery: d, notification: n })
      .from(d)
      .innerJoin(n, and(eq(n.orgId, d.orgId), eq(n.id, d.notificationId)))
      .where(and(eq(d.orgId, orgId), eq(d.id, deliveryId)))
      .limit(1);
    return row
      ? { delivery: toDelivery(row.delivery), notification: toStored(row.notification) }
      : null;
  }

  async markSent(orgId: string, deliveryId: string, at: Date): Promise<void> {
    await this.db
      .update(d)
      .set({ status: "sent", sentAt: at })
      .where(and(eq(d.orgId, orgId), eq(d.id, deliveryId), eq(d.status, "pending")));
  }

  async recordError(orgId: string, deliveryId: string, error: string): Promise<void> {
    await this.db
      .update(d)
      .set({ lastError: error })
      .where(and(eq(d.orgId, orgId), eq(d.id, deliveryId), eq(d.status, "pending")));
  }

  async markFailed(orgId: string, deliveryId: string, error: string): Promise<void> {
    await this.db
      .update(d)
      .set({ status: "failed", lastError: error })
      .where(and(eq(d.orgId, orgId), eq(d.id, deliveryId), eq(d.status, "pending")));
  }

  async page(
    orgId: string,
    userId: string,
    filter: NotificationFilter,
    page: { page: number; pageSize: number },
  ): Promise<NotificationPage> {
    const where = and(...listed(orgId, userId, filter));
    const [rows, counts] = await Promise.all([
      this.db
        .select()
        .from(n)
        .where(where)
        .orderBy(desc(n.createdAt), desc(n.id))
        .limit(page.pageSize)
        .offset((page.page - 1) * page.pageSize),
      this.db
        .select({
          total: sql<number>`count(*)::int`,
          unread: sql<number>`(count(*) filter (where ${n.readAt} is null))::int`,
        })
        .from(n)
        .where(where),
    ]);
    return {
      items: rows.map((row) => ({ ...toStored(row), readAt: row.readAt })),
      total: Number(counts[0]?.total ?? 0),
      unreadCount: Number(counts[0]?.unread ?? 0),
    };
  }

  async find(
    orgId: string,
    userId: string,
    notificationId: string,
  ): Promise<ListedNotification | null> {
    const [row] = await this.db
      .select()
      .from(n)
      .where(
        and(eq(n.orgId, orgId), eq(n.userId, userId), eq(n.id, notificationId), eq(n.inApp, true)),
      )
      .limit(1);
    return row ? { ...toStored(row), readAt: row.readAt } : null;
  }

  async unreadCounts(orgId: string, userId: string, communityIds: string[]): Promise<UnreadCounts> {
    const unread = and(
      eq(n.orgId, orgId),
      eq(n.userId, userId),
      eq(n.inApp, true),
      isNull(n.readAt),
    );
    const [org, communities] = await Promise.all([
      this.db
        .select({ unread: sql<number>`count(*)::int` })
        .from(n)
        .where(and(unread, isNull(n.communityId))),
      communityIds.length === 0
        ? Promise.resolve([])
        : this.db
            .select({ communityId: n.communityId, unread: sql<number>`count(*)::int` })
            .from(n)
            .where(and(unread, inArray(n.communityId, communityIds)))
            .groupBy(n.communityId),
    ]);
    return {
      org: Number(org[0]?.unread ?? 0),
      communities: communities.flatMap((row) =>
        row.communityId ? [{ communityId: row.communityId, unread: Number(row.unread) }] : [],
      ),
    };
  }

  async markRead(
    orgId: string,
    userId: string,
    notificationId: string,
    at: Date,
  ): Promise<boolean> {
    const rows = await this.db
      .update(n)
      .set({ readAt: sql`coalesce(${n.readAt}, ${at.toISOString()}::timestamptz)` })
      .where(
        and(eq(n.orgId, orgId), eq(n.userId, userId), eq(n.id, notificationId), eq(n.inApp, true)),
      )
      .returning({ id: n.id });
    return rows.length > 0;
  }

  async markAllRead(
    orgId: string,
    userId: string,
    filter: NotificationFilter,
    at: Date,
  ): Promise<number> {
    const rows = await this.db
      .update(n)
      .set({ readAt: at })
      .where(and(...listed(orgId, userId, filter), isNull(n.readAt)))
      .returning({ id: n.id });
    return rows.length;
  }
}

translateDbErrors(DrizzleNotificationsRepository);
