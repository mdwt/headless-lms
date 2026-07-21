// learn — Drizzle read repo (implements the reporting/learn outbound port).
// Returns the (org, course) refs a student is ACTIVELY enrolled in and whose
// course is PUBLISHED. "Active" excludes revoked and expired grants (expiry is
// derived from expires_at at read time — no row flip). Not org-scoped: a
// student's grants may span orgs, so the enrollment row supplies the orgId.
import { and, eq, gt, isNull, or, sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { LearnEnrollmentReader, CourseRef } from "../../../reporting/learn/index.js";
import { enrollments, courses } from "../schema/index.js";

export class DrizzleLearnRepository implements LearnEnrollmentReader {
  constructor(private readonly db: NodePgDatabase) {}

  private baseFilters(studentId: string): SQL {
    return and(
      eq(enrollments.studentId, studentId),
      eq(enrollments.status, "active"),
      or(isNull(enrollments.expiresAt), gt(enrollments.expiresAt, sql`now()`))!,
      eq(courses.status, "published"),
    )!;
  }

  async activeRefs(studentId: string): Promise<CourseRef[]> {
    const rows = await this.db
      .select({ orgId: enrollments.orgId, courseId: enrollments.courseId })
      .from(enrollments)
      .innerJoin(courses, and(eq(courses.orgId, enrollments.orgId), eq(courses.id, enrollments.courseId)))
      .where(this.baseFilters(studentId));
    return rows;
  }

  async activeRef(studentId: string, courseId: string): Promise<CourseRef | null> {
    const [row] = await this.db
      .select({ orgId: enrollments.orgId, courseId: enrollments.courseId })
      .from(enrollments)
      .innerJoin(courses, and(eq(courses.orgId, enrollments.orgId), eq(courses.id, enrollments.courseId)))
      .where(and(this.baseFilters(studentId), eq(enrollments.courseId, courseId)))
      .limit(1);
    return row ?? null;
  }
}
