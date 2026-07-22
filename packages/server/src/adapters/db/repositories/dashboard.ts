// dashboard — Drizzle repository (implements the core outbound port).
// Back-office overview counts, every figure scoped to the active org. An
// enrollment is "effective-active" when status='active' and it has not expired
// (expires_at null or in the future) — expiry is derived at read time.
import { and, eq, gte, isNull, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { DashboardReportRepository } from '../../../reporting/dashboard/index.js';
import type { OverviewStats } from '../../../reporting/dashboard/index.js';
import { courses, enrollments } from '../schema/index.js';
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
      eq(enrollments.orgId, orgId),
      eq(enrollments.status, 'active'),
      or(isNull(enrollments.expiresAt), gte(enrollments.expiresAt, sql`now()`)),
    );

    const [enrollmentCounts] = await this.db
      .select({
        activeEnrollments: sql<number>`count(*)`,
        activeStudents: sql<number>`count(distinct ${enrollments.studentId})`,
        expiringSoon: sql<number>`count(*) filter (where ${enrollments.expiresAt} is not null and ${enrollments.expiresAt} < now() + interval '14 days')`,
      })
      .from(enrollments)
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
