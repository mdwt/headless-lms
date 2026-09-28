// dashboard — Drizzle repository (implements the core outbound port).
// Back-office overview counts, every figure scoped to the active org. An
// entitlement is "effective-active" when status='active' and it has not expired
// (expires_at null or in the future) — expiry is derived at read time.
import { and, eq, gte, isNull, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type {
  DashboardReportRepository,
  EnrollmentPoint,
  OverviewStats,
} from "@headless-lms/core/reporting/dashboard";
import { courses, entitlements } from "../schema/index.js";
import type { Logger } from "@headless-lms/core/shared/ports";
import { noopLogger } from "@headless-lms/core/shared/logger";
import { translateDbErrors } from "./pg-errors.js";

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
      eq(entitlements.status, "active"),
      or(isNull(entitlements.expiresAt), gte(entitlements.expiresAt, sql`now()`)),
    );

    const [entitlementCounts] = await this.db
      .select({
        activeStudents: sql<number>`count(distinct ${entitlements.orgUserId})`,
        expiringSoon: sql<number>`count(*) filter (where ${entitlements.expiresAt} is not null and ${entitlements.expiresAt} < now() + interval '14 days')`,
      })
      .from(entitlements)
      .where(effectiveActive);

    return {
      publishedCourses: Number(courseCounts?.published ?? 0),
      draftCourses: Number(courseCounts?.draft ?? 0),
      activeStudents: Number(entitlementCounts?.activeStudents ?? 0),
      expiringSoon: Number(entitlementCounts?.expiringSoon ?? 0),
    };
  }

  // Grants per day over the trailing window, zero-filled so the series has one
  // point per calendar day (UTC) even when nothing was granted.
  async enrollments(orgId: string, days: number): Promise<EnrollmentPoint[]> {
    const result = await this.db.execute(sql`
      select
        to_char(d.day, 'YYYY-MM-DD') as date,
        count(${entitlements.id})::int as count
      from generate_series(
        (now() at time zone 'utc')::date - (${days} - 1),
        (now() at time zone 'utc')::date,
        interval '1 day'
      ) as d(day)
      left join ${entitlements}
        on ${entitlements.orgId} = ${orgId}
        and (${entitlements.grantedAt} at time zone 'utc')::date = d.day::date
      group by d.day
      order by d.day
    `);
    const rows = result.rows as { date: string; count: number }[];
    return rows.map((r) => ({ date: r.date, count: Number(r.count) }));
  }
}
translateDbErrors(DrizzleDashboardRepository);
