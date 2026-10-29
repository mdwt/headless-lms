// reporting/admin — Drizzle repository.
import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { union } from "drizzle-orm/pg-core";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type {
  AdminReportRepository,
  CommunityAnalytics,
  CourseActivityEngagement,
  CourseAnalytics,
  CourseEnrollmentPoint,
  EnrollmentPoint,
  OverviewStats,
  Page,
  Student,
  StudentAnalytics,
  StudentCourseProgress,
  StudentsQuery,
} from "@headless-lms/core/reporting/admin";
import {
  commentFlags,
  comments,
  communities,
  contentAccess,
  courses,
  entitlements,
  messageFlags,
  messages,
  orgUsers,
  postFlags,
  posts,
  spaces,
  users,
} from "../schema/index.js";
import { STUDENT_ROLE } from "@headless-lms/core/organizations";
import { user } from "../schema/better-auth.js";
import type { OrgUserStatus } from "@headless-lms/core/types";
import type { Logger } from "@headless-lms/core/shared/ports";
import { noopLogger } from "@headless-lms/core/shared/logger";
import { orgUserProfileColumns } from "./org-user-profile.js";
import { translateDbErrors } from "./pg-errors.js";
import { grantExpired, grantOpens } from "./grant-covers.js";

const entitlementCountExpr = sql<number>`count(${entitlements.id})`;
// Completion now lives in the progress domain; the students report no longer
// derives a percentage from entitlements. Placeholder until wired to progress.
const avgProgressExpr = sql<number>`0`;
// Last learning activity: the newest touch on any of the student's progress
// records. A scalar subquery so it neither fans out the entitlement count nor
// widens the GROUP BY.
const lastActiveExpr = sql<Date | null>`(
  select max(pr.updated_at) from progress_records pr
  where pr.org_id = ${orgUsers.orgId} and pr.org_user_id = ${orgUsers.id}
)`;

interface StudentRow {
  id: string;
  email: string;
  image: string | null;
  firstName: string | null;
  lastName: string | null;
  status: OrgUserStatus;
  createdAt: Date;
  entitlementCount: number;
  avgProgress: number;
  lastActiveAt: Date | null;
}

function toStudent(row: StudentRow): Student {
  return {
    id: row.id,
    email: row.email,
    image: row.image ?? null,
    firstName: row.firstName,
    lastName: row.lastName,
    status: row.status,
    entitlementCount: Number(row.entitlementCount),
    avgProgress: Number(row.avgProgress),
    joinedAt: row.createdAt.toISOString(),
    lastActiveAt: row.lastActiveAt ? new Date(row.lastActiveAt).toISOString() : null,
  };
}


export class DrizzleAdminRepository implements AdminReportRepository {
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

    const [entitlementCounts] = await this.db
      .select({
        activeStudents: sql<number>`count(distinct ${contentAccess.orgUserId})`,
        expiringSoon: sql<number>`count(distinct ${contentAccess.entitlementId}) filter (where ${grantExpired(contentAccess.expiresAt, sql`now() + interval '14 days'`)})`,
      })
      .from(contentAccess)
      .where(eq(contentAccess.orgId, orgId));

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


