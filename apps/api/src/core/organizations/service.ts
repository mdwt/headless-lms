// organizations context — service implementation (inbound port).
import type {
  OrganizationService,
  OrganizationsRepository,
  MembersRepository,
  MemberRecord,
  MemberWriteContext,
  OrgAdmin,
  AuthHeaders,
} from "./ports.js";
import type { Organization, Membership, Invitation, CourseAssignment } from "./model.js";
import type { Role } from "./roles.js";
import {
  OrganizationRuleError,
  type Member,
  type MembersQuery,
  type InviteMemberInput,
  type Page,
} from "./members.js";
import type {
  CreateOrganizationInput,
  NewOrganizationInput,
  AddMembershipInput,
  RecordInvitationInput,
  AcceptInvitationInput,
  AssignCourseInput,
} from "./types.js";

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

export class OrganizationServiceImpl implements OrganizationService {
  // `orgAdmin` is provided lazily: the auth adapter depends on this service (for
  // its mirror hooks), and OrgAdmin is built over that same auth instance — so it
  // cannot exist at construction time. The thunk is resolved at request time,
  // after composition has finished wiring auth.
  constructor(
    private readonly repo: OrganizationsRepository,
    private readonly membersRepo: MembersRepository,
    private readonly orgAdmin: () => OrgAdmin,
  ) {}

  async createOrg(input: CreateOrganizationInput): Promise<Organization> {
    const existing = await this.repo.findByExternalId(input.externalId);
    if (existing) return existing;
    return this.repo.create(input);
  }

  // User-facing create: drive Better Auth to create the org (it infers the owner
  // from the session) and make it active, then read back the org its hooks
  // mirrored into the domain. Mirrors the write-then-read shape of inviteMember.
  async createOrganization(
    headers: AuthHeaders,
    input: NewOrganizationInput,
  ): Promise<Organization> {
    const { externalId } = await this.orgAdmin().createOrganization(headers, input);
    await this.orgAdmin().setActiveOrganization(headers, externalId);
    const org = await this.repo.findByExternalId(externalId);
    if (!org) throw new Error("organization did not propagate to the domain mirror");
    return org;
  }

  async addMembership(input: AddMembershipInput): Promise<Membership> {
    const org = await this.requireOrg(input.orgExternalId);
    return this.repo.insertMembership(org.id, input);
  }

  async removeMembership(externalId: string): Promise<void> {
    await this.repo.deleteMembershipByExternalId(externalId);
  }

  async recordInvitation(input: RecordInvitationInput): Promise<Invitation> {
    const org = await this.requireOrg(input.orgExternalId);
    return this.repo.insertInvitation(org.id, input);
  }

  async acceptInvitation(input: AcceptInvitationInput): Promise<void> {
    await this.repo.setInvitationStatusByAuthId(input.authInvitationId, "accepted");
  }

  async getByExternalId(externalId: string): Promise<Organization | null> {
    return this.repo.findByExternalId(externalId);
  }

  async assignCourse(input: AssignCourseInput): Promise<CourseAssignment> {
    const org = await this.requireOrg(input.orgExternalId);
    return this.repo.insertCourseAssignment(org.id, input);
  }

  async unassignCourse(input: AssignCourseInput): Promise<void> {
    const org = await this.requireOrg(input.orgExternalId);
    await this.repo.deleteCourseAssignment(org.id, input.membershipId, input.courseId);
  }

  async assignedCourseIds(orgId: string, membershipId: string): Promise<string[]> {
    return this.repo.findAssignedCourseIds(orgId, membershipId);
  }

  async getMembershipByUser(userId: string): Promise<Membership | null> {
    return this.repo.findMembershipByUser(userId);
  }

  // --- Member management (formerly the `team` context) -----------------------
  // Reads come from the domain mirror; writes go through Better Auth (OrgAdmin),
  // whose hooks then mirror the change back into the domain tables.

  listMembers(orgId: string, query: MembersQuery): Promise<Page<Member>> {
    return this.membersRepo.list(orgId, query);
  }

  async inviteMember(ctx: MemberWriteContext, input: InviteMemberInput): Promise<Member> {
    const existing = await this.membersRepo.findByEmail(ctx.orgId, input.email);
    if (existing) throw new OrganizationRuleError("That email is already a member or invited");
    await this.orgAdmin().invite(ctx, input);
    const created = await this.membersRepo.findByEmail(ctx.orgId, input.email);
    if (!created) throw new Error("invitation did not propagate to the domain mirror");
    return toMember(created);
  }

  async updateMemberRole(ctx: MemberWriteContext, id: string, role: Role): Promise<Member | null> {
    const member = await this.membersRepo.findById(ctx.orgId, id);
    if (!member) return null;
    if (member.role === "owner")
      throw new OrganizationRuleError("The owner role cannot be reassigned");
    if (member.kind !== "member" || !member.authMemberId)
      throw new OrganizationRuleError("Only active members can have their role changed");
    await this.orgAdmin().updateRole(ctx, member.authMemberId, role);
    const updated = await this.membersRepo.findById(ctx.orgId, id);
    return updated ? toMember(updated) : null;
  }

  async removeMember(ctx: MemberWriteContext, id: string): Promise<boolean> {
    const member = await this.membersRepo.findById(ctx.orgId, id);
    if (!member) return false;
    if (member.role === "owner") throw new OrganizationRuleError("The owner cannot be removed");
    if (member.kind === "member" && member.authMemberId) {
      await this.orgAdmin().removeMember(ctx, member.authMemberId);
    } else if (member.kind === "invitation" && member.authInvitationId) {
      await this.orgAdmin().cancelInvitation(ctx, member.authInvitationId);
    }
    return true;
  }

  private async requireOrg(externalId: string): Promise<Organization> {
    const org = await this.repo.findByExternalId(externalId);
    if (!org) throw new Error(`unknown organization for externalId ${externalId}`);
    return org;
  }
}
