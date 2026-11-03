import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { SubscriptionsRepository } from "@headless-lms/core/discussion";
import type { Logger, Subscription, SubscriptionItemType } from "@headless-lms/core/types";
import { noopLogger } from "@headless-lms/core/shared/logger";
import { subscriptions } from "../schema/index.js";

type SubscriptionRow = typeof subscriptions.$inferSelect;

function toSubscription(row: SubscriptionRow): Subscription {
  return {
    orgId: row.orgId,
    orgUserId: row.orgUserId,
    itemType: row.itemType,
    itemId: row.itemId,
    state: row.state,
    mutedUntil: row.mutedUntil,
    createdAt: row.createdAt,
  };
}

export class DrizzleSubscriptionsRepository implements SubscriptionsRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly logger: Logger = noopLogger,
  ) {}

  async upsert(orgId: string, subscription: Subscription): Promise<void> {
    await this.db
      .insert(subscriptions)
      .values({
        orgId,
        orgUserId: subscription.orgUserId,
        itemType: subscription.itemType,
        itemId: subscription.itemId,
        state: subscription.state,
        mutedUntil: subscription.mutedUntil,
        createdAt: subscription.createdAt,
      })
      .onConflictDoUpdate({
        target: [
          subscriptions.orgId,
          subscriptions.orgUserId,
          subscriptions.itemType,
          subscriptions.itemId,
        ],
        set: { state: subscription.state, mutedUntil: subscription.mutedUntil },
      });
    this.logger.debug("subscription stored", {
      orgId,
      itemType: subscription.itemType,
      itemId: subscription.itemId,
    });
  }

  async remove(
    orgId: string,
    orgUserId: string,
    itemType: SubscriptionItemType,
    itemId: string,
  ): Promise<void> {
    await this.db
      .delete(subscriptions)
      .where(
        and(
          eq(subscriptions.orgId, orgId),
          eq(subscriptions.orgUserId, orgUserId),
          eq(subscriptions.itemType, itemType),
          eq(subscriptions.itemId, itemId),
        ),
      );
  }

  async forViewer(
    orgId: string,
    orgUserId: string,
    itemType: SubscriptionItemType,
    itemIds: string[],
  ): Promise<Subscription[]> {
    if (itemIds.length === 0) {
      return [];
    }
    const rows = await this.db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.orgId, orgId),
          eq(subscriptions.orgUserId, orgUserId),
          eq(subscriptions.itemType, itemType),
          inArray(subscriptions.itemId, itemIds),
        ),
      );
    return rows.map(toSubscription);
  }

  async ofItem(
    orgId: string,
    itemType: SubscriptionItemType,
    itemId: string,
  ): Promise<Subscription[]> {
    const rows = await this.db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.orgId, orgId),
          eq(subscriptions.itemType, itemType),
          eq(subscriptions.itemId, itemId),
        ),
      );
    return rows.map(toSubscription);
  }

  async followerIds(orgId: string, postId: string): Promise<string[]> {
    const rows = await this.db
      .select({ orgUserId: subscriptions.orgUserId })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.orgId, orgId),
          eq(subscriptions.itemType, "post"),
          eq(subscriptions.itemId, postId),
          eq(subscriptions.state, "following"),
        ),
      );
    return rows.map((row) => row.orgUserId);
  }

  async mutedAmong(
    orgId: string,
    itemType: SubscriptionItemType,
    itemId: string,
    orgUserIds: string[],
    at: Date,
  ): Promise<string[]> {
    if (orgUserIds.length === 0) {
      return [];
    }
    const rows = await this.db
      .select({ orgUserId: subscriptions.orgUserId })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.orgId, orgId),
          eq(subscriptions.itemType, itemType),
          eq(subscriptions.itemId, itemId),
          eq(subscriptions.state, "muted"),
          inArray(subscriptions.orgUserId, orgUserIds),
          or(isNull(subscriptions.mutedUntil), gt(subscriptions.mutedUntil, at)),
        ),
      );
    return rows.map((row) => row.orgUserId);
  }
}