  private async courseExists(orgId: string, courseId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: courses.id })
      .from(courses)
      .where(and(eq(courses.orgId, orgId), eq(courses.id, courseId)));
    return row !== undefined;
  }

  async courseAnalytics(orgId: string, courseId: string): Promise<CourseAnalytics | null> {
    if (!(await this.courseExists(orgId, courseId))) {
      return null;
    }

    const cohort = sql`
      select distinct org_user_id from content_access
      where org_id = ${orgId}
        and content_id = ${courseId}
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
  async courseEnrollments(
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


  async listStudents(orgId: string, query: StudentsQuery): Promise<Page<Student>> {
    // Staff share this table now — the role filter is what keeps them out of
    // the students report.
    const filters: SQL[] = [eq(orgUsers.orgId, orgId), eq(orgUsers.role, STUDENT_ROLE)];
    const q = query.search?.trim();
    if (q) {
      const like = `%${q}%`;
      filters.push(
        or(ilike(users.firstName, like), ilike(users.lastName, like), ilike(users.email, like))!,
      );
    }
    const where = and(...filters);

    const [totals] = await this.db
      .select({ total: sql<number>`count(*)` })
      .from(orgUsers)
      .innerJoin(users, eq(users.id, orgUsers.userId))
      .where(where);

    const rows = await this.db
      .select({
        ...orgUserProfileColumns,
        status: orgUsers.status,
        createdAt: orgUsers.createdAt,
        entitlementCount: entitlementCountExpr,
        avgProgress: avgProgressExpr,
        lastActiveAt: lastActiveExpr,
      })
      .from(orgUsers)
      .leftJoin(
        entitlements,
        and(eq(entitlements.orgId, orgUsers.orgId), eq(entitlements.orgUserId, orgUsers.id)),
      )
      .innerJoin(users, eq(users.id, orgUsers.userId))
      .leftJoin(user, eq(user.id, users.externalId))
      .where(where)
      // Group by the full composite PK (orgId, id): grouping by id alone gives
      // Postgres no functional dependency for the other students columns.
      .groupBy(
        orgUsers.orgId,
        orgUsers.id,
        orgUsers.status,
        users.email,
        users.firstName,
        users.lastName,
        user.image,
      )
      .orderBy(...this.resolveOrder(query.sort))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    return {
      rows: rows.map(toStudent),
      total: Number(totals?.total ?? 0),
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getStudent(orgId: string, id: string): Promise<Student | null> {
    const [row] = await this.db
      .select({
        ...orgUserProfileColumns,
        status: orgUsers.status,
        createdAt: orgUsers.createdAt,
        entitlementCount: entitlementCountExpr,
        avgProgress: avgProgressExpr,
        lastActiveAt: lastActiveExpr,
      })
      .from(orgUsers)
      .leftJoin(
        entitlements,
        and(eq(entitlements.orgId, orgUsers.orgId), eq(entitlements.orgUserId, orgUsers.id)),
      )
      .innerJoin(users, eq(users.id, orgUsers.userId))
      .leftJoin(user, eq(user.id, users.externalId))
      .where(and(eq(orgUsers.orgId, orgId), eq(orgUsers.id, id), eq(orgUsers.role, STUDENT_ROLE)))
      .groupBy(
        orgUsers.orgId,
        orgUsers.id,
        orgUsers.status,
        users.email,
        users.firstName,
        users.lastName,
        user.image,
      )
      .limit(1);
    return row ? toStudent(row) : null;
  }

  // Learner record: one row per course the student holds an effective-active
  // entitlement to (mirroring the course-analytics cohort rule), with progress
  // computed over published activities the same way the course analytics read does.
  async studentAnalytics(orgId: string, id: string): Promise<StudentAnalytics | null> {
    const [exists] = await this.db
      .select({ id: orgUsers.id })
      .from(orgUsers)
      .where(and(eq(orgUsers.orgId, orgId), eq(orgUsers.id, id), eq(orgUsers.role, STUDENT_ROLE)));
    if (!exists) {
      return null;
    }

    const result = await this.db.execute(sql`
      with cohort_courses as (
        select distinct c.id, c.title
        from content_access ca
        join courses c on c.org_id = ca.org_id and c.id = ca.content_id
        where ca.org_id = ${orgId}
          and ca.org_user_id = ${id}
      ),
      acts as (
        select a.course_id, a.id
        from activities a
        where a.org_id = ${orgId}
          and a.course_id in (select id from cohort_courses)
          and coalesce((a.settings ->> 'published')::boolean, true)
      )
      select
        cc.id as course_id,
        cc.title,
        count(a.id)::int as total_activities,
        count(pr.id) filter (where pr.completed_at is not null)::int as completed_activities,
        min(pr.started_at) as started_at,
        max(pr.updated_at) as last_activity_at,
        (
          select prc.completed_at from progress_records prc
          where prc.org_id = ${orgId}
            and prc.org_user_id = ${id}
            and prc.target_type = 'course'
            and prc.target_id = cc.id
        ) as completed_at
      from cohort_courses cc
      left join acts a on a.course_id = cc.id
      left join progress_records pr
        on pr.org_id = ${orgId}
        and pr.org_user_id = ${id}
        and pr.target_type = 'activity'
        and pr.target_id = a.id
      group by cc.id, cc.title
      order by cc.title
    `);

    const courses: StudentCourseProgress[] = (
      result.rows as {
        course_id: string;
        title: string;
        total_activities: number;
        completed_activities: number;
        started_at: Date | string | null;
        last_activity_at: Date | string | null;
        completed_at: Date | string | null;
      }[]
    ).map((r) => {
      const total = Number(r.total_activities);
      const done = Number(r.completed_activities);
      return {
        courseId: r.course_id,
        title: r.title,
        totalActivities: total,
        completedActivities: done,
        progress: total > 0 ? Math.round(Math.min(done / total, 1) * 100) : 0,
        startedAt: r.started_at ? new Date(r.started_at).toISOString() : null,
        lastActivityAt: r.last_activity_at ? new Date(r.last_activity_at).toISOString() : null,
        completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
      };
    });

    const started = courses.filter((c) => c.startedAt !== null).length;
    const completed = courses.filter((c) => c.completedAt !== null).length;
    const avgProgress =
      courses.length > 0
        ? Math.round(courses.reduce((sum, c) => sum + c.progress, 0) / courses.length)
        : 0;

    return { enrolled: courses.length, started, completed, avgProgress, courses };
  }

  private resolveOrder(sort?: string): SQL[] {
    const descending = sort?.startsWith("-") ?? false;
    const field = sort ? (descending ? sort.slice(1) : sort) : "firstName";
    const dir = descending ? desc : asc;
    switch (field) {
      case "email":
        return [dir(users.email)];
      case "entitlementCount":
        return [dir(entitlementCountExpr)];
      case "avgProgress":
        return [dir(avgProgressExpr)];
      case "joinedAt":
        return [dir(orgUsers.createdAt)];
      case "lastActiveAt":
        return [dir(lastActiveExpr)];
      case "lastName":
        return [dir(users.lastName), dir(users.firstName)];
      case "firstName":
      default:
        return [dir(users.firstName), dir(users.lastName)];
    }
  }

  async communityAnalytics(orgId: string, communityId: string): Promise<CommunityAnalytics | null> {
    const [community] = await this.db
      .select({ id: communities.id })
      .from(communities)
      .where(and(eq(communities.orgId, orgId), eq(communities.id, communityId)))
      .limit(1);
    if (!community) {
      return null;
    }

    const opens = grantOpens(entitlements, sql`${communityId}`, "community");
    const lapsed = and(
      eq(entitlements.orgId, orgId),
      eq(entitlements.status, "active"),
      grantExpired(entitlements.expiresAt),
      opens,
    );
    const recent = sql`now() - interval '30 days'`;

    const [
      [members],
      [lapsedGrants],
      authors,
      postsPerSpace,
      commentsPerPost,
      [sent],
      [postFlagRow],
      [commentFlagRow],
      [messageFlagRow],
      lapsedHolders,
    ] = await Promise.all([
      this.db
        .select({ count: sql<number>`cast(count(distinct ${contentAccess.orgUserId}) as int)` })
        .from(contentAccess)
        .where(and(eq(contentAccess.orgId, orgId), eq(contentAccess.contentId, communityId))),
      this.db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(entitlements)
        .where(lapsed),
      union(
        this.db
          .select({ id: posts.orgUserId })
          .from(posts)
          .where(
            and(
              eq(posts.orgId, orgId),
              eq(posts.communityId, communityId),
              sql`${posts.createdAt} >= ${recent}`,
            ),
          ),
        this.db
          .select({ id: comments.orgUserId })
          .from(comments)
          .where(
            and(
              eq(comments.orgId, orgId),
              eq(comments.communityId, communityId),
              sql`${comments.createdAt} >= ${recent}`,
            ),
          ),
        this.db
          .select({ id: messages.orgUserId })
          .from(messages)
          .where(
            and(
              eq(messages.orgId, orgId),
              eq(messages.communityId, communityId),
              sql`${messages.createdAt} >= ${recent}`,
            ),
          ),
      ),
      this.db
        .select({
          spaceId: spaces.id,
          count: sql<number>`cast(count(${posts.id}) as int)`,
        })
        .from(spaces)
        .leftJoin(
          posts,
          and(eq(posts.orgId, spaces.orgId), eq(posts.spaceId, spaces.id), eq(posts.status, "published")),
        )
        .where(and(eq(spaces.orgId, orgId), eq(spaces.communityId, communityId)))
        .groupBy(spaces.id),
      this.db
        .select({
          postId: posts.id,
          count: sql<number>`cast(count(${comments.id}) as int)`,
        })
        .from(posts)
        .leftJoin(
          comments,
          and(
            eq(comments.orgId, posts.orgId),
            eq(comments.postId, posts.id),
            eq(comments.status, "published"),
          ),
        )
        .where(
          and(eq(posts.orgId, orgId), eq(posts.communityId, communityId), eq(posts.status, "published")),
        )
        .groupBy(posts.id),
      this.db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(messages)
        .where(and(eq(messages.orgId, orgId), eq(messages.communityId, communityId))),
      this.db
        .select({
          raised: sql<number>`cast(count(*) as int)`,
          resolved: sql<number>`cast(count(*) filter (where ${postFlags.resolvedAt} is not null) as int)`,
        })
        .from(postFlags)
        .innerJoin(posts, and(eq(posts.orgId, postFlags.orgId), eq(posts.id, postFlags.postId)))
        .where(and(eq(postFlags.orgId, orgId), eq(posts.communityId, communityId))),
      this.db
        .select({
          raised: sql<number>`cast(count(*) as int)`,
          resolved: sql<number>`cast(count(*) filter (where ${commentFlags.resolvedAt} is not null) as int)`,
        })
        .from(commentFlags)
        .innerJoin(comments, and(eq(comments.orgId, commentFlags.orgId), eq(comments.id, commentFlags.commentId)))
        .where(and(eq(commentFlags.orgId, orgId), eq(comments.communityId, communityId))),
      this.db
        .select({
          raised: sql<number>`cast(count(*) as int)`,
          resolved: sql<number>`cast(count(*) filter (where ${messageFlags.resolvedAt} is not null) as int)`,
        })
        .from(messageFlags)
        .where(and(eq(messageFlags.orgId, orgId), eq(messageFlags.communityId, communityId))),
      this.db
        .select({ orgUserId: entitlements.orgUserId })
        .from(entitlements)
        .where(lapsed)
        .groupBy(entitlements.orgUserId),
    ]);

    const holderIds = lapsedHolders.map((row) => row.orgUserId);
    const [renewed] =
      holderIds.length === 0
        ? [{ count: 0 }]
        : await this.db
            .select({ count: sql<number>`cast(count(distinct ${contentAccess.orgUserId}) as int)` })
            .from(contentAccess)
            .where(
              and(
                eq(contentAccess.orgId, orgId),
                eq(contentAccess.contentId, communityId),
                inArray(contentAccess.orgUserId, holderIds),
              ),
            );

    const raised =
      Number(postFlagRow?.raised ?? 0) +
      Number(commentFlagRow?.raised ?? 0) +
      Number(messageFlagRow?.raised ?? 0);
    const resolved =
      Number(postFlagRow?.resolved ?? 0) +
      Number(commentFlagRow?.resolved ?? 0) +
      Number(messageFlagRow?.resolved ?? 0);

    return {
      memberCount: Number(members?.count ?? 0),
      activeMembers: authors.length,
      postsPerSpace: postsPerSpace.map((row) => ({ spaceId: row.spaceId, count: Number(row.count) })),
      commentsPerPost: commentsPerPost.map((row) => ({ postId: row.postId, count: Number(row.count) })),
      messagesSent: Number(sent?.count ?? 0),
      flagsRaised: raised,
      flagsResolved: resolved,
      grantsLapsed: Number(lapsedGrants?.count ?? 0),
      grantsRenewed: Number(renewed?.count ?? 0),
    };
  }

}
translateDbErrors(DrizzleAdminRepository);
