import { and, asc, eq, inArray, notInArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { MentionsRepository } from "@headless-lms/core/discussion";
import type { Logger, MentionItemType } from "@headless-lms/core/types";
import { noopLogger } from "@headless-lms/core/shared/logger";
import { mentions } from "../schema/index.js";

export class DrizzleMentionsRepository implements MentionsRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly logger: Logger = noopLogger,
  ) {}

  async ofItem(orgId: string, itemType: MentionItemType, itemId: string): Promise<string[]> {
    const rows = await this.db
      .select({ orgUserId: mentions.orgUserId })
      .from(mentions)
      .where(this.item(orgId, itemType, itemId))
      .orderBy(asc(mentions.createdAt), asc(mentions.orgUserId));
    return rows.map((row) => row.orgUserId);
  }

  async forItems(
    orgId: string,
    itemType: MentionItemType,
    itemIds: string[],
  ): Promise<Record<string, string[]>> {
    if (itemIds.length === 0) {
      return {};
    }
    const rows = await this.db
      .select({ itemId: mentions.itemId, orgUserId: mentions.orgUserId })
      .from(mentions)
      .where(
        and(
          eq(mentions.orgId, orgId),
          eq(mentions.itemType, itemType),
          inArray(mentions.itemId, itemIds),
        ),
      )
      .orderBy(asc(mentions.itemId), asc(mentions.createdAt), asc(mentions.orgUserId));
    const byItem: Record<string, string[]> = {};
    for (const row of rows) {
      (byItem[row.itemId] ??= []).push(row.orgUserId);
    }
    return byItem;
  }

  async sync(
    orgId: string,
    itemType: MentionItemType,
    itemId: string,
    orgUserIds: string[],
    at: Date,
  ): Promise<string[]> {
    const item = this.item(orgId, itemType, itemId);
    await this.db
      .delete(mentions)
      .where(orgUserIds.length > 0 ? and(item, notInArray(mentions.orgUserId, orgUserIds)) : item);
    if (orgUserIds.length === 0) {
      return [];
    }
    const added = await this.db
      .insert(mentions)
      .values(
        orgUserIds.map((orgUserId) => ({ orgId, itemType, itemId, orgUserId, createdAt: at })),
      )
      .onConflictDoNothing()
      .returning({ orgUserId: mentions.orgUserId });
    this.logger.debug("mentions synced", { orgId, itemType, itemId, added: added.length });
    return added.map((row) => row.orgUserId);
  }

  async removeItem(orgId: string, itemType: MentionItemType, itemId: string): Promise<void> {
    await this.db.delete(mentions).where(this.item(orgId, itemType, itemId));
  }

  private item(orgId: string, itemType: MentionItemType, itemId: string) {
    return and(
      eq(mentions.orgId, orgId),
      eq(mentions.itemType, itemType),
      eq(mentions.itemId, itemId),
    );
  }
}
