// students — Drizzle repository (implements the core outbound port).
// A read-model over org users + entitlements: a "student" row in the report is
// any org_users row with role 'student', with or without entitlements. Rooted at
// `org_users` and scoped by its org, with entitlements LEFT JOINed in for the
// aggregated count. Name/email come from the identity `users` row (INNER, since
// user_id is NOT NULL); the avatar comes from the better-auth `user` table,
// LEFT JOINed via that same identity row.
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type {
  Page,
  Student,
  StudentAnalytics,
  StudentCourseProgress,
  StudentsQuery,
  StudentsReportRepository,
} from "@headless-lms/core/reporting/students";
import { orgUsers, users, entitlements } from "../schema/index.js";
import { STUDENT_ROLE } from "@headless-lms/core/organizations";
import { user } from "../schema/better-auth.js";
import type { OrgUserStatus } from "@headless-lms/core/types";
import type { Logger } from "@headless-lms/core/shared/ports";
import { noopLogger } from "@headless-lms/core/shared/logger";
import { orgUserProfileColumns } from "./org-user-profile.js";
import { translateDbErrors } from "./pg-errors.js";

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

export class DrizzleStudentsRepository implements StudentsReportRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly logger: Logger = noopLogger,
  ) {}

  async list(orgId: string, query: StudentsQuery): Promise<Page<Student>> {
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

  async findById(orgId: string, id: string): Promise<Student | null> {
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
  // computed over published activities the same way reporting/courses does.
  async analytics(orgId: string, id: string): Promise<StudentAnalytics | null> {
    const [exists] = await this.db
      .select({ id: orgUsers.id })
      .from(orgUsers)
      .where(and(eq(orgUsers.orgId, orgId), eq(orgUsers.id, id), eq(orgUsers.role, STUDENT_ROLE)));
    if (!exists) {
      return null;
    }

    const result = await this.db.execute(sql`
      with cohort_courses as (
        select c.id, c.title
        from entitlements e
        join courses c on c.org_id = e.org_id and c.id = e.content_id
        where e.org_id = ${orgId}
          and e.org_user_id = ${id}
          and e.status = 'active'
          and (e.expires_at is null or e.expires_at >= now())
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
}
translateDbErrors(DrizzleStudentsRepository);
