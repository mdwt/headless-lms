// team context — service. Owns the team rules; delegates the actual membership
// writes to the auth provider (OrgAdmin) and reads from the domain mirror.
import {
  TeamRuleError,
  type InviteMemberInput,
  type Member,
  type MembersQuery,
  type Page,
  type Role,
} from "./model.js";
import type {
  OrgAdmin,
  TeamMemberRecord,
  TeamRepository,
  TeamService,
  TeamWriteContext,
} from "./ports.js";

function toMember(r: TeamMemberRecord): Member {
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

export class TeamServiceImpl implements TeamService {
  constructor(
    private readonly repo: TeamRepository,
    private readonly orgAdmin: OrgAdmin,
  ) {}

  list(orgId: string, query: MembersQuery): Promise<Page<Member>> {
    return this.repo.list(orgId, query);
  }

  async invite(ctx: TeamWriteContext, input: InviteMemberInput): Promise<Member> {
    const existing = await this.repo.findByEmail(ctx.orgId, input.email);
    if (existing) throw new TeamRuleError("That email is already a member or invited");
    await this.orgAdmin.invite(ctx, input);
    // The auth provider's hooks mirror the invitation into the domain tables.
    const created = await this.repo.findByEmail(ctx.orgId, input.email);
    if (!created) throw new Error("invitation did not propagate to the domain mirror");
    return toMember(created);
  }

  async updateRole(ctx: TeamWriteContext, id: string, role: Role): Promise<Member | null> {
    const member = await this.repo.findById(ctx.orgId, id);
    if (!member) return null;
    if (member.role === "owner") throw new TeamRuleError("The owner role cannot be reassigned");
    if (member.kind !== "member" || !member.authMemberId)
      throw new TeamRuleError("Only active members can have their role changed");
    await this.orgAdmin.updateRole(ctx, member.authMemberId, role);
    const updated = await this.repo.findById(ctx.orgId, id);
    return updated ? toMember(updated) : null;
  }

  async remove(ctx: TeamWriteContext, id: string): Promise<boolean> {
    const member = await this.repo.findById(ctx.orgId, id);
    if (!member) return false;
    if (member.role === "owner") throw new TeamRuleError("The owner cannot be removed");
    if (member.kind === "member" && member.authMemberId) {
      await this.orgAdmin.removeMember(ctx, member.authMemberId);
    } else if (member.kind === "invitation" && member.authInvitationId) {
      await this.orgAdmin.cancelInvitation(ctx, member.authInvitationId);
    }
    return true;
  }
}
