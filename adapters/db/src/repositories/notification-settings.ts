import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { NotificationSettingsRepository, SettingKey } from "@headless-lms/core/identity";
import type { Logger, StoredSetting } from "@headless-lms/core/types";
import { genId } from "@headless-lms/core/shared/id";
import { noopLogger } from "@headless-lms/core/shared/logger";
import { notificationSettings, orgUsers } from "../schema/index.js";
import { translateDbErrors } from "./pg-errors.js";

const ns = notificationSettings;
const communityKey = sql`coalesce(${ns.communityId}, '')`;
const spaceKey = sql`coalesce(${ns.spaceId}, '')`;

function matchesKey(key: SettingKey): SQL {
  return sql`(${communityKey} = ${key.communityId ?? ""} and ${spaceKey} = ${key.spaceId ?? ""} and ${ns.category} = ${key.category} and ${ns.channel} = ${key.channel})`;
}

export class DrizzleNotificationSettingsRepository implements NotificationSettingsRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly logger: Logger = noopLogger,
  ) {}

  async forUsers(
    orgId: string,
    userIds: string[],
    communityId: string | null,
    categories: string[] | null,
  ): Promise<(StoredSetting & { userId: string })[]> {
    if (userIds.length === 0) {
      return [];
    }
    const conditions = [
      eq(ns.orgId, orgId),
      inArray(ns.userId, userIds),
      sql`${communityKey} = ${communityId ?? ""}`,
    ];
    if (categories !== null) {
      if (categories.length === 0) {
        return [];
      }
      conditions.push(inArray(ns.category, categories));
    }
    return this.db
      .select({
        userId: ns.userId,
        communityId: ns.communityId,
        spaceId: ns.spaceId,
        category: ns.category,
        channel: ns.channel,
        enabled: ns.enabled,
      })
      .from(ns)
      .where(and(...conditions));
  }

  async apply(
    orgId: string,
    userId: string,
    upserts: (SettingKey & { enabled: boolean })[],
    deletes: SettingKey[],
    at: Date,
  ): Promise<void> {
    if (upserts.length === 0 && deletes.length === 0) {
      return;
    }
    await this.db.transaction(async (tx) => {
      if (deletes.length > 0) {
        await tx
          .delete(ns)
          .where(
            and(
              eq(ns.orgId, orgId),
              eq(ns.userId, userId),
              sql`(${sql.join(deletes.map(matchesKey), sql` or `)})`,
            ),
          );
      }
      if (upserts.length > 0) {
        const rows = upserts.map(
          (row) =>
            sql`(${orgId}, ${genId("notificationSetting")}, ${userId}, ${row.communityId}, ${row.spaceId}, ${row.category}, ${row.channel}, ${row.enabled}, ${at.toISOString()}::timestamptz)`,
        );
        await tx.execute(
          sql`insert into notification_settings (org_id, id, user_id, community_id, space_id, category, channel, enabled, updated_at) values ${sql.join(rows, sql`, `)} on conflict (org_id, user_id, coalesce(community_id, ''), coalesce(space_id, ''), category, channel) do update set enabled = excluded.enabled, updated_at = excluded.updated_at`,
        );
      }
    });
    this.logger.debug("notification settings applied", {
      orgId,
      userId,
      upserts: upserts.length,
      deletes: deletes.length,
    });
  }

  async switchedOn(
    orgId: string,
    communityId: string,
    category: string,
    spaceId: string | null,
  ): Promise<string[]> {
    const levels = spaceId === null ? [""] : [spaceId, ""];
    const rows = await this.db
      .selectDistinct({ orgUserId: orgUsers.id })
      .from(ns)
      .innerJoin(orgUsers, and(eq(orgUsers.orgId, ns.orgId), eq(orgUsers.userId, ns.userId)))
      .where(
        and(
          eq(ns.orgId, orgId),
          sql`${communityKey} = ${communityId}`,
          eq(ns.category, category),
          sql`${spaceKey} in (${sql.join(
            levels.map((level) => sql`${level}`),
            sql`, `,
          )})`,
          sql`${ns.enabled}`,
        ),
      );
    return rows.map((row) => row.orgUserId);
  }
}
translateDbErrors(DrizzleNotificationSettingsRepository);
