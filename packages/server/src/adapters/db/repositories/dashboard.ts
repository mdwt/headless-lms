// dashboard — Drizzle repository (implements the core outbound port).
// Back-office overview counts, every figure scoped to the active org. An
// entitlement is "effective-active" when status='active' and it has not expired
// (expires_at null or in the future) — expiry is derived at read time.
import { and, eq, gte, isNull, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { DashboardReportRepository } from '../../../reporting/dashboard/index.js';
import type { OverviewStats } from '../../../reporting/dashboard/index.js';
import { courses, entitlements } from '../schema/index.js';
import type { Logger } from '../../../core/shared/ports.js';
import { noopLogger } from '../../../core/shared/logger.js';

export class DrizzleDashboardRepository implements DashboardReportRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly logger: Logger = noopLogger,
  ) {}

  async overview(orgId: string): Promise<OverviewStats> {
    const [courseCounts] = await this.db
      .select({
        published: sql<number>`count(*) filter (where ${courses.status} = 'published')`,
        draft: sql<number>`count(*) filter (where ${courses.status} = 'draft')`,
      })
      .from(courses)
      .where(eq(courses.orgId, orgId));

    const effectiveActive = and(
      eq(entitlements.orgId, orgId),
      eq(entitlements.status, 'active'),
      or(isNull(entitlements.expiresAt), gte(entitlements.expiresAt, sql`now()`)),
    );

    const [entitlementCounts] = await this.db
      .select({
        activeEntitlements: sql<number>`count(*)`,
        activeStudents: sql<number>`count(distinct ${entitlements.studentId})`,
        expiringSoon: sql<number>`count(*) filter (where ${entitlements.expiresAt} is not null and ${entitlements.expiresAt} < now() + interval '14 days')`,
      })
      .from(entitlements)
      .where(effectiveActive);

    return {
      publishedCourses: Number(courseCounts?.published ?? 0),
      draftCourses: Number(courseCounts?.draft ?? 0),
      activeStudents: Number(entitlementCounts?.activeStudents ?? 0),
      activeEntitlements: Number(entitlementCounts?.activeEntitlements ?? 0),
      expiringSoon: Number(entitlementCounts?.expiringSoon ?? 0),
    };
  }
}
