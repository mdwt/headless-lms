// dashboard — Drizzle repository (implements the core outbound port).
// Back-office overview counts, every figure scoped to the active org. An
// enrollment is "effective-active" when status='active' and it has not expired
// (expires_at null or in the future) — expiry is derived at read time.
import { and, eq, gte, isNull, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { DashboardReportRepository } from "../../../reporting/dashboard/index.js";
import type { OverviewStats } from "../../../reporting/dashboard/index.js";
import { courses, entitlements } from "../schema/index.js";

export class DrizzleDashboardRepository implements DashboardReportRepository {
  constructor(private readonly db: NodePgDatabase) {}

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
      eq(entitlements.status, "active"),
      or(isNull(entitlements.expiresAt), gte(entitlements.expiresAt, sql`now()`)),
    );

    const [enrollmentCounts] = await this.db
      .select({
        activeEnrollments: sql<number>`count(*)`,
        activeStudents: sql<number>`count(distinct ${entitlements.studentId})`,
        expiringSoon: sql<number>`count(*) filter (where ${entitlements.expiresAt} is not null and ${entitlements.expiresAt} < now() + interval '14 days')`,
      })
      .from(entitlements)
      .where(effectiveActive);

    return {
      publishedCourses: Number(courseCounts?.published ?? 0),
      draftCourses: Number(courseCounts?.draft ?? 0),
      activeStudents: Number(enrollmentCounts?.activeStudents ?? 0),
      activeEnrollments: Number(enrollmentCounts?.activeEnrollments ?? 0),
      expiringSoon: Number(enrollmentCounts?.expiringSoon ?? 0),
    };
  }
}
