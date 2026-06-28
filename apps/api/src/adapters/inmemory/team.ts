// team — in-memory repository (org members + pending invites).
import { randomUUID } from "node:crypto";
import type { TeamRepository } from "../../core/team/ports.js";
import type {
  InviteMemberInput,
  Member,
  MembersQuery,
  Page,
  Role,
} from "../../core/team/model.js";
import { applyList, daysAgo } from "./list.js";

function seed(): Member[] {
  const instructors = ["Theo Lindqvist", "Priya Nair", "Daniel Mercer", "Lena Halvorsen"];
  return [
    {
      id: "usr_owner",
      name: "Mira Okonkwo",
      email: "mira@atelier.academy",
      image: null,
      role: "owner" as Role,
      status: "active" as const,
      joinedAt: daysAgo(420),
      invitedAt: null,
    },
    ...instructors.map((name, i): Member => ({
      id: `usr_inst_${i + 1}`,
      name,
      email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@atelier.academy`,
      image: null,
      role: (i === 0 ? "admin" : "instructor") as Role,
      status: "active",
      joinedAt: daysAgo(200 - i * 20),
      invitedAt: null,
    })),
    {
      id: "usr_invited_1",
      name: "Pending invite",
      email: "new.lead@example.com",
      image: null,
      role: "admin",
      status: "invited",
      joinedAt: null,
      invitedAt: daysAgo(2),
    },
  ];
}

export class InMemoryTeamRepository implements TeamRepository {
  private members: Member[] = seed();

  async list(query: MembersQuery): Promise<Page<Member>> {
    let rows = this.members;
    if (query.role) rows = rows.filter((m) => m.role === query.role);
    if (query.status) rows = rows.filter((m) => m.status === query.status);
    return applyList(rows, query, ["name", "email"]);
  }

  async findByEmail(email: string): Promise<Member | null> {
    return this.members.find((m) => m.email === email) ?? null;
  }

  async findById(id: string): Promise<Member | null> {
    return this.members.find((m) => m.id === id) ?? null;
  }

  async insertInvite(input: InviteMemberInput): Promise<Member> {
    const member: Member = {
      id: `usr_${randomUUID().slice(0, 8)}`,
      name: "Pending invite",
      email: input.email,
      image: null,
      role: input.role,
      status: "invited",
      joinedAt: null,
      invitedAt: new Date().toISOString(),
    };
    this.members = [...this.members, member];
    return member;
  }

  async updateRole(id: string, role: Role): Promise<Member | null> {
    const member = this.members.find((m) => m.id === id);
    if (!member) return null;
    member.role = role;
    return member;
  }

  async delete(id: string): Promise<boolean> {
    const before = this.members.length;
    this.members = this.members.filter((m) => m.id !== id);
    return this.members.length < before;
  }
}
