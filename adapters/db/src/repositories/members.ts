import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { MembersRepository, TeamRow } from "@headless-lms/core/organizations";
import type { ContentType } from "@headless-lms/core/types";
import { orgUsers, invites } from "../schema/organizations.js";
import { roleAssignments } from "../schema/roles.js";
import { users } from "../schema/identity.js";
import { user } from "../schema/better-auth.js";
import type { Logger } from "@headless-lms/core/shared/ports";
import { noopLogger } from "@headless-lms/core/shared/logger";
import { orgUserProfileColumns } from "./org-user-profile.js";
import { translateDbErrors } from "./pg-errors.js";

export class DrizzleMembersRepository implements MembersRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly logger: Logger = noopLogger,
  ) {}

  async teamRows(orgId: string, memberRoleKey: string): Promise<TeamRow[]> {
    const pendingInvite = this.db
      .select({
        email: invites.email,
        roleKey: invites.roleKey,
        invitedAt: invites.createdAt,
      })
      .from(invites)
      .where(and(eq(invites.orgId, orgId), eq(invites.status, "pending")))
      .as("pending_invite");
    const rows = await this.db
      .select({
        ...orgUserProfileColumns,
        status: orgUsers.status,
        joinedAt: orgUsers.createdAt,
        inviteRoleKey: pendingInvite.roleKey,
        invitedAt: pendingInvite.invitedAt,
      })
      .from(orgUsers)
      .innerJoin(users, eq(users.id, orgUsers.userId))
      .leftJoin(user, eq(user.id, users.externalId))
      .leftJoin(pendingInvite, sql`lower(${pendingInvite.email}) = lower(${users.email})`)
      .where(
        and(
          eq(orgUsers.orgId, orgId),
          or(
            sql`exists (select 1 from ${roleAssignments} ra where ra.org_id = ${orgUsers.orgId} and ra.org_user_id = ${orgUsers.id})`,
            and(
              eq(orgUsers.status, "invited"),
              isNotNull(pendingInvite.roleKey),
              sql`${pendingInvite.roleKey} <> ${memberRoleKey}`,
            ),
          ),
        ),
      );
    if (rows.length === 0) {
      return [];
    }
    const assignments = await this.db
      .select({
        orgUserId: roleAssignments.orgUserId,
        roleKey: roleAssignments.roleKey,
        contentId: roleAssignments.contentId,
        contentType: roleAssignments.contentType,
      })
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.orgId, orgId),
          inArray(
            roleAssignments.orgUserId,
            rows.map((row) => row.id),
          ),
        ),
      );
    return rows.map((row) => {
      const own = assignments.filter((a) => a.orgUserId === row.id);
      return {
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        image: row.image ?? null,
        status: row.status,
        joinedAt: row.joinedAt,
        invitedAt: row.invitedAt ?? null,
        orgRoleKey: own.find((a) => a.contentId === null)?.roleKey ?? null,
        inviteRoleKey: row.inviteRoleKey ?? null,
        items: own
          .filter((a) => a.contentId !== null && a.contentType !== null)
          .map((a) => ({
            contentId: a.contentId!,
            contentType: a.contentType as ContentType,
            roleKey: a.roleKey,
          })),
      };
    });
  }
}
translateDbErrors(DrizzleMembersRepository);
