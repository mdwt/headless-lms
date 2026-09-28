import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DbExecutor } from "../client.js";
import type { EntitlementsRepository } from "@headless-lms/core/entitlements";
import type {
  Entitlement,
  EntitlementStatus,
  EntitlementsQuery,
  GrantEntitlementInput,
  Logger,
  Page,
} from "@headless-lms/core/types";
import { entitlements, orgUsers, users } from "../schema/index.js";
import { bundleItems, bundles, contentItems, courses, downloads } from "../schema/content.js";
import { noopLogger } from "@headless-lms/core/shared/logger";
import { translateDbErrors } from "./pg-errors.js";

type ResolvedStatus = "active" | "expired" | "revoked";

// CASE expression: revoked beats everything; otherwise an elapsed expiry reads as
// expired; otherwise active.
const derivedStatus = sql<ResolvedStatus>`case
  when ${entitlements.status} = 'revoked' then 'revoked'
  when ${entitlements.expiresAt} is not null and ${entitlements.expiresAt} < now() then 'expired'
  else 'active'
end`;

// Display name of the grant's target, whatever it is. One LEFT JOIN per concrete
// content table plus one for bundles; exactly one hits per row (a grant targets
// either a bundle or a single content item), so the COALESCE picks the single
// non-null title. Extended per new content type.
const contentTitle = sql<string>`coalesce(${courses.title}, ${downloads.title}, ${bundles.name})`;

// Sortable columns by the client-facing field name. `status` sorts on the derived
// expression so the ordering matches the displayed value; `contentTitle` on the
// coalesced join expression.
const sortColumns = {
  firstName: users.firstName,
  lastName: users.lastName,
  email: users.email,
  contentTitle,
  status: derivedStatus,
  grantedAt: entitlements.grantedAt,
  expiresAt: entitlements.expiresAt,
  source: entitlements.source,
} as const;

const selection = {
  orgId: entitlements.orgId,
  id: entitlements.id,
  orgUserId: entitlements.orgUserId,
  bundleId: entitlements.bundleId,
  contentId: entitlements.contentId,
  status: entitlements.status,
  source: entitlements.source,
  grantedAt: entitlements.grantedAt,
  expiresAt: entitlements.expiresAt,
  createdAt: entitlements.createdAt,
  updatedAt: entitlements.updatedAt,
} as const;

