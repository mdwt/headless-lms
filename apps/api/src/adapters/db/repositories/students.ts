// students — Drizzle repository (implements the core outbound port).
// A read-model over identity + entitlements: a "student" in an org is a domain
// student with >=1 enrollment in that org. Rows are aggregated per student and
// scoped by `entitlements.orgId`. Identity (name/email/joinedAt) comes from the
// `students` table; the avatar comes from the better-auth `user` table.
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { StudentsReportRepository } from "../../../reporting/students/index.js";
import type { Page, Student, StudentsQuery } from "../../../reporting/students/index.js";
import { students, entitlements } from "../schema/index.js";
import { user } from "../../auth/schema.js";

const entitlementCountExpr = sql<number>`count(${entitlements.id})`;
const avgProgressExpr = sql<number>`coalesce(round(avg(${entitlements.progressPercent})), 0)`;

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
    const filters: SQL[] = [eq(entitlements.orgId, orgId)];
    const q = query.search?.trim();
    if (q) {
      const like = `%${q}%`;
      filters.push(or(ilike(students.displayName, like), ilike(students.email, like))!);
    }
    const where = and(...filters);

    const [totals] = await this.db
      .select({ total: sql<number>`count(distinct ${students.id})` })
      .from(entitlements)
      .innerJoin(students, eq(students.id, entitlements.studentId))
      .where(where);

    const rows = await this.db
      .select({
        id: students.id,
        name: students.displayName,
        email: students.email,
        image: user.image,
        createdAt: students.createdAt,
        enrollmentCount: entitlementCountExpr,
        avgProgress: avgProgressExpr,
      })
      .from(entitlements)
      .innerJoin(students, eq(students.id, entitlements.studentId))
      .leftJoin(user, eq(user.id, students.authUserId))
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
        name: students.displayName,
        email: students.email,
        image: user.image,
        createdAt: students.createdAt,
        enrollmentCount: entitlementCountExpr,
        avgProgress: avgProgressExpr,
      })
      .from(entitlements)
      .innerJoin(students, eq(students.id, entitlements.studentId))
      .leftJoin(user, eq(user.id, students.authUserId))
      .where(and(eq(entitlements.orgId, orgId), eq(students.id, id)))
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
        return [dir(entitlementCountExpr)];
      case "avgProgress":
        return [dir(avgProgressExpr)];
      case "joinedAt":
        return [dir(students.createdAt)];
      case "name":
      default:
        return [dir(students.displayName)];
    }
  }
}
