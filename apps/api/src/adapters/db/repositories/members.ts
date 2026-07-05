// organizations members — Drizzle read repository. Reads the domain mirror of the
// org's members (memberships) and pending invitations, joined to the identity user
// for display. Writes go through the auth provider (see adapters/auth/org-admin.ts).
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { MembersRepository, MemberRecord } from "../../../core/organizations/index.js";
import type { Member, MembersQuery, Page, Role } from "../../../core/organizations/index.js";
import { memberships, invitations } from "../schema/organizations.js";
import { users } from "../schema/identity.js";
import { user } from "../../auth/schema.js";

const ROLES: Role[] = ["owner", "admin", "instructor"];
const roleOf = (t: string): Role => (ROLES.includes(t as Role) ? (t as Role) : "instructor");

function toMember(r: MemberRecord): Member {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    image: r.image,
    role: r.role,
    status: r.status,
    joinedAt: r.joinedAt,
    invitedAt: r.invitedAt,
  };
}

export class DrizzleMembersRepository implements MembersRepository {
  constructor(private readonly db: NodePgDatabase) {}

  private async loadAll(orgId: string): Promise<MemberRecord[]> {
    const memberRows = await this.db
      .select({
        id: memberships.id,
        name: users.displayName,
        email: users.email,
        image: user.image,
        role: memberships.role,
        joinedAt: memberships.createdAt,
        authMemberId: memberships.externalId,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .leftJoin(user, eq(user.id, users.externalId))
      .where(eq(memberships.orgId, orgId));

    const inviteRows = await this.db
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        invitedAt: invitations.createdAt,
        authInvitationId: invitations.authInvitationId,
      })
      .from(invitations)
      .where(and(eq(invitations.orgId, orgId), eq(invitations.status, "pending")));

    const members: MemberRecord[] = memberRows.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      image: m.image ?? null,
      role: roleOf(m.role),
      status: "active",
      joinedAt: m.joinedAt.toISOString(),
      invitedAt: null,
      kind: "member",
      authMemberId: m.authMemberId,
      authInvitationId: null,
    }));
    const invited: MemberRecord[] = inviteRows.map((i) => ({
      id: i.id,
      name: i.email,
      email: i.email,
      image: null,
      role: roleOf(i.role),
      status: "invited",
      joinedAt: null,
      invitedAt: i.invitedAt.toISOString(),
      kind: "invitation",
      authMemberId: null,
      authInvitationId: i.authInvitationId,
    }));
    return [...members, ...invited];
  }

  async list(orgId: string, query: MembersQuery): Promise<Page<Member>> {
    let rows = await this.loadAll(orgId);
    if (query.role) rows = rows.filter((r) => r.role === query.role);
    if (query.status) rows = rows.filter((r) => r.status === query.status);
    const q = query.search?.trim().toLowerCase();
    if (q)
      rows = rows.filter(
        (r) => r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q),
      );

    const sort = query.sort;
    const desc = sort?.startsWith("-") ?? false;
    const key = (desc ? sort!.slice(1) : sort) as keyof Member | undefined;
    rows.sort((a, b) => {
      const cmp =
        key === "email"
          ? a.email.localeCompare(b.email)
          : key === "role"
            ? a.role.localeCompare(b.role)
            : a.name.localeCompare(b.name);
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
