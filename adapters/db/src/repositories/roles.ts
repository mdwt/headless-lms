import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  OWNER_ROLE_KEY,
  type ActorFacts,
  type AssignmentRow,
  type RolesRepository,
  type StoredOrgRole,
} from "@headless-lms/core/organizations";
import type { ContentType, Level, Permission, RoleAssignment } from "@headless-lms/core/types";
import { contentItems } from "../schema/content.js";
import { orgUsers } from "../schema/organizations.js";
import { orgRoles, roleAssignments } from "../schema/roles.js";

type RoleRow = typeof orgRoles.$inferSelect;
type AssignmentRecordRow = typeof roleAssignments.$inferSelect;

function toStored(row: RoleRow): StoredOrgRole {
  return {
    key: row.key,
    name: row.name,
    description: row.description,
    base: row.base,
    levels: (row.levels as Level[] | null) ?? null,
    permissions: row.permissions as Partial<Record<Permission, boolean>>,
    team: row.team,
  };
}

function toAssignment(row: AssignmentRecordRow): RoleAssignment {
  return {
    id: row.id,
    orgId: row.orgId,
    orgUserId: row.orgUserId,
    roleKey: row.roleKey,
    contentId: row.contentId,
    contentType: row.contentType,
    assignedBy: row.assignedBy,
    createdAt: row.createdAt,
  };
}

function toRow(row: {
  roleKey: string;
  contentId: string | null;
  contentType: string | null;
}): AssignmentRow {
  return {
    roleKey: row.roleKey,
    contentId: row.contentId,
    contentType: row.contentType as ContentType | null,
  };
}

