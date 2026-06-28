// team context — service implementation (inbound port). Owns the team rules.
import {
  TeamRuleError,
  type InviteMemberInput,
  type Member,
  type MembersQuery,
  type Page,
  type Role,
} from "./model.js";
import type { TeamRepository, TeamService } from "./ports.js";

export class TeamServiceImpl implements TeamService {
  constructor(private readonly repo: TeamRepository) {}

  list(query: MembersQuery): Promise<Page<Member>> {
    return this.repo.list(query);
  }

  async invite(input: InviteMemberInput): Promise<Member> {
    const existing = await this.repo.findByEmail(input.email);
    if (existing) throw new TeamRuleError("That email is already a member or invited");
    return this.repo.insertInvite(input);
  }

  async updateRole(id: string, role: Role): Promise<Member | null> {
    const member = await this.repo.findById(id);
    if (!member) return null;
    if (member.role === "owner") throw new TeamRuleError("The owner role cannot be reassigned");
    return this.repo.updateRole(id, role);
  }

  remove(id: string): Promise<boolean> {
    return this.repo.delete(id);
  }
}
