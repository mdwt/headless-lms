import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import type { DbExecutor } from "../client.js";
import type {
  AccessFacts,
  EndingGrant,
  EntitlementNotice,
  EntitlementsRepository,
  GrantKey,
  GrantTarget,
  InsertSpaceMemberInput,
} from "@headless-lms/core/entitlements";
import type {
  Entitlement,
  EntitlementStatus,
  EntitlementsQuery,
  GrantEntitlementInput,
  Logger,
  Page,
  Role,
  SpaceMember,
  SpaceMemberStatus,
} from "@headless-lms/core/types";
import {
  entitlementEndingSoonNotices,
  entitlementExpiryNotices,
  entitlements,
  orgUsers,
  spaceMembers,
  users,
} from "../schema/index.js";
import {
  activeGrantCovers,
  grantExpired,
  grantIsActive,
  communityMember,
  grantOpens,
  holdsCommunity,
} from "./grant-covers.js";
import { bundles, communities, contentItems, courses, downloads } from "../schema/content.js";
import { noopLogger } from "@headless-lms/core/shared/logger";
import { ROLES, canModerate } from "@headless-lms/core/organizations";
import { translateDbErrors } from "./pg-errors.js";

type ResolvedStatus = "active" | "expired" | "revoked";

const MODERATING_ROLES: Role[] = ROLES.filter((role) => canModerate(role));

// CASE expression: revoked beats everything; otherwise an elapsed expiry reads as
// expired; otherwise active.
const derivedStatus = sql<ResolvedStatus>`case
  when ${entitlements.status} = 'revoked' then 'revoked'
  when ${grantExpired(entitlements.expiresAt)} then 'expired'
  else 'active'
end`;

function at(date: Date): SQL {
  return sql`${date.toISOString()}::timestamptz`;
}

const expiryNoticed = sql`exists (
  select 1 from ${entitlementExpiryNotices}
  where ${entitlementExpiryNotices.orgId} = ${entitlements.orgId}
    and ${entitlementExpiryNotices.entitlementId} = ${entitlements.id}
    and ${entitlementExpiryNotices.expiresAt} = ${entitlements.expiresAt}
)`;

const endingSoonNoticed = sql`exists (
  select 1 from ${entitlementEndingSoonNotices}
  where ${entitlementEndingSoonNotices.orgId} = ${entitlements.orgId}
    and ${entitlementEndingSoonNotices.entitlementId} = ${entitlements.id}
    and ${entitlementEndingSoonNotices.communityId} = ${communities.id}
    and ${entitlementEndingSoonNotices.expiresAt} = ${entitlements.expiresAt}
)`;

const opensPublishedCommunity = and(
  eq(communities.orgId, entitlements.orgId),
  eq(communities.status, "published"),
  grantOpens(entitlements, sql`${communities.id}`, "community"),
);

