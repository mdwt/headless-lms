// learn — Drizzle read repo (implements the reporting/learn outbound port).
// Returns the (org, course) refs a student is ACTIVELY entitled to and whose
// course is PUBLISHED. "Active" excludes revoked and expired grants (expiry is
// derived from expires_at at read time — no row flip). Org-scoped: the portal
// org bounds the read (`entitlements.org_id`), so no cross-org grants leak.
// The inner join to `courses` on the content id restricts to course grants —
// no explicit content-type filter needed.
import { and, eq, gt, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { LearnEntitlementReader, CourseRef } from '../../../reporting/learn/index.js';
import { entitlements, courses } from '../schema/index.js';
import type { Logger } from '../../../core/shared/ports.js';
import { noopLogger } from '../../../core/shared/logger.js';

export class DrizzleLearnRepository implements LearnEntitlementReader {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly logger: Logger = noopLogger,
  ) {}

  private baseFilters(orgId: string, studentId: string): SQL {
    return and(
      eq(entitlements.orgId, orgId),
      eq(entitlements.studentId, studentId),
      eq(entitlements.status, 'active'),
      or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, sql`now()`))!,
      eq(courses.status, 'published'),
    )!;
  }

  async activeRefs(orgId: string, studentId: string): Promise<CourseRef[]> {
    const rows = await this.db
      .select({ orgId: entitlements.orgId, courseId: entitlements.contentId })
      .from(entitlements)
      .innerJoin(
        courses,
        and(eq(courses.orgId, entitlements.orgId), eq(courses.id, entitlements.contentId)),
      )
      .where(this.baseFilters(orgId, studentId));
    return rows;
  }

  async activeRef(orgId: string, studentId: string, courseId: string): Promise<CourseRef | null> {
    const [row] = await this.db
      .select({ orgId: entitlements.orgId, courseId: entitlements.contentId })
      .from(entitlements)
      .innerJoin(
        courses,
        and(eq(courses.orgId, entitlements.orgId), eq(courses.id, entitlements.contentId)),
      )
      .where(and(this.baseFilters(orgId, studentId), eq(entitlements.contentId, courseId)))
      .limit(1);
    return row ?? null;
  }
}
