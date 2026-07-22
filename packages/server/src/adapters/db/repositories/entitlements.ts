// entitlements — Drizzle repository (implements the core outbound port). Org-scoped.
// Rows are denormalized at read time by joining students (first/last name + email)
// and courses (title). The "expired" status is DERIVED in SQL from expires_at so
// no cron is needed to flip rows; the derived value is used both in the returned
// payload and for status filtering/sorting.
import { and, asc, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import type { DbExecutor } from '../index.js';
import type { EntitlementsRepository } from '../../../core/entitlements/ports.js';
import type {
  Enrollment,
  EntitlementSource,
  EntitlementStatus,
  EntitlementsQuery,
  GrantEnrollmentInput,
  Page,
} from '../../../core/entitlements/model.js';
import { enrollments } from '../schema/index.js';
import { students } from '../schema/identity.js';
import { courses } from '../schema/content.js';
import type { Logger } from '../../../core/shared/ports.js';
import { noopLogger } from '../../../core/shared/logger.js';

// CASE expression: revoked beats everything; otherwise an elapsed expiry reads as
// expired; otherwise active.
const derivedStatus = sql<EntitlementStatus>`case
  when ${enrollments.status} = 'revoked' then 'revoked'
  when ${enrollments.expiresAt} is not null and ${enrollments.expiresAt} < now() then 'expired'
  else 'active'
end`;

// Sortable columns by the client-facing field name. `status` sorts on the derived
// expression so the ordering matches the displayed value.
const sortColumns = {
  firstName: students.firstName,
  lastName: students.lastName,
  studentEmail: students.email,
  courseTitle: courses.title,
  status: derivedStatus,
  grantedAt: enrollments.grantedAt,
  expiresAt: enrollments.expiresAt,
  source: enrollments.source,
} as const;

const selection = {
  id: enrollments.id,
  studentId: enrollments.studentId,
  firstName: students.firstName,
  lastName: students.lastName,
  studentEmail: students.email,
  courseId: enrollments.courseId,
  courseTitle: courses.title,
  status: derivedStatus,
  grantedAt: enrollments.grantedAt,
  expiresAt: enrollments.expiresAt,
  source: enrollments.source,
} as const;

interface Row {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  studentEmail: string;
  courseId: string;
  courseTitle: string;
  status: EntitlementStatus;
  grantedAt: Date;
  expiresAt: Date | null;
  source: string;
}

function toEntitlement(row: Row): Enrollment {
  return {
    id: row.id,
    studentId: row.studentId,
    firstName: row.firstName,
    lastName: row.lastName,
    studentEmail: row.studentEmail,
    courseId: row.courseId,
    courseTitle: row.courseTitle,
    status: row.status,
    grantedAt: row.grantedAt.toISOString(),
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    source: row.source as EntitlementSource,
  };
}

export class DrizzleEntitlementsRepository implements EntitlementsRepository {
  constructor(
    private readonly db: DbExecutor,
    private readonly logger: Logger = noopLogger,
  ) {}

  async list(orgId: string, query: EntitlementsQuery): Promise<Page<Enrollment>> {
    const conditions: SQL[] = [eq(enrollments.orgId, orgId)];
    if (query.status) {
      conditions.push(sql`${derivedStatus} = ${query.status}`);
    }
    if (query.source) {
      conditions.push(eq(enrollments.source, query.source));
    }
    if (query.studentId) {
      conditions.push(eq(enrollments.studentId, query.studentId));
    }
    if (query.courseId) {
      conditions.push(eq(enrollments.courseId, query.courseId));
    }
    if (query.search) {
      const pattern = `%${query.search}%`;
      conditions.push(
        or(
          ilike(students.firstName, pattern),
          ilike(students.lastName, pattern),
          ilike(students.email, pattern),
          ilike(courses.title, pattern),
        ) as SQL,
      );
    }
    const where = and(...conditions);

    // Sort: `-field` for descending; default to most-recently granted first.
    let orderBy: SQL;
    if (query.sort) {
      const isDesc = query.sort.startsWith('-');
      const field = (isDesc ? query.sort.slice(1) : query.sort) as keyof typeof sortColumns;
      const col = sortColumns[field] ?? enrollments.grantedAt;
      orderBy = isDesc ? desc(col) : asc(col);
    } else {
      orderBy = desc(enrollments.grantedAt);
    }

    const offset = (query.page - 1) * query.pageSize;

    const rows = await this.db
      .select(selection)
      .from(enrollments)
      .innerJoin(students, eq(students.id, enrollments.studentId))
      .innerJoin(
        courses,
        and(eq(courses.orgId, enrollments.orgId), eq(courses.id, enrollments.courseId)),
      )
      .where(where)
      .orderBy(orderBy)
      .limit(query.pageSize)
      .offset(offset);

    const [{ total } = { total: 0 }] = await this.db
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(enrollments)
      .innerJoin(students, eq(students.id, enrollments.studentId))
      .innerJoin(
        courses,
        and(eq(courses.orgId, enrollments.orgId), eq(courses.id, enrollments.courseId)),
      )
      .where(where);

    return {
      rows: rows.map(toEntitlement),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async insert(orgId: string, input: GrantEnrollmentInput): Promise<Enrollment> {
    const [row] = await this.db
      .insert(enrollments)
      .values({
        orgId,
        studentId: input.studentId,
        courseId: input.courseId,
        status: 'active',
        source: 'manual',
        grantedAt: new Date(),
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      })
      .onConflictDoUpdate({
        target: [enrollments.orgId, enrollments.studentId, enrollments.courseId],
        set: {
          status: 'active',
          source: 'manual',
          grantedAt: new Date(),
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        },
      })
      .returning({ id: enrollments.id });
    if (!row) {
      throw new Error('failed to insert entitlement');
    }
    const entitlement = await this.findById(orgId, row.id);
    if (!entitlement) {
      throw new Error('failed to read inserted entitlement');
    }
    return entitlement;
  }

  async setStatus(
    orgId: string,
    id: string,
    status: 'active' | 'revoked',
  ): Promise<Enrollment | null> {
    const [row] = await this.db
      .update(enrollments)
      .set({ status })
      .where(and(eq(enrollments.orgId, orgId), eq(enrollments.id, id)))
      .returning({ id: enrollments.id });
    if (!row) {
      return null;
    }
    return this.findById(orgId, row.id);
  }

  private async findById(orgId: string, id: string): Promise<Enrollment | null> {
    const [row] = await this.db
      .select(selection)
      .from(enrollments)
      .innerJoin(students, eq(students.id, enrollments.studentId))
      .innerJoin(
        courses,
        and(eq(courses.orgId, enrollments.orgId), eq(courses.id, enrollments.courseId)),
      )
      .where(and(eq(enrollments.orgId, orgId), eq(enrollments.id, id)))
      .limit(1);
    return row ? toEntitlement(row) : null;
  }
}
