// organizations members — Drizzle read repository. Reads the domain mirror of the
// org's members (orgUsers) and pending invites, joined to the identity user for
// display. Writes go through the auth provider (see adapters/auth/org-admin.ts).
import { and, eq, ne } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  isStaffRole,
  STUDENT_ROLE,
  type Member,
  type MemberRecord,
  type MembersQuery,
  type MembersRepository,
  type Page,
  type StaffRole,
} from "@headless-lms/core/organizations";
import { orgUsers, invites } from "../schema/organizations.js";
import { users } from "../schema/identity.js";
import { user } from "../schema/better-auth.js";
import type { Logger } from "@headless-lms/core/shared/ports";
import { noopLogger } from "@headless-lms/core/shared/logger";
import { orgUserProfileColumns } from "./org-user-profile.js";
import { translateDbErrors } from "./pg-errors.js";

// The member surface is staff-only; a student org user never reaches here
// (the queries below exclude it), so an unrecognized role falls back to the
// least-privileged staff role rather than widening to the full Role union.
const roleOf = (t: string): StaffRole => (isStaffRole(t) ? t : "instructor");

function toMember(r: MemberRecord): Member {
  return {
    id: r.id,
    firstName: r.firstName,
    lastName: r.lastName,
    email: r.email,
    image: r.image,
    role: r.role,
    status: r.status,
    joinedAt: r.joinedAt,
    invitedAt: r.invitedAt,
  };
}

export class DrizzleMembersRepository implements MembersRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly logger: Logger = noopLogger,
  ) {}

  private async loadAll(orgId: string): Promise<MemberRecord[]> {
    // Learners share this table now, so the role filter is what keeps them off
    // the staff list. Name/email come from the identity user the row links to.
    const memberRows = await this.db
      .select({
        ...orgUserProfileColumns,
        role: orgUsers.role,
        joinedAt: orgUsers.createdAt,
        userExternalId: users.externalId,
      })
      .from(orgUsers)
      .innerJoin(users, eq(users.id, orgUsers.userId))
      .leftJoin(user, eq(user.id, users.externalId))
      .where(and(eq(orgUsers.orgId, orgId), ne(orgUsers.role, STUDENT_ROLE)));

    // Student invites live in the same table but belong to the students
    // surface, not the members list.
    const inviteRows = await this.db
      .select({
        id: invites.id,
        email: invites.email,
        role: invites.role,
        invitedAt: invites.createdAt,
      })
      .from(invites)
      .where(
        and(
          eq(invites.orgId, orgId),
          eq(invites.status, "pending"),
          ne(invites.role, STUDENT_ROLE),
        ),
      );

    const members: MemberRecord[] = memberRows.map((m) => ({
      id: m.id,
      firstName: m.firstName,
      lastName: m.lastName,
      email: m.email,
      image: m.image ?? null,
      role: roleOf(m.role),
      status: "active",
      joinedAt: m.joinedAt.toISOString(),
      invitedAt: null,
      kind: "member",
      userExternalId: m.userExternalId,
      inviteId: null,
    }));
    // A pending invite is an address and nothing else — the invites table
    // carries no names, so there is nobody to name until they accept.
    const invited: MemberRecord[] = inviteRows.map((i) => ({
      id: i.id,
      firstName: null,
      lastName: null,
      email: i.email,
      image: null,
      role: roleOf(i.role),
      status: "invited",
      joinedAt: null,
      invitedAt: i.invitedAt.toISOString(),
      kind: "invite",
      userExternalId: null,
      inviteId: i.id,
    }));
    return [...members, ...invited];
  }

  async list(orgId: string, query: MembersQuery): Promise<Page<Member>> {
    let rows = await this.loadAll(orgId);
    if (query.role) {
      rows = rows.filter((r) => r.role === query.role);
    }
    if (query.status) {
      rows = rows.filter((r) => r.status === query.status);
    }
    const q = query.search?.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) =>
        [r.firstName, r.lastName, r.email].some((v) => v?.toLowerCase().includes(q)),
      );
    }

    const sort = query.sort;
    const desc = sort?.startsWith("-") ?? false;
    const key = (desc ? sort!.slice(1) : sort) as keyof Member | undefined;
    // Nulls last whichever way the column is sorted — an unaccepted invite has
    // no name and belongs at the bottom, not interleaved.
    const byName = (a: string | null, b: string | null): number =>
      a === b ? 0 : a === null ? 1 : b === null ? -1 : a.localeCompare(b);
    rows.sort((a, b) => {
      if (key === "email") {
        return desc ? -a.email.localeCompare(b.email) : a.email.localeCompare(b.email);
      }
      if (key === "role") {
        return desc ? -a.role.localeCompare(b.role) : a.role.localeCompare(b.role);
      }
      if (key === "lastName") {
        const cmp = byName(a.lastName, b.lastName) || byName(a.firstName, b.firstName);
        return desc ? -cmp : cmp;
      }
      const cmp = byName(a.firstName, b.firstName) || byName(a.lastName, b.lastName);
      return desc ? -cmp : cmp;
    });

    const total = rows.length;
    const start = (query.page - 1) * query.pageSize;
    return {
      rows: rows.slice(start, start + query.pageSize).map(toMember),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findByEmail(orgId: string, email: string): Promise<MemberRecord | null> {
    const all = await this.loadAll(orgId);
    return all.find((r) => r.email.toLowerCase() === email.toLowerCase()) ?? null;
  }

  async findById(orgId: string, id: string): Promise<MemberRecord | null> {
    const all = await this.loadAll(orgId);
    return all.find((r) => r.id === id) ?? null;
  }
}
translateDbErrors(DrizzleMembersRepository);