interface Row {
  orgId: string;
  id: string;
  orgUserId: string;
  bundleId: string | null;
  contentId: string | null;
  status: EntitlementStatus;
  source: string;
  grantedAt: Date;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toEntitlement(row: Row): Entitlement {
  return {
    orgId: row.orgId,
    id: row.id,
    orgUserId: row.orgUserId,
    bundleId: row.bundleId,
    contentId: row.contentId,
    status: row.status,
    source: row.source,
    grantedAt: row.grantedAt,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleEntitlementsRepository implements EntitlementsRepository {
  constructor(
    private readonly db: DbExecutor,
    private readonly logger: Logger = noopLogger,
  ) {}

  /** entitlements → org_users + the grant's target: content_items (type) and one
   *  LEFT JOIN per concrete content table (title), or bundles (name). Both target
   *  joins are LEFT — a row carries one of the two, never both. */
  private joined(where: SQL | undefined) {
    return this.db
      .select(selection)
      .from(entitlements)
      .innerJoin(
        orgUsers,
        and(eq(orgUsers.orgId, entitlements.orgId), eq(orgUsers.id, entitlements.orgUserId)),
      )
      .innerJoin(users, eq(users.id, orgUsers.userId))
      .leftJoin(
        contentItems,
        and(
          eq(contentItems.orgId, entitlements.orgId),
          eq(contentItems.id, entitlements.contentId),
        ),
      )
      .leftJoin(
        bundles,
        and(eq(bundles.orgId, entitlements.orgId), eq(bundles.id, entitlements.bundleId)),
      )
      .leftJoin(
        courses,
        and(eq(courses.orgId, entitlements.orgId), eq(courses.id, entitlements.contentId)),
      )
      .leftJoin(
        downloads,
        and(eq(downloads.orgId, entitlements.orgId), eq(downloads.id, entitlements.contentId)),
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
    if (query.orgUserId) {
      conditions.push(eq(entitlements.orgUserId, query.orgUserId));
    }
    if (query.contentId) {
      conditions.push(eq(entitlements.contentId, query.contentId));
    }
    if (query.bundleId) {
      conditions.push(eq(entitlements.bundleId, query.bundleId));
    }
    if (query.type) {
      conditions.push(eq(contentItems.type, query.type));
    }
    if (query.search) {
      const pattern = `%${query.search}%`;
      conditions.push(
        or(
          ilike(users.firstName, pattern),
          ilike(users.lastName, pattern),
          ilike(users.email, pattern),
          ilike(contentTitle, pattern),
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

    const rows = await this.joined(where).orderBy(orderBy).limit(query.pageSize).offset(offset);

    const [{ total } = { total: 0 }] = await this.db
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(entitlements)
      .innerJoin(
        orgUsers,
        and(eq(orgUsers.orgId, entitlements.orgId), eq(orgUsers.id, entitlements.orgUserId)),
      )
      .innerJoin(users, eq(users.id, orgUsers.userId))
      .leftJoin(
        contentItems,
        and(
          eq(contentItems.orgId, entitlements.orgId),
          eq(contentItems.id, entitlements.contentId),
        ),
      )
      .leftJoin(
        bundles,
        and(eq(bundles.orgId, entitlements.orgId), eq(bundles.id, entitlements.bundleId)),
      )
      .leftJoin(
        courses,
        and(eq(courses.orgId, entitlements.orgId), eq(courses.id, entitlements.contentId)),
      )
      .leftJoin(
        downloads,
        and(eq(downloads.orgId, entitlements.orgId), eq(downloads.id, entitlements.contentId)),
      )
      .where(where);

    return {
      rows: rows.map(toEntitlement),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** A grant targets exactly one of a bundle or a content item (db check
   *  constraint), so the upsert is inferred on whichever of the two partial
   *  uniques the target uses. */
  async insert(orgId: string, input: GrantEntitlementInput): Promise<Entitlement> {
    const bundleId = input.bundleId ?? null;
    const contentId = input.contentId ?? null;
    const target = bundleId
      ? [entitlements.orgId, entitlements.orgUserId, entitlements.bundleId]
      : [entitlements.orgId, entitlements.orgUserId, entitlements.contentId];

    const [row] = await this.db
      .insert(entitlements)
      .values({
        orgId,
        orgUserId: input.orgUserId,
        bundleId,
        contentId,
        status: "active",
        source: "manual",
        grantedAt: new Date(),
        expiresAt: input.expiresAt,
      })
      .onConflictDoUpdate({
        target,
        set: {
          status: "active",
          source: "manual",
          grantedAt: new Date(),
          expiresAt: input.expiresAt,
        },
      })
      .returning(selection);
    if (!row) {
      throw new Error("failed to insert entitlement");
    }
    return toEntitlement(row);
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
      .returning(selection);
    if (!row) {
      return null;
    }
    return toEntitlement(row);
  }

  /** Existence check scoped to the course case: same status predicate as
   *  `list` (revoked never counts; an elapsed expiry reads as expired, not
   *  active). The course is reachable two ways — granted directly, or granted
   *  through a bundle that holds it — and either way the row is joined to
   *  content_items and constrained to type = 'course', so a grant on some other
   *  content type can never be mistaken for course access. */
  async hasCourseAccess(orgId: string, orgUserId: string, courseId: string): Promise<boolean> {
    const bundledItems = alias(contentItems, "bundled_content_items");
    const rows = await this.db
      .select({ id: entitlements.id })
      .from(entitlements)
      .leftJoin(
        contentItems,
        and(
          eq(contentItems.orgId, entitlements.orgId),
          eq(contentItems.id, entitlements.contentId),
        ),
      )
      .leftJoin(
        bundleItems,
        and(
          eq(bundleItems.orgId, entitlements.orgId),
          eq(bundleItems.bundleId, entitlements.bundleId),
        ),
      )
      .leftJoin(
        bundledItems,
        and(eq(bundledItems.orgId, bundleItems.orgId), eq(bundledItems.id, bundleItems.contentId)),
      )
      .where(
        and(
          eq(entitlements.orgId, orgId),
          eq(entitlements.orgUserId, orgUserId),
          or(
            and(eq(entitlements.contentId, courseId), eq(contentItems.type, "course")),
            and(eq(bundleItems.contentId, courseId), eq(bundledItems.type, "course")),
          ),
          sql`${derivedStatus} = 'active'`,
        ),
      )
      .limit(1);
    return rows.length > 0;
  }
}
translateDbErrors(DrizzleEntitlementsRepository);
