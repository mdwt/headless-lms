// member — Drizzle read repo (implements the reporting/member outbound port).
// Active means stored status active and expires_at still ahead. A course or
// download is reachable directly or through a bundle, and only when published.
import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { union } from "drizzle-orm/pg-core";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type {
  ContentRef,
  DirectoryRow,
  MemberReportRepository,
} from "@headless-lms/core/reporting/member";
import {
  bundleItems,
  courses,
  downloads,
  entitlements,
  orgUsers,
  spaceMembers,
  spaces,
  userProfiles,
  users,
} from "../schema/index.js";
import type { Logger } from "@headless-lms/core/shared/ports";
import { noopLogger } from "@headless-lms/core/shared/logger";
import { translateDbErrors } from "./pg-errors.js";
import { communityMember, grantUnexpired, holdsCommunity } from "./grant-covers.js";

export class DrizzleMemberRepository implements MemberReportRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly logger: Logger = noopLogger,
  ) {}

  private grantWhere(orgId: string, orgUserId: string): SQL {
    return and(
      eq(entitlements.orgId, orgId),
      eq(entitlements.orgUserId, orgUserId),
      eq(entitlements.status, "active"),
      grantUnexpired(entitlements.expiresAt),
    )!;
  }

  private courseRefs(orgId: string, orgUserId: string, courseId?: string) {
    const where = this.grantWhere(orgId, orgUserId);
    const direct = this.db
      .select({ orgId: entitlements.orgId, contentId: courses.id })
      .from(entitlements)
      .innerJoin(
        courses,
        and(
          eq(courses.orgId, entitlements.orgId),
          eq(courses.id, entitlements.contentId),
          eq(courses.status, "published"),
          ...(courseId ? [eq(courses.id, courseId)] : []),
        ),
      )
      .where(where);
    const bundled = this.db
      .select({ orgId: entitlements.orgId, contentId: courses.id })
      .from(entitlements)
      .innerJoin(
        bundleItems,
        and(
          eq(bundleItems.orgId, entitlements.orgId),
          eq(bundleItems.bundleId, entitlements.bundleId),
          ...(courseId ? [eq(bundleItems.contentId, courseId)] : []),
        ),
      )
      .innerJoin(
        courses,
        and(
          eq(courses.orgId, bundleItems.orgId),
          eq(courses.id, bundleItems.contentId),
          eq(courses.status, "published"),
        ),
      )
      .where(where);
    return union(direct, bundled);
  }

  private downloadRefs(orgId: string, orgUserId: string, downloadId?: string) {
    const where = this.grantWhere(orgId, orgUserId);
    const direct = this.db
      .select({ orgId: entitlements.orgId, contentId: downloads.id })
      .from(entitlements)
      .innerJoin(
        downloads,
        and(
          eq(downloads.orgId, entitlements.orgId),
          eq(downloads.id, entitlements.contentId),
          eq(downloads.status, "published"),
          ...(downloadId ? [eq(downloads.id, downloadId)] : []),
        ),
      )
      .where(where);
    const bundled = this.db
      .select({ orgId: entitlements.orgId, contentId: downloads.id })
      .from(entitlements)
      .innerJoin(
        bundleItems,
        and(
          eq(bundleItems.orgId, entitlements.orgId),
          eq(bundleItems.bundleId, entitlements.bundleId),
          ...(downloadId ? [eq(bundleItems.contentId, downloadId)] : []),
        ),
      )
      .innerJoin(
        downloads,
        and(
          eq(downloads.orgId, bundleItems.orgId),
          eq(downloads.id, bundleItems.contentId),
          eq(downloads.status, "published"),
        ),
      )
      .where(where);
    return union(direct, bundled);
  }

  async activeRefs(orgId: string, orgUserId: string): Promise<ContentRef[]> {
    return this.courseRefs(orgId, orgUserId);
  }

  async activeRef(orgId: string, orgUserId: string, courseId: string): Promise<ContentRef | null> {
    const rows = await this.courseRefs(orgId, orgUserId, courseId);
    return rows[0] ?? null;
  }

  async activeDownloadRefs(orgId: string, orgUserId: string): Promise<ContentRef[]> {
    return this.downloadRefs(orgId, orgUserId);
  }

  async activeDownloadRef(
    orgId: string,
    orgUserId: string,
    downloadId: string,
  ): Promise<ContentRef | null> {
    const rows = await this.downloadRefs(orgId, orgUserId, downloadId);
    return rows[0] ?? null;
  }

  async directory(orgId: string, communityId: string): Promise<DirectoryRow[]> {
    const rows = await this.db
      .select({
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
      })
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
