// students — Drizzle repository (implements the core outbound port).
// A read-model over identity + enrollments: a "student" in an org is a domain
// student with >=1 enrollment in that org. Rows are aggregated per student and
// scoped by `enrollments.orgId`. Identity (name/email/joinedAt) comes from the
// `students` table; the avatar comes from the better-auth `user` table.
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { StudentsReportRepository } from "../../../reporting/students/index.js";
import type { Page, Student, StudentsQuery } from "../../../reporting/students/index.js";
import { students, enrollments } from "../schema/index.js";
import { user } from "../../auth/schema.js";

const nameExpr = sql<string>`${students.firstName} || ' ' || ${students.lastName}`;
const enrollmentCountExpr = sql<number>`count(${enrollments.id})`;
// Completion now lives in the progress domain; the students report no longer
// derives a percentage from enrollments. Placeholder until wired to progress.
const avgProgressExpr = sql<number>`0`;

interface StudentRow {
  id: string;
  name: string;
  email: string;
  image: string | null;
  createdAt: Date;
  enrollmentCount: number;
  avgProgress: number;
}

function toStudent(row: StudentRow): Student {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    image: row.image ?? null,
    enrollmentCount: Number(row.enrollmentCount),
    avgProgress: Number(row.avgProgress),
    joinedAt: row.createdAt.toISOString(),
    lastActiveAt: null,
  };
}

export class DrizzleStudentsRepository implements StudentsReportRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async list(orgId: string, query: StudentsQuery): Promise<Page<Student>> {
    const filters: SQL[] = [eq(enrollments.orgId, orgId)];
    const q = query.search?.trim();
    if (q) {
      const like = `%${q}%`;
      filters.push(
        or(
          ilike(students.firstName, like),
          ilike(students.lastName, like),
          ilike(students.email, like),
        )!,
      );
    }
    const where = and(...filters);

    const [totals] = await this.db
      .select({ total: sql<number>`count(distinct ${students.id})` })
      .from(enrollments)
      .innerJoin(
        students,
        and(eq(students.orgId, enrollments.orgId), eq(students.id, enrollments.studentId)),
      )
      .where(where);

    const rows = await this.db
      .select({
        id: students.id,
        name: nameExpr,
        email: students.email,
        image: user.image,
        createdAt: students.createdAt,
        enrollmentCount: enrollmentCountExpr,
        avgProgress: avgProgressExpr,
      })
      .from(enrollments)
      .innerJoin(
        students,
        and(eq(students.orgId, enrollments.orgId), eq(students.id, enrollments.studentId)),
      )
      .leftJoin(user, eq(user.id, students.externalId))
      .where(where)
      .groupBy(students.id, user.image)
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
        id: students.id,
        name: nameExpr,
        email: students.email,
        image: user.image,
        createdAt: students.createdAt,
        enrollmentCount: enrollmentCountExpr,
        avgProgress: avgProgressExpr,
      })
      .from(enrollments)
      .innerJoin(
        students,
        and(eq(students.orgId, enrollments.orgId), eq(students.id, enrollments.studentId)),
      )
      .leftJoin(user, eq(user.id, students.externalId))
      .where(and(eq(enrollments.orgId, orgId), eq(students.id, id)))
      .groupBy(students.id, user.image)
      .limit(1);
    return row ? toStudent(row) : null;
  }

  private resolveOrder(sort?: string): SQL[] {
    const descending = sort?.startsWith("-") ?? false;
    const field = sort ? (descending ? sort.slice(1) : sort) : "name";
    const dir = descending ? desc : asc;
    switch (field) {
      case "email":
        return [dir(students.email)];
      case "enrollmentCount":
        return [dir(enrollmentCountExpr)];
      case "avgProgress":
        return [dir(avgProgressExpr)];
      case "joinedAt":
        return [dir(students.createdAt)];
      case "name":
      default:
        return [dir(nameExpr)];
    }
  }
}
