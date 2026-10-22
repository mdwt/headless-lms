// member — Drizzle read repo (implements the reporting/member outbound port).
// Active means stored status active and expires_at still ahead. A course or
// download is reachable directly or through a bundle, and only when published.
import { and, asc, eq, gt, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { union } from "drizzle-orm/pg-core";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type {
  ContentRef,
  DirectoryEntry,
  MemberReportRepository,
} from "@headless-lms/core/reporting/member";
import {
  bundleItems,
  courses,
  downloadAssets,
  downloads,
  entitlements,
  orgUsers,
  spaceMembers,
  userProfiles,
} from "../schema/index.js";
import { STAFF_ROLES } from "@headless-lms/core/organizations";
import type { Logger } from "@headless-lms/core/shared/ports";
import { noopLogger } from "@headless-lms/core/shared/logger";
import { translateDbErrors } from "./pg-errors.js";

function activeGrantCovers(orgId: SQL, orgUserId: string, contentId: SQL): SQL {
  return sql`exists (
    select 1 from entitlements e
    left join bundle_items bi on bi.org_id = e.org_id and bi.bundle_id = e.bundle_id
    where e.org_id = ${orgId}
      and e.org_user_id = ${orgUserId}
      and e.status = 'active'
      and (e.expires_at is null or e.expires_at > now())
      and (e.content_id = ${contentId} or bi.content_id = ${contentId})
  )`;
}

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
      or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, sql`now()`))!,
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

  async downloadHasAsset(orgId: string, downloadId: string, assetId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: downloadAssets.id })
      .from(downloadAssets)
      .where(
        and(
          eq(downloadAssets.orgId, orgId),
          eq(downloadAssets.downloadId, downloadId),
          eq(downloadAssets.assetId, assetId),
        ),
      )
      .limit(1);
    return row !== undefined;
  }

  async directory(orgId: string, communityId: string): Promise<DirectoryEntry[]> {
    const opens = sql`(
      (
        ${entitlements.contentId} = ${communityId}
        and exists (
          select 1 from content_items ci
          where ci.org_id = ${entitlements.orgId}
            and ci.id = ${entitlements.contentId}
            and ci.type = 'community'
        )
      )
      or exists (
        select 1 from bundle_items bi
        join content_items ci on ci.org_id = bi.org_id and ci.id = bi.content_id
        where bi.org_id = ${entitlements.orgId}
          and bi.bundle_id = ${entitlements.bundleId}
          and bi.content_id = ${communityId}
          and ci.type = 'community'
      )
    )`;
    const rows = await this.db
      .select({
        orgUserId: orgUsers.id,
        userId: orgUsers.userId,
        role: orgUsers.role,
        displayName: userProfiles.displayName,
        headline: userProfiles.headline,
        bio: userProfiles.bio,
        imageAssetId: userProfiles.imageAssetId,
      })
      .from(orgUsers)
      .leftJoin(userProfiles, eq(userProfiles.userId, orgUsers.userId))
      .where(
        and(
          eq(orgUsers.orgId, orgId),
          or(
            inArray(orgUsers.role, [...STAFF_ROLES]),
            sql`exists (
              select 1 from entitlements
              where entitlements.org_id = ${orgUsers.orgId}
                and entitlements.org_user_id = ${orgUsers.id}
                and entitlements.status = 'active'
                and (entitlements.expires_at is null or entitlements.expires_at > now())
                and ${opens}
            )`,
          ),
        ),
      )
      .orderBy(asc(userProfiles.displayName), asc(orgUsers.id));
    return rows;
  }

  async spaceMemberCounts(orgId: string, communityId: string): Promise<Record<string, number>> {
    const rows = await this.db
      .select({
        spaceId: spaceMembers.spaceId,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(spaceMembers)
      .where(
        and(
          eq(spaceMembers.orgId, orgId),
          eq(spaceMembers.communityId, communityId),
          eq(spaceMembers.status, "active"),
        ),
      )
      .groupBy(spaceMembers.spaceId);
    return Object.fromEntries(rows.map((row) => [row.spaceId, Number(row.count)]));
  }

  async assetVisible(orgId: string, orgUserId: string, assetId: string): Promise<boolean> {
    const org = sql`${orgId}`;
    const [row] = await this.db
      .select({ id: orgUsers.id })
      .from(orgUsers)
      .where(
        and(
          eq(orgUsers.orgId, orgId),
          eq(orgUsers.id, orgUserId),
          or(
            inArray(orgUsers.role, [...STAFF_ROLES]),
            sql`exists (
              select 1 from user_profiles p
              where p.user_id = ${orgUsers.userId}
                and p.image_asset_org_id = ${orgId}
                and p.image_asset_id = ${assetId}
            )`,
            sql`exists (
              select 1 from message_attachments ma
              join messages m on m.org_id = ma.org_id and m.id = ma.message_id
              join chat_users cu on cu.org_id = m.org_id and cu.chat_id = m.chat_id
                and cu.org_user_id = ${orgUserId} and cu.left_at is null
              where ma.org_id = ${orgId} and ma.asset_id = ${assetId}
            )`,
            sql`exists (
              select 1 from posts p
              join spaces s on s.org_id = p.org_id and s.id = p.space_id
              where p.org_id = ${orgId} and p.cover_asset_id = ${assetId}
                and (
                  p.org_user_id = ${orgUserId}
                  or (
                    p.status = 'published'
                    and (
                      ${orgUsers.role} = 'moderator'
                      or s.access_rule = 'all_members'
                      or exists (
                        select 1 from space_members sm
                        where sm.org_id = p.org_id and sm.space_id = p.space_id
                          and sm.org_user_id = ${orgUserId} and sm.status = 'active'
                      )
                    )
                    and ${activeGrantCovers(sql`p.org_id`, orgUserId, sql`p.community_id`)}
                  )
                )
            )`,
            sql`exists (
              select 1 from communities c
              where c.org_id = ${org}
                and c.thumbnail_asset_id = ${assetId}
                and ${activeGrantCovers(sql`c.org_id`, orgUserId, sql`c.id`)}
            )`,
            sql`exists (
              select 1 from courses c
              where c.org_id = ${org} and c.status = 'published'
                and (
                  c.thumbnail_asset_id = ${assetId}
                  or exists (
                    select 1 from activity_assets aa
                    join activities a on a.org_id = aa.org_id and a.id = aa.activity_id
                      and a.course_id = c.id
                    where aa.org_id = c.org_id and aa.asset_id = ${assetId}
                  )
                )
                and ${activeGrantCovers(sql`c.org_id`, orgUserId, sql`c.id`)}
            )`,
            sql`exists (
              select 1 from download_assets da
              join downloads d on d.org_id = da.org_id and d.id = da.download_id
                and d.status = 'published'
              where da.org_id = ${org} and da.asset_id = ${assetId}
                and ${activeGrantCovers(sql`d.org_id`, orgUserId, sql`d.id`)}
            )`,
          ),
        ),
      )
      .limit(1);
    return row !== undefined;
  }
}
translateDbErrors(DrizzleMemberRepository);
