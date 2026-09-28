// learn — Drizzle read repo (implements the reporting/learn outbound port).
// Returns the (org, content) refs a student is ACTIVELY entitled to and whose
// course is PUBLISHED. "Active" excludes revoked and expired grants (expiry is
// derived from expires_at at read time — no row flip). Org-scoped: the portal
// org bounds the read (`entitlements.org_id`), so no cross-org grants leak.
// The inner join to `courses` on the content id restricts to course grants —
// no explicit content-type filter needed.
import { and, eq, gt, isNull, or, sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { LearnEntitlementReader, ContentRef } from "@headless-lms/core/reporting/learn";
import { entitlements, courses, downloads, downloadAssets } from "../schema/index.js";
import type { Logger } from "@headless-lms/core/shared/ports";
import { noopLogger } from "@headless-lms/core/shared/logger";
import { translateDbErrors } from "./pg-errors.js";

export class DrizzleLearnRepository implements LearnEntitlementReader {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly logger: Logger = noopLogger,
  ) {}

  private baseFilters(orgId: string, orgUserId: string): SQL {
    return and(
      eq(entitlements.orgId, orgId),
      eq(entitlements.orgUserId, orgUserId),
      eq(entitlements.status, "active"),
      or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, sql`now()`))!,
      eq(courses.status, "published"),
    )!;
  }

  async activeRefs(orgId: string, orgUserId: string): Promise<ContentRef[]> {
    const rows = await this.db
      .select({ orgId: entitlements.orgId, contentId: courses.id })
      .from(entitlements)
      .innerJoin(
        courses,
        and(eq(courses.orgId, entitlements.orgId), eq(courses.id, entitlements.contentId)),
      )
      .where(this.baseFilters(orgId, orgUserId));
    return rows;
  }

  async activeRef(orgId: string, orgUserId: string, courseId: string): Promise<ContentRef | null> {
    const [row] = await this.db
      .select({ orgId: entitlements.orgId, contentId: courses.id })
      .from(entitlements)
      .innerJoin(
        courses,
        and(eq(courses.orgId, entitlements.orgId), eq(courses.id, entitlements.contentId)),
      )
      .where(and(this.baseFilters(orgId, orgUserId), eq(entitlements.contentId, courseId)))
      .limit(1);
    return row ?? null;
  }

  private downloadFilters(orgId: string, orgUserId: string): SQL {
    return and(
      eq(entitlements.orgId, orgId),
      eq(entitlements.orgUserId, orgUserId),
      eq(entitlements.status, "active"),
      or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, sql`now()`))!,
      eq(downloads.status, "published"),
    )!;
  }

  async activeDownloadRefs(orgId: string, orgUserId: string): Promise<ContentRef[]> {
    return this.db
      .select({ orgId: entitlements.orgId, contentId: downloads.id })
      .from(entitlements)
      .innerJoin(
        downloads,
        and(eq(downloads.orgId, entitlements.orgId), eq(downloads.id, entitlements.contentId)),
      )
      .where(this.downloadFilters(orgId, orgUserId));
  }

  async activeDownloadRef(
    orgId: string,
    orgUserId: string,
    downloadId: string,
  ): Promise<ContentRef | null> {
    const [row] = await this.db
      .select({ orgId: entitlements.orgId, contentId: downloads.id })
      .from(entitlements)
      .innerJoin(
        downloads,
        and(eq(downloads.orgId, entitlements.orgId), eq(downloads.id, entitlements.contentId)),
      )
      .where(and(this.downloadFilters(orgId, orgUserId), eq(entitlements.contentId, downloadId)))
      .limit(1);
    return row ?? null;
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
}
translateDbErrors(DrizzleLearnRepository);