export class DrizzleRolesRepository implements RolesRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async actorFacts(orgId: string, orgUserId: string): Promise<ActorFacts | null> {
    const result = await this.db.execute<{
      id: string;
      status: "invited" | "active";
      assignments: { roleKey: string; contentId: string | null; contentType: string | null }[];
      roles: {
        key: string;
        name: string | null;
        description: string | null;
        base: string;
        levels: string[] | null;
        permissions: Record<string, boolean>;
        team: boolean | null;
      }[];
    }>(sql`
      select
        ou.id,
        ou.status,
        coalesce(
          (select json_agg(json_build_object(
              'roleKey', ra.role_key,
              'contentId', ra.content_id,
              'contentType', ra.content_type))
           from role_assignments ra
           where ra.org_id = ou.org_id and ra.org_user_id = ou.id),
          '[]'::json
        ) as assignments,
        coalesce(
          (select json_agg(json_build_object(
              'key', r.key,
              'name', r.name,
              'description', r.description,
              'base', r.base,
              'levels', r.levels,
              'permissions', r.permissions,
              'team', r.team))
           from org_roles r
           where r.org_id = ou.org_id),
          '[]'::json
        ) as roles
      from org_users ou
      where ou.org_id = ${orgId} and ou.id = ${orgUserId}
    `);
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      orgUserId: row.id,
      status: row.status,
      assignments: row.assignments.map(toRow),
      storedRoles: row.roles.map((r) => ({
        key: r.key,
        name: r.name,
        description: r.description,
        base: r.base,
        levels: (r.levels as Level[] | null) ?? null,
        permissions: r.permissions as Partial<Record<Permission, boolean>>,
        team: r.team,
      })),
    };
  }

  async storedRoles(orgId: string): Promise<StoredOrgRole[]> {
    const rows = await this.db.select().from(orgRoles).where(eq(orgRoles.orgId, orgId));
    return rows.map(toStored);
  }

  async saveStoredRole(orgId: string, role: StoredOrgRole): Promise<void> {
    const values = {
      name: role.name,
      description: role.description,
      base: role.base,
      levels: role.levels,
      permissions: role.permissions as Record<string, boolean>,
      team: role.team,
    };
    await this.db
      .insert(orgRoles)
      .values({ orgId, key: role.key, ...values })
      .onConflictDoUpdate({ target: [orgRoles.orgId, orgRoles.key], set: values });
  }

  async deleteStoredRole(orgId: string, key: string): Promise<boolean> {
    const rows = await this.db
      .delete(orgRoles)
      .where(and(eq(orgRoles.orgId, orgId), eq(orgRoles.key, key)))
      .returning({ key: orgRoles.key });
    return rows.length > 0;
  }

  async assignmentsOf(orgId: string, orgUserId: string): Promise<RoleAssignment[]> {
    const rows = await this.db
      .select()
      .from(roleAssignments)
      .where(and(eq(roleAssignments.orgId, orgId), eq(roleAssignments.orgUserId, orgUserId)));
    return rows.map(toAssignment);
  }

  async assignmentsOfMany(
    orgId: string,
    orgUserIds: string[],
  ): Promise<Map<string, AssignmentRow[]>> {
    const out = new Map<string, AssignmentRow[]>();
    if (orgUserIds.length === 0) {
      return out;
    }
    const rows = await this.db
      .select()
      .from(roleAssignments)
      .where(and(eq(roleAssignments.orgId, orgId), inArray(roleAssignments.orgUserId, orgUserIds)));
    for (const row of rows) {
      const list = out.get(row.orgUserId) ?? [];
      list.push(toRow(row));
      out.set(row.orgUserId, list);
    }
    return out;
  }

  async assignmentsOn(orgId: string, contentId: string): Promise<RoleAssignment[]> {
    const rows = await this.db
      .select()
      .from(roleAssignments)
      .where(and(eq(roleAssignments.orgId, orgId), eq(roleAssignments.contentId, contentId)));
    return rows.map(toAssignment);
  }

  async holdersOf(orgId: string, roleKeys: string[], contentId?: string): Promise<string[]> {
    if (roleKeys.length === 0) {
      return [];
    }
    const scope =
      contentId === undefined
        ? isNull(roleAssignments.contentId)
        : or(isNull(roleAssignments.contentId), eq(roleAssignments.contentId, contentId));
    const rows = await this.db
      .selectDistinct({ id: roleAssignments.orgUserId })
      .from(roleAssignments)
      .innerJoin(
        orgUsers,
        and(eq(orgUsers.orgId, roleAssignments.orgId), eq(orgUsers.id, roleAssignments.orgUserId)),
      )
      .where(
        and(
          eq(roleAssignments.orgId, orgId),
          inArray(roleAssignments.roleKey, roleKeys),
          eq(orgUsers.status, "active"),
          scope,
        ),
      );
    return rows.map((row) => row.id);
  }

  async setOrgRole(
    orgId: string,
    orgUserId: string,
    roleKey: string | null,
    assignedBy: string,
  ): Promise<void> {
    await this.db
      .delete(roleAssignments)
      .where(
        and(
          eq(roleAssignments.orgId, orgId),
          eq(roleAssignments.orgUserId, orgUserId),
          isNull(roleAssignments.contentId),
        ),
      );
    if (roleKey !== null) {
      await this.db
        .insert(roleAssignments)
        .values({ orgId, orgUserId, roleKey, contentId: null, contentType: null, assignedBy });
    }
  }

  async setItemRole(
    orgId: string,
    orgUserId: string,
    contentId: string,
    contentType: ContentType,
    roleKey: string,
    assignedBy: string,
  ): Promise<void> {
    await this.db
      .insert(roleAssignments)
      .values({ orgId, orgUserId, roleKey, contentId, contentType, assignedBy })
      .onConflictDoUpdate({
        target: [roleAssignments.orgId, roleAssignments.orgUserId, roleAssignments.contentId],
        set: { roleKey, assignedBy, createdAt: new Date() },
      });
  }

  async removeItemRole(
    orgId: string,
    orgUserId: string,
    contentId: string,
  ): Promise<RoleAssignment | null> {
    const [row] = await this.db
      .delete(roleAssignments)
      .where(
        and(
          eq(roleAssignments.orgId, orgId),
          eq(roleAssignments.orgUserId, orgUserId),
          eq(roleAssignments.contentId, contentId),
        ),
      )
      .returning();
    return row ? toAssignment(row) : null;
  }

  async countHolders(
    orgId: string,
    roleKey: string,
    contentType?: ContentType | "org",
  ): Promise<number> {
    const level =
      contentType === undefined
        ? undefined
        : contentType === "org"
          ? isNull(roleAssignments.contentId)
          : eq(roleAssignments.contentType, contentType);
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(roleAssignments)
      .where(and(eq(roleAssignments.orgId, orgId), eq(roleAssignments.roleKey, roleKey), level));
    return row?.n ?? 0;
  }

  async holderCounts(orgId: string): Promise<Record<string, number>> {
    const rows = await this.db
      .select({
        roleKey: roleAssignments.roleKey,
        n: sql<number>`count(distinct ${roleAssignments.orgUserId})::int`,
      })
      .from(roleAssignments)
      .where(eq(roleAssignments.orgId, orgId))
      .groupBy(roleAssignments.roleKey);
    return Object.fromEntries(rows.map((row) => [row.roleKey, row.n]));
  }

  async contentTypeOf(orgId: string, contentId: string): Promise<ContentType | null> {
    const [row] = await this.db
      .select({ type: contentItems.type })
      .from(contentItems)
      .where(and(eq(contentItems.orgId, orgId), eq(contentItems.id, contentId)))
      .limit(1);
    return (row?.type as ContentType | undefined) ?? null;
  }

  async ownerOrgUserId(orgId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: roleAssignments.orgUserId })
      .from(roleAssignments)
      .where(and(eq(roleAssignments.orgId, orgId), eq(roleAssignments.roleKey, OWNER_ROLE_KEY)))
      .limit(1);
    return row?.id ?? null;
  }

  async lock(keys: string[]): Promise<void> {
    for (const key of [...new Set(keys)].sort()) {
      await this.db.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
    }
  }
}
