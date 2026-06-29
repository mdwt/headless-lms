// entitlements — Drizzle repository (implements the core outbound port). Org-scoped.
// Rows are denormalized at read time by joining students (display name + email)
// and courses (title). The "expired" status is DERIVED in SQL from expires_at so
// no cron is needed to flip rows; the derived value is used both in the returned
// payload and for status filtering/sorting.
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { EntitlementsRepository } from "../../../core/entitlements/ports.js";
import type {
  Entitlement,
  EntitlementSource,
  EntitlementStatus,
  EntitlementsQuery,
  GrantEntitlementInput,
  Page,
} from "../../../core/entitlements/model.js";
import { entitlements } from "../schema/entitlements.js";
import { students } from "../schema/identity.js";
import { courses } from "../schema/courses.js";

// CASE expression: revoked beats everything; otherwise an elapsed expiry reads as
// expired; otherwise active.
const derivedStatus = sql<EntitlementStatus>`case
  when ${entitlements.status} = 'revoked' then 'revoked'
  when ${entitlements.expiresAt} is not null and ${entitlements.expiresAt} < now() then 'expired'
  else 'active'
end`;

// Sortable columns by the client-facing field name. `status` sorts on the derived
// expression so the ordering matches the displayed value.
const sortColumns = {
  studentName: students.displayName,
  studentEmail: students.email,
  courseTitle: courses.title,
  status: derivedStatus,
  progressPercent: entitlements.progressPercent,
  grantedAt: entitlements.grantedAt,
  expiresAt: entitlements.expiresAt,
  source: entitlements.source,
} as const;

const selection = {
  id: entitlements.id,
  studentId: entitlements.studentId,
  studentName: students.displayName,
  studentEmail: students.email,
  courseId: entitlements.courseId,
  courseTitle: courses.title,
  status: derivedStatus,
  progressPercent: entitlements.progressPercent,
  grantedAt: entitlements.grantedAt,
  expiresAt: entitlements.expiresAt,
  source: entitlements.source,
} as const;

interface Row {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  courseId: string;
  courseTitle: string;
  status: EntitlementStatus;
  progressPercent: number;
  grantedAt: Date;
  expiresAt: Date | null;
  source: string;
}

function toEntitlement(row: Row): Entitlement {
  return {
    id: row.id,
    studentId: row.studentId,
    studentName: row.studentName,
    studentEmail: row.studentEmail,
    courseId: row.courseId,
    courseTitle: row.courseTitle,
    status: row.status,
    progressPercent: row.progressPercent,
    grantedAt: row.grantedAt.toISOString(),
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    source: row.source as EntitlementSource,
  };
}

export class DrizzleEntitlementsRepository implements EntitlementsRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async list(orgId: string, query: EntitlementsQuery): Promise<Page<Entitlement>> {
    const conditions: SQL[] = [eq(entitlements.orgId, orgId)];
    if (query.status) conditions.push(sql`${derivedStatus} = ${query.status}`);
    if (query.source) conditions.push(eq(entitlements.source, query.source));
    if (query.studentId) conditions.push(eq(entitlements.studentId, query.studentId));
    if (query.courseId) conditions.push(eq(entitlements.courseId, query.courseId));
    if (query.search) {
      const pattern = `%${query.search}%`;
      conditions.push(
        or(
          ilike(students.displayName, pattern),
          ilike(students.email, pattern),
          ilike(courses.title, pattern),
        ) as SQL,
      );
    }
    const where = and(...conditions);

    // Sort: `-field` for descending; default to most-recently granted first.
    let orderBy: SQL;
    if (query.sort) {
      const isDesc = query.sort.startsWith("-");
      const field = (isDesc ? query.sort.slice(1) : query.sort) as keyof typeof sortColumns;
      const col = sortColumns[field] ?? entitlements.grantedAt;
      orderBy = isDesc ? desc(col) : asc(col);
    } else {
      orderBy = desc(entitlements.grantedAt);
    }

    const offset = (query.page - 1) * query.pageSize;

    const rows = await this.db
      .select(selection)
      .from(entitlements)
      .innerJoin(students, eq(students.id, entitlements.studentId))
      .innerJoin(
        courses,
        and(eq(courses.orgId, entitlements.orgId), eq(courses.id, entitlements.courseId)),
      )
      .where(where)
      .orderBy(orderBy)
      .limit(query.pageSize)
      .offset(offset);

    const [{ total } = { total: 0 }] = await this.db
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(entitlements)
      .innerJoin(students, eq(students.id, entitlements.studentId))
      .innerJoin(
        courses,
        and(eq(courses.orgId, entitlements.orgId), eq(courses.id, entitlements.courseId)),
      )
      .where(where);

    return {
      rows: rows.map(toEntitlement),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async insert(orgId: string, input: GrantEntitlementInput): Promise<Entitlement> {
    const [row] = await this.db
      .insert(entitlements)
      .values({
        orgId,
        studentId: input.studentId,
        courseId: input.courseId,
        status: "active",
        source: "manual",
        progressPercent: 0,
        grantedAt: new Date(),
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      })
      .onConflictDoUpdate({
        target: [entitlements.orgId, entitlements.studentId, entitlements.courseId],
        set: {
          status: "active",
          source: "manual",
          progressPercent: 0,
          grantedAt: new Date(),
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        },
      })
      .returning({ id: entitlements.id });
    if (!row) throw new Error("failed to insert entitlement");
    const entitlement = await this.findById(orgId, row.id);
    if (!entitlement) throw new Error("failed to read inserted entitlement");
    return entitlement;
  }

  async setStatus(
    orgId: string,
    id: string,
    status: "active" | "revoked",
  ): Promise<Entitlement | null> {
    const [row] = await this.db
      .update(entitlements)
      .set({ status })
      .where(and(eq(entitlements.orgId, orgId), eq(entitlements.id, id)))
      .returning({ id: entitlements.id });
    if (!row) return null;
    return this.findById(orgId, row.id);
  }

  private async findById(orgId: string, id: string): Promise<Entitlement | null> {
    const [row] = await this.db
      .select(selection)
      .from(entitlements)
      .innerJoin(students, eq(students.id, entitlements.studentId))
      .innerJoin(
        courses,
        and(eq(courses.orgId, entitlements.orgId), eq(courses.id, entitlements.courseId)),
      )
      .where(and(eq(entitlements.orgId, orgId), eq(entitlements.id, id)))
      .limit(1);
    return row ? toEntitlement(row) : null;
  }
}