// Display name of the grant's target, whatever it is. One LEFT JOIN per concrete
// content table plus one for bundles; exactly one hits per row (a grant targets
// either a bundle or a single content item), so the COALESCE picks the single
// non-null title. Extended per new content type.
const contentTitle = sql<string>`coalesce(${courses.title}, ${downloads.title}, ${communities.title}, ${bundles.name})`;

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
      .leftJoin(
        communities,
        and(eq(communities.orgId, entitlements.orgId), eq(communities.id, entitlements.contentId)),
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
      .leftJoin(
        communities,
        and(eq(communities.orgId, entitlements.orgId), eq(communities.id, entitlements.contentId)),
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

  async insertIfAbsent(orgId: string, input: GrantEntitlementInput): Promise<Entitlement | null> {
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
      .onConflictDoNothing({ target })
      .returning(selection);
    return row ? toEntitlement(row) : null;
  }

  async lockGrant(orgId: string, key: GrantKey): Promise<Entitlement | null> {
    const target = key.bundleId
      ? eq(entitlements.bundleId, key.bundleId)
      : key.contentId
        ? eq(entitlements.contentId, key.contentId)
        : undefined;
    if (!target) {
      return null;
    }
    const [row] = await this.db
      .select(selection)
      .from(entitlements)
      .where(and(eq(entitlements.orgId, orgId), eq(entitlements.orgUserId, key.orgUserId), target))
      .for("update")
      .limit(1);
    return row ? toEntitlement(row) : null;
  }

  async setExpiresAt(
    orgId: string,
    id: string,
    expiresAt: Date | null,
  ): Promise<Entitlement | null> {
    const [row] = await this.db
      .update(entitlements)
      .set({ expiresAt })
      .where(and(eq(entitlements.orgId, orgId), eq(entitlements.id, id)))
      .returning(selection);
    return row ? toEntitlement(row) : null;
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
  hasCourseAccess(orgId: string, orgUserId: string, courseId: string): Promise<boolean> {
    return this.holds(
      activeGrantCovers(sql`${orgId}`, sql`${orgUserId}`, sql`${courseId}`, "course"),
    );
  }

  hasCommunityAccess(orgId: string, orgUserId: string, communityId: string): Promise<boolean> {
    return this.holds(holdsCommunity(sql`${orgId}`, sql`${orgUserId}`, sql`${communityId}`));
  }

  private async holds(predicate: SQL): Promise<boolean> {
    const result = await this.db.execute<{ covered: boolean }>(sql`select ${predicate} as covered`);
    const rows = Array.isArray(result) ? result : result.rows;
    return rows[0]?.covered === true;
  }

  async communitiesOpenedBy(orgId: string, grant: GrantTarget): Promise<string[]> {
    if (!grant.contentId && !grant.bundleId) {
      return [];
    }
    const target = {
      orgId: sql`${orgId}`,
      contentId: sql`${grant.contentId ?? null}::text`,
      bundleId: sql`${grant.bundleId ?? null}::text`,
    };
    const rows = await this.db
      .select({ id: communities.id })
      .from(communities)
      .where(
        and(
          eq(communities.orgId, orgId),
          eq(communities.status, "published"),
          grantOpens(target, sql`${communities.id}`, "community"),
        ),
      )
      .orderBy(asc(communities.id));
    return rows.map((row) => row.id);
  }

  async accessAmong(
    orgId: string,
    communityId: string,
    spaceId: string | null,
    orgUserIds: string[],
  ): Promise<AccessFacts[]> {
    if (orgUserIds.length === 0) {
      return [];
    }
    const activeInSpace = spaceId
      ? sql<boolean>`exists (
          select 1 from space_members sm
          where sm.org_id = ${sql`${orgUsers.orgId}`}
            and sm.space_id = ${spaceId}
            and sm.org_user_id = ${sql`${orgUsers.id}`}
            and sm.status = 'active'
        )`
      : sql<boolean>`false`;
    const rows = await this.db
      .select({
        orgUserId: orgUsers.id,
        role: orgUsers.role,
        member: sql<boolean>`${communityMember(sql`${orgUsers.orgId}`, sql`${orgUsers.id}`, sql`${orgUsers.role}`, sql`${communityId}`)}`,
        activeInSpace,
      })
      .from(orgUsers)
      .where(and(eq(orgUsers.orgId, orgId), inArray(orgUsers.id, orgUserIds)));
    return rows.map((row) => ({
      orgUserId: row.orgUserId,
      role: row.role as Role,
      member: row.member === true,
      activeInSpace: row.activeInSpace === true,
    }));
  }

  async findSpaceMember(
    orgId: string,
    spaceId: string,
    orgUserId: string,
  ): Promise<SpaceMember | null> {
    const [row] = await this.db
      .select()
      .from(spaceMembers)
      .where(
        and(
          eq(spaceMembers.orgId, orgId),
          eq(spaceMembers.spaceId, spaceId),
          eq(spaceMembers.orgUserId, orgUserId),
        ),
      )
      .limit(1);
    return row ? toSpaceMember(row) : null;
  }

  async listSpaceMembersFor(
    orgId: string,
    orgUserId: string,
    communityId: string,
  ): Promise<SpaceMember[]> {
    const rows = await this.db
      .select()
      .from(spaceMembers)
      .where(
        and(
          eq(spaceMembers.orgId, orgId),
          eq(spaceMembers.orgUserId, orgUserId),
          eq(spaceMembers.communityId, communityId),
        ),
      );
    return rows.map(toSpaceMember);
  }

  async lockSpaceMember(
    orgId: string,
    spaceId: string,
    orgUserId: string,
  ): Promise<SpaceMember | null> {
    const [row] = await this.db
      .select()
      .from(spaceMembers)
      .where(
        and(
          eq(spaceMembers.orgId, orgId),
          eq(spaceMembers.spaceId, spaceId),
          eq(spaceMembers.orgUserId, orgUserId),
        ),
      )
      .for("update")
      .limit(1);
    return row ? toSpaceMember(row) : null;
  }

  async listSpaceMembers(orgId: string, spaceId: string): Promise<SpaceMember[]> {
    const rows = await this.db
      .select()
      .from(spaceMembers)
      .where(and(eq(spaceMembers.orgId, orgId), eq(spaceMembers.spaceId, spaceId)))
      .orderBy(asc(spaceMembers.createdAt), asc(spaceMembers.id));
    return rows.map(toSpaceMember);
  }

  async insertSpaceMember(orgId: string, input: InsertSpaceMemberInput): Promise<SpaceMember> {
    const [row] = await this.db
      .insert(spaceMembers)
      .values({
        orgId,
        communityId: input.communityId,
        spaceId: input.spaceId,
        orgUserId: input.orgUserId,
        status: input.status,
        source: input.source,
      })
      .returning();
    if (!row) {
      throw new Error("failed to insert space member");
    }
    return toSpaceMember(row);
  }

  async updateSpaceMemberStatus(
    orgId: string,
    id: string,
    status: SpaceMemberStatus,
  ): Promise<SpaceMember | null> {
    const [row] = await this.db
      .update(spaceMembers)
      .set({ status })
      .where(and(eq(spaceMembers.orgId, orgId), eq(spaceMembers.id, id)))
      .returning();
    return row ? toSpaceMember(row) : null;
  }

  async deleteSpaceMember(orgId: string, id: string): Promise<void> {
    await this.db
      .delete(spaceMembers)
      .where(and(eq(spaceMembers.orgId, orgId), eq(spaceMembers.id, id)));
  }

  async countActiveSpaceMembers(orgId: string, spaceId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(spaceMembers)
      .where(
        and(
          eq(spaceMembers.orgId, orgId),
          eq(spaceMembers.spaceId, spaceId),
          eq(spaceMembers.status, "active"),
          holdsCommunity(
            sql`${spaceMembers.orgId}`,
            sql`${spaceMembers.orgUserId}`,
            sql`${spaceMembers.communityId}`,
          ),
        ),
      );
    return row?.total ?? 0;
  }

  async activeSpaceIds(orgId: string, orgUserId: string, communityId: string): Promise<string[]> {
    const rows = await this.db
      .select({ spaceId: spaceMembers.spaceId })
      .from(spaceMembers)
      .where(
        and(
          eq(spaceMembers.orgId, orgId),
          eq(spaceMembers.orgUserId, orgUserId),
          eq(spaceMembers.communityId, communityId),
          eq(spaceMembers.status, "active"),
        ),
      );
    return rows.map((row) => row.spaceId);
  }

  async listGrantsExpiredBy(orgId: string, now: Date): Promise<Entitlement[]> {
    const rows = await this.db
      .select(selection)
      .from(entitlements)
      .where(this.expiredUnnoticed(orgId, now));
    return rows.map(toEntitlement);
  }

  async listGrantsEndingBetween(orgId: string, after: Date, until: Date): Promise<EndingGrant[]> {
    const rows = await this.db
      .select({ ...selection, communityId: communities.id })
      .from(entitlements)
      .innerJoin(communities, opensPublishedCommunity)
      .where(this.endingUnnoticed(orgId, after, until));
    return rows.map(({ communityId, ...grant }) => ({
      grant: toEntitlement(grant),
      communityId,
    }));
  }

  async hasDueNotices(orgId: string, now: Date, until: Date): Promise<boolean> {
    const expired = this.db
      .select({ id: entitlements.id })
      .from(entitlements)
      .where(this.expiredUnnoticed(orgId, now));
    const ending = this.db
      .select({ id: entitlements.id })
      .from(entitlements)
      .innerJoin(communities, opensPublishedCommunity)
      .where(this.endingUnnoticed(orgId, now, until));
    return this.holds(sql`(exists (${expired}) or exists (${ending}))`);
  }

  async claimNotice(orgId: string, notice: EntitlementNotice, now: Date): Promise<boolean> {
    const statement =
      notice.kind === "expired"
        ? sql`insert into ${entitlementExpiryNotices} ("org_id", "entitlement_id", "expires_at", "notified_at")
            values (${orgId}, ${notice.entitlementId}, ${at(notice.expiresAt)}, ${at(now)})
            on conflict do nothing
            returning "entitlement_id"`
        : sql`insert into ${entitlementEndingSoonNotices} ("org_id", "entitlement_id", "community_id", "expires_at", "notified_at")
            values (${orgId}, ${notice.entitlementId}, ${notice.communityId}, ${at(notice.expiresAt)}, ${at(now)})
            on conflict do nothing
            returning "entitlement_id"`;
    const result = await this.db.execute<{ entitlement_id: string }>(statement);
    const rows = Array.isArray(result) ? result : result.rows;
    return rows.length > 0;
  }

  private expiredUnnoticed(orgId: string, now: Date): SQL {
    return and(
      eq(entitlements.orgId, orgId),
      eq(entitlements.status, "active"),
      grantExpired(entitlements.expiresAt, at(now)),
      sql`not ${expiryNoticed}`,
    )!;
  }

  private endingUnnoticed(orgId: string, after: Date, until: Date): SQL {
    return and(
      eq(entitlements.orgId, orgId),
      grantIsActive(entitlements, at(after)),
      grantExpired(entitlements.expiresAt, at(until)),
      sql`not ${endingSoonNoticed}`,
    )!;
  }

  async communityModeratorIds(orgId: string, communityId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: orgUsers.id })
      .from(orgUsers)
      .where(
        and(
          eq(orgUsers.orgId, orgId),
          inArray(orgUsers.role, MODERATING_ROLES),
          communityMember(
            sql`${orgUsers.orgId}`,
            sql`${orgUsers.id}`,
            sql`${orgUsers.role}`,
            sql`${communityId}`,
          ),
        ),
      )
      .orderBy(asc(orgUsers.id));
    return rows.map((row) => row.id);
  }

  async communityMemberIds(orgId: string, communityId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: orgUsers.id })
      .from(orgUsers)
      .where(
        and(
          eq(orgUsers.orgId, orgId),
          communityMember(
            sql`${orgUsers.orgId}`,
            sql`${orgUsers.id}`,
            sql`${orgUsers.role}`,
            sql`${communityId}`,
          ),
        ),
      )
      .orderBy(asc(orgUsers.id));
    return rows.map((row) => row.id);
  }

  async communityIdsOpenedFor(orgId: string, orgUserId: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ id: communities.id })
      .from(communities)
      .where(
        and(
          eq(communities.orgId, orgId),
          holdsCommunity(sql`${communities.orgId}`, sql`${orgUserId}`, sql`${communities.id}`),
        ),
      )
      .orderBy(asc(communities.id));
    return rows.map((row) => row.id);
  }
}

function toSpaceMember(row: {
  orgId: string;
  id: string;
  communityId: string;
  spaceId: string;
  orgUserId: string;
  status: SpaceMemberStatus;
  source: "request" | "invite" | "manual";
  createdAt: Date;
  updatedAt: Date;
}): SpaceMember {
  return {
    orgId: row.orgId,
    id: row.id,
    communityId: row.communityId,
    spaceId: row.spaceId,
    orgUserId: row.orgUserId,
    status: row.status,
    source: row.source,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

translateDbErrors(DrizzleEntitlementsRepository);
