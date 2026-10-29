// member — Drizzle read repo (implements the reporting/member outbound port).
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type {
  DirectoryRow,
  MemberReportRepository,
} from "@headless-lms/core/reporting/member";
import {
  orgUsers,
  spaceMembers,
  spaces,
  userProfiles,
  users,
} from "../schema/index.js";
import type { Logger } from "@headless-lms/core/shared/ports";
import { noopLogger } from "@headless-lms/core/shared/logger";
import { translateDbErrors } from "./pg-errors.js";
import { communityMember, holdsCommunity } from "./grant-covers.js";

function personColumns(orgId: string) {
  return {
    orgUserId: orgUsers.id,
    userId: orgUsers.userId,
    role: orgUsers.role,
    displayName: sql<
      string | null
    >`coalesce(nullif(trim(${userProfiles.displayName}), ''), nullif(trim(concat_ws(' ', ${users.firstName}, ${users.lastName})), ''))`,
    headline: userProfiles.headline,
    bio: userProfiles.bio,
    imageAssetId: sql<
      string | null
    >`case when ${userProfiles.imageAssetOrgId} = ${orgId} then ${userProfiles.imageAssetId} end`,
  };
}

export class DrizzleMemberRepository implements MemberReportRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly logger: Logger = noopLogger,
  ) {}

  async directory(orgId: string, communityId: string): Promise<DirectoryRow[]> {
    const rows = await this.db
      .select(personColumns(orgId))
      .from(orgUsers)
      .leftJoin(userProfiles, eq(userProfiles.userId, orgUsers.userId))
      .leftJoin(users, eq(users.id, orgUsers.userId))
      .where(
        and(
          eq(orgUsers.orgId, orgId),
          communityMember(
            sql`${orgUsers.orgId}`,
            sql`${orgUsers.id}`,
            sql`${orgUsers.role}`,
            sql`${communityId}`,
          ),
        ),
      )
      .orderBy(asc(userProfiles.displayName), asc(orgUsers.id));
    return rows;
  }

  async people(orgId: string, orgUserIds: string[]): Promise<DirectoryRow[]> {
    if (orgUserIds.length === 0) {
      return [];
    }
    return this.db
      .select(personColumns(orgId))
      .from(orgUsers)
      .leftJoin(userProfiles, eq(userProfiles.userId, orgUsers.userId))
      .leftJoin(users, eq(users.id, orgUsers.userId))
      .where(and(eq(orgUsers.orgId, orgId), inArray(orgUsers.id, orgUserIds)));
  }

  async spaceMemberCounts(orgId: string, communityId: string): Promise<Record<string, number>> {
    const holders = sql<number>`(
      select cast(count(*) as int) from ${orgUsers}
      where ${orgUsers.orgId} = ${spaces.orgId}
        and ${holdsCommunity(sql`${orgUsers.orgId}`, sql`${orgUsers.id}`, sql`${spaces.communityId}`)}
    )`;
    const seated = sql<number>`(
      select cast(count(*) as int) from ${spaceMembers}
      where ${spaceMembers.orgId} = ${spaces.orgId}
        and ${spaceMembers.spaceId} = ${spaces.id}
        and ${spaceMembers.status} = 'active'
        and ${holdsCommunity(sql`${spaceMembers.orgId}`, sql`${spaceMembers.orgUserId}`, sql`${spaceMembers.communityId}`)}
    )`;
    const rows = await this.db
      .select({
        spaceId: spaces.id,
        count: sql<number>`case when ${spaces.accessRule} = 'all_members' then ${holders} else ${seated} end`,
      })
      .from(spaces)
      .where(and(eq(spaces.orgId, orgId), eq(spaces.communityId, communityId)));
    return Object.fromEntries(rows.map((row) => [row.spaceId, Number(row.count)]));
  }
}
translateDbErrors(DrizzleMemberRepository);
