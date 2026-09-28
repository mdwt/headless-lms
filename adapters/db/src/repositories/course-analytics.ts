// reporting/courses — Drizzle repository (implements the core outbound port).
// Per-course engagement figures. The cohort is every org user holding an
// effective-active entitlement to the course (status='active' and not expired);
// completions by revoked/expired students are deliberately excluded so the
// numbers describe the current roster. An activity counts toward the
// denominator when its settings blob does not say published=false (missing ⇒
// published), mirroring reporting/learn.
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type {
  CourseAnalytics,
  CourseActivityEngagement,
  CourseEnrollmentPoint,
  CoursesReportRepository,
} from "@headless-lms/core/reporting/courses";
import { courses, entitlements } from "../schema/index.js";
import type { Logger } from "@headless-lms/core/shared/ports";
import { noopLogger } from "@headless-lms/core/shared/logger";
import { translateDbErrors } from "./pg-errors.js";

export class DrizzleCourseAnalyticsRepository implements CoursesReportRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly logger: Logger = noopLogger,
  ) {}

  private async courseExists(orgId: string, courseId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: courses.id })
      .from(courses)
      .where(and(eq(courses.orgId, orgId), eq(courses.id, courseId)));
    return row !== undefined;
  }

  async analytics(orgId: string, courseId: string): Promise<CourseAnalytics | null> {
    if (!(await this.courseExists(orgId, courseId))) {
      return null;
    }

    const cohort = sql`
      select org_user_id from entitlements
      where org_id = ${orgId}
        and content_id = ${courseId}
        and status = 'active'
        and (expires_at is null or expires_at >= now())
    `;
    const publishedActivities = sql`
      select a.id, a.settings, a.seq, a.module_id
      from activities a
      where a.org_id = ${orgId}
        and a.course_id = ${courseId}
        and coalesce((a.settings ->> 'published')::boolean, true)
    `;

    const summaryResult = await this.db.execute(sql`
      with cohort as (${cohort}),
      acts as (${publishedActivities}),
      per_learner as (
        select c.org_user_id,
          count(pr.id) filter (where pr.completed_at is not null) as done
        from cohort c
        left join progress_records pr
          on pr.org_id = ${orgId}
          and pr.org_user_id = c.org_user_id
          and pr.target_type = 'activity'
          and pr.target_id in (select id from acts)
        group by c.org_user_id
      )
      select
        (select count(*) from cohort)::int as enrolled,
        (
          select count(distinct pr.org_user_id) from progress_records pr
          where pr.org_id = ${orgId}
            and pr.org_user_id in (select org_user_id from cohort)
            and (
              (pr.target_type = 'activity' and pr.target_id in (select id from acts))
              or (pr.target_type = 'course' and pr.target_id = ${courseId})
            )
        )::int as started,
        (
          select count(*) from progress_records pr
          where pr.org_id = ${orgId}
            and pr.org_user_id in (select org_user_id from cohort)
            and pr.target_type = 'course'
            and pr.target_id = ${courseId}
            and pr.completed_at is not null
        )::int as completed,
        coalesce((
          select round(avg(least(done::numeric / nullif((select count(*) from acts), 0), 1) * 100))
          from per_learner
        ), 0)::int as avg_progress
    `);
    const summary = summaryResult.rows[0] as {
      enrolled: number;
      started: number;
      completed: number;
      avg_progress: number;
    };

    const funnelResult = await this.db.execute(sql`
      with cohort as (${cohort})
      select
        a.id,
        coalesce(a.settings ->> 'title', '') as title,
        m.id as module_id,
        m.title as module_title,
        count(pr.id)::int as started,
        count(pr.id) filter (where pr.completed_at is not null)::int as completed
      from activities a
      join modules m on m.org_id = a.org_id and m.id = a.module_id
      left join progress_records pr
        on pr.org_id = ${orgId}
        and pr.target_type = 'activity'
        and pr.target_id = a.id
        and pr.org_user_id in (select org_user_id from cohort)
      where a.org_id = ${orgId}
        and a.course_id = ${courseId}
        and coalesce((a.settings ->> 'published')::boolean, true)
      group by a.id, a.settings, m.id, m.title, m.seq, a.seq
      order by m.seq, a.seq
    `);
    const activities: CourseActivityEngagement[] = (
      funnelResult.rows as {
        id: string;
        title: string;
        module_id: string;
        module_title: string;
        started: number;
        completed: number;
      }[]
    ).map((r) => ({
      activityId: r.id,
      title: r.title,
      moduleId: r.module_id,
      moduleTitle: r.module_title,
      started: Number(r.started),
      completed: Number(r.completed),
    }));

    return {
      enrolled: Number(summary?.enrolled ?? 0),
      started: Number(summary?.started ?? 0),
      completed: Number(summary?.completed ?? 0),
      avgProgress: Number(summary?.avg_progress ?? 0),
      activities,
    };
  }

  // Grants per day for this course over the trailing window, zero-filled so the
  // series has one point per calendar day (UTC) even when nothing was granted.
  async enrollments(
    orgId: string,
    courseId: string,
    days: number,
  ): Promise<CourseEnrollmentPoint[] | null> {
    if (!(await this.courseExists(orgId, courseId))) {
      return null;
    }
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
        and ${entitlements.contentId} = ${courseId}
        and (${entitlements.grantedAt} at time zone 'utc')::date = d.day::date
      group by d.day
      order by d.day
    `);
    const rows = result.rows as { date: string; count: number }[];
    return rows.map((r) => ({ date: r.date, count: Number(r.count) }));
  }
}
translateDbErrors(DrizzleCourseAnalyticsRepository);
