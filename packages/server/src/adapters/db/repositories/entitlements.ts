// entitlements — Drizzle repository (implements the core outbound port). Org-scoped.
// Rows are denormalized at read time by joining students (first/last name + email),
// content_items (type) and the concrete content tables (title) — nothing beyond the
// content id is stored on the grant. The "expired" status is DERIVED in SQL from
// expires_at so no cron is needed to flip rows; the derived value is used both in
// the returned payload and for status filtering/sorting.
import { and, asc, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import type { DbExecutor } from '../index.js';
import type { EntitlementsRepository } from '../../../core/entitlements/ports.js';
import type {
  ContentRef,
  Entitlement,
  EntitlementStatus,
  EntitlementsQuery,
  GrantEntitlementInput,
  Page,
} from '../../../core/entitlements/model.js';
import { entitlements } from '../schema/index.js';
import { students } from '../schema/identity.js';
import { contentItems, courses } from '../schema/content.js';
import type { Logger } from '../../../core/shared/ports.js';
import { noopLogger } from '../../../core/shared/logger.js';

// CASE expression: revoked beats everything; otherwise an elapsed expiry reads as
// expired; otherwise active.
const derivedStatus = sql<EntitlementStatus>`case
  when ${entitlements.status} = 'revoked' then 'revoked'
  when ${entitlements.expiresAt} is not null and ${entitlements.expiresAt} < now() then 'expired'
  else 'active'
end`;

// Display name of the granted content, whatever its type. One LEFT JOIN per
// concrete content table; exactly one hits per row (type-pinned FKs), so the
// COALESCE picks the single non-null title. Extended per new content type.
const contentTitle = sql<string>`coalesce(${courses.title})`;

// Sortable columns by the client-facing field name. `status` sorts on the derived
// expression so the ordering matches the displayed value; `contentTitle` on the
// coalesced join expression.
const sortColumns = {
  firstName: students.firstName,
  lastName: students.lastName,
  studentEmail: students.email,
  contentTitle,
  status: derivedStatus,
  grantedAt: entitlements.grantedAt,
  expiresAt: entitlements.expiresAt,
  source: entitlements.source,
} as const;

const selection = {
  id: entitlements.id,
  studentId: entitlements.studentId,
  firstName: students.firstName,
  lastName: students.lastName,
  studentEmail: students.email,
  contentId: entitlements.contentId,
  contentType: contentItems.type,
  contentTitle,
  status: derivedStatus,
  grantedAt: entitlements.grantedAt,
  expiresAt: entitlements.expiresAt,
  source: entitlements.source,
} as const;

interface Row {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  studentEmail: string;
  contentId: string;
  contentType: ContentRef['type'];
  contentTitle: string;
  status: EntitlementStatus;
  grantedAt: Date;
  expiresAt: Date | null;
  source: string;
}

function toEntitlement(row: Row): Entitlement {
  return {
    id: row.id,
    studentId: row.studentId,
    firstName: row.firstName,
    lastName: row.lastName,
    studentEmail: row.studentEmail,
    content: { id: row.contentId, type: row.contentType, title: row.contentTitle },
    status: row.status,
    grantedAt: row.grantedAt.toISOString(),
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    source: row.source,
  };
}

export class DrizzleEntitlementsRepository implements EntitlementsRepository {
  constructor(
    private readonly db: DbExecutor,
    private readonly logger: Logger = noopLogger,
  ) {}

  /** entitlements → students + content_items (type) + one LEFT JOIN per
   *  concrete content table (title). */
  private joined(where: SQL | undefined) {
    return this.db
      .select(selection)
      .from(entitlements)
      .innerJoin(
        students,
        and(eq(students.orgId, entitlements.orgId), eq(students.id, entitlements.studentId)),
      )
      .innerJoin(
        contentItems,
        and(eq(contentItems.orgId, entitlements.orgId), eq(contentItems.id, entitlements.contentId)),
      )
      .leftJoin(
        courses,
        and(eq(courses.orgId, entitlements.orgId), eq(courses.id, entitlements.contentId)),
      )
      .where(where);
  }

  async list(orgId: string, query: EntitlementsQuery): Promise<Page<Entitlement>> {
    const conditions: SQL[] = [eq(entitlements.orgId, orgId)];
    if (query.status) {
      conditions.push(sql`${derivedStatus} = ${query.status}`);
    }
    if (query.source) {
      conditions.push(eq(entitlements.source, query.source));
    }
    if (query.studentId) {
      conditions.push(eq(entitlements.studentId, query.studentId));
    }
    if (query.contentId) {
      conditions.push(eq(entitlements.contentId, query.contentId));
    }
    if (query.type) {
      conditions.push(eq(contentItems.type, query.type));
    }
    if (query.search) {
      const pattern = `%${query.search}%`;
      conditions.push(
        or(
          ilike(students.firstName, pattern),
          ilike(students.lastName, pattern),
          ilike(students.email, pattern),
          ilike(contentTitle, pattern),
        ) as SQL,
      );
    }
    const where = and(...conditions);

    // Sort: `-field` for descending; default to most-recently granted first.
    let orderBy: SQL;
    if (query.sort) {
      const isDesc = query.sort.startsWith('-');
      const field = (isDesc ? query.sort.slice(1) : query.sort) as keyof typeof sortColumns;
      const col = sortColumns[field] ?? entitlements.grantedAt;
      orderBy = isDesc ? desc(col) : asc(col);
    } else {
      orderBy = desc(entitlements.grantedAt);
    }

    const offset = (query.page - 1) * query.pageSize;

    const rows = await this.joined(where).orderBy(orderBy).limit(query.pageSize).offset(offset);

    const [{ total } = { total: 0 }] = await this.db
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(entitlements)
      .innerJoin(
        students,
        and(eq(students.orgId, entitlements.orgId), eq(students.id, entitlements.studentId)),
      )
      .innerJoin(
        contentItems,
        and(eq(contentItems.orgId, entitlements.orgId), eq(contentItems.id, entitlements.contentId)),
      )
      .leftJoin(
        courses,
        and(eq(courses.orgId, entitlements.orgId), eq(courses.id, entitlements.contentId)),
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
        contentId: input.contentId,
        status: 'active',
        source: 'manual',
        grantedAt: new Date(),
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      })
      .onConflictDoUpdate({
        target: [entitlements.orgId, entitlements.studentId, entitlements.contentId],
        set: {
          status: 'active',
          source: 'manual',
          grantedAt: new Date(),
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        },
      })
      .returning({ id: entitlements.id });
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
  ): Promise<Entitlement | null> {
    const [row] = await this.db
      .update(entitlements)
      .set({ status })
      .where(and(eq(entitlements.orgId, orgId), eq(entitlements.id, id)))
      .returning({ id: entitlements.id });
    if (!row) {
      return null;
    }
    return this.findById(orgId, row.id);
  }

  private async findById(orgId: string, id: string): Promise<Entitlement | null> {
    const rows = await this.joined(
      and(eq(entitlements.orgId, orgId), eq(entitlements.id, id)),
    ).limit(1);
    const [row] = rows;
    return row ? toEntitlement(row) : null;
  }
}
