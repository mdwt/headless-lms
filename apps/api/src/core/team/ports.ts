// team context — ports.
import type { InviteMemberInput, Member, MembersQuery, Page, Role } from "./model.js";

export interface TeamService {
  list(orgId: string, query: MembersQuery): Promise<Page<Member>>;
  invite(ctx: TeamWriteContext, input: InviteMemberInput): Promise<Member>;
  updateRole(ctx: TeamWriteContext, id: string, role: Role): Promise<Member | null>;
  remove(ctx: TeamWriteContext, id: string): Promise<boolean>;
}

/** A team row enriched with the auth-provider ids needed to drive writes. */
export interface TeamMemberRecord extends Member {
  kind: "member" | "invitation";
  authMemberId: string | null;
  authInvitationId: string | null;
}

// Outbound: reads from the domain mirror tables (org-scoped).
export interface TeamRepository {
  list(orgId: string, query: MembersQuery): Promise<Page<Member>>;
  findByEmail(orgId: string, email: string): Promise<TeamMemberRecord | null>;
  findById(orgId: string, id: string): Promise<TeamMemberRecord | null>;
}

/** Context for a write: domain org (reads/rules) + auth org & session (writes). */
export interface TeamWriteContext {
  orgId: string;
  authOrgId: string;
  headers: Record<string, string | string[] | undefined>;
}

/** Outbound: org membership writes, fulfilled by the auth provider (Better Auth). */
export interface OrgAdmin {
  invite(ctx: TeamWriteContext, input: InviteMemberInput): Promise<void>;
  updateRole(ctx: TeamWriteContext, authMemberId: string, role: Role): Promise<void>;
  removeMember(ctx: TeamWriteContext, authMemberId: string): Promise<void>;
  cancelInvitation(ctx: TeamWriteContext, authInvitationId: string): Promise<void>;
}
