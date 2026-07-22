// students — Drizzle repository (implements the core outbound port).
// A read-model over identity + entitlements: a "student" row in the report is
// any domain student in the org, with or without entitlements (manual creation
// adds zero-entitlement students). Rooted at `students` and scoped by
// `students.orgId`, with entitlements LEFT JOINed in for the aggregated count.
// Identity (name/email/joinedAt) comes from the `students` table; the avatar
// comes from the better-auth `user` table (LEFT JOINed — `external_id` may be
// null for students with no account yet, so no avatar in that case).
import { and, asc, desc, eq, ilike, isNotNull, or, sql, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { StudentsReportRepository } from '../../../reporting/students/index.js';
import type { Page, Student, StudentsQuery } from '../../../reporting/students/index.js';
import { students, entitlements } from '../schema/index.js';
import { user } from '../../auth/schema.js';
import type { Logger } from '../../../core/shared/ports.js';
import { noopLogger } from '../../../core/shared/logger.js';

const nameExpr = sql<string>`${students.firstName} || ' ' || ${students.lastName}`;
const entitlementCountExpr = sql<number>`count(${entitlements.id})`;
// Completion now lives in the progress domain; the students report no longer
// derives a percentage from entitlements. Placeholder until wired to progress.
const avgProgressExpr = sql<number>`0`;
const hasAccountExpr = sql<boolean>`${isNotNull(students.externalId)}`;

interface StudentRow {
  id: string;
  name: string;
  email: string;
  image: string | null;
  createdAt: Date;
  entitlementCount: number;
  avgProgress: number;
  hasAccount: boolean;
}

function toStudent(row: StudentRow): Student {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    image: row.image ?? null,
    entitlementCount: Number(row.entitlementCount),
    avgProgress: Number(row.avgProgress),
    joinedAt: row.createdAt.toISOString(),
    lastActiveAt: null,
    hasAccount: row.hasAccount,
  };
}

export class DrizzleStudentsRepository implements StudentsReportRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly logger: Logger = noopLogger,
  ) {}

  async list(orgId: string, query: StudentsQuery): Promise<Page<Student>> {
    const filters: SQL[] = [eq(students.orgId, orgId)];
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
      .select({ total: sql<number>`count(*)` })
      .from(students)
      .where(where);

    const rows = await this.db
      .select({
        id: students.id,
        name: nameExpr,
        email: students.email,
        image: user.image,
        createdAt: students.createdAt,
        entitlementCount: entitlementCountExpr,
        avgProgress: avgProgressExpr,
        hasAccount: hasAccountExpr,
      })
      .from(students)
      .leftJoin(
        entitlements,
        and(eq(entitlements.orgId, students.orgId), eq(entitlements.studentId, students.id)),
      )
      .leftJoin(user, and(isNotNull(students.externalId), eq(user.id, students.externalId)))
      .where(where)
      // Group by the full composite PK (orgId, id): grouping by id alone gives
      // Postgres no functional dependency for the other students columns.
      .groupBy(students.orgId, students.id, user.image)
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
        entitlementCount: entitlementCountExpr,
        avgProgress: avgProgressExpr,
        hasAccount: hasAccountExpr,
      })
      .from(students)
      .leftJoin(
        entitlements,
        and(eq(entitlements.orgId, students.orgId), eq(entitlements.studentId, students.id)),
      )
      .leftJoin(user, and(isNotNull(students.externalId), eq(user.id, students.externalId)))
      .where(and(eq(students.orgId, orgId), eq(students.id, id)))
      .groupBy(students.orgId, students.id, user.image)
      .limit(1);
    return row ? toStudent(row) : null;
  }

  private resolveOrder(sort?: string): SQL[] {
    const descending = sort?.startsWith('-') ?? false;
    const field = sort ? (descending ? sort.slice(1) : sort) : 'name';
    const dir = descending ? desc : asc;
    switch (field) {
      case 'email':
        return [dir(students.email)];
      case 'entitlementCount':
        return [dir(entitlementCountExpr)];
      case 'avgProgress':
        return [dir(avgProgressExpr)];
      case 'joinedAt':
        return [dir(students.createdAt)];
      case 'name':
      default:
        return [dir(nameExpr)];
    }
  }
}
