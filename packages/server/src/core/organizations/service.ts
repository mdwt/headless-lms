// organizations context — service implementation (inbound port).
import type {
  OrganizationService,
  OrganizationsRepository,
  MembersRepository,
  MemberRecord,
  MemberWriteContext,
  OrgAdmin,
  StudentLinker,
  AuthHeaders,
} from './ports.js';
import type { Organization, Membership, Invitation, CourseAssignment } from './model.js';
import { STUDENT_ROLE, type Role } from './roles.js';
import {
  OrganizationRuleError,
  type Member,
  type MembersQuery,
  type InviteMemberInput,
  type Page,
} from './members.js';
import type {
  CreateOrganizationInput,
  NewOrganizationInput,
  UpdateOrganizationInput,
  AddMembershipInput,
  RecordInvitationInput,
  AcceptInviteInput,
  AssignCourseInput,
} from './types.js';
import type { Logger, NewDomainEvent, OutboxAppender } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';

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
    // Identity-context slice: the student rows the invite lifecycle records
    // against and links. Invites are organizations-domain; the row is identity's.
    private readonly students: StudentLinker,
    private readonly outbox?: OutboxAppender,
    private readonly logger: Logger = noopLogger,
  ) {}

  private async emit<E extends NewDomainEvent>(events: E[]): Promise<void> {
    await this.outbox?.append(events);
  }

  async createOrg(input: CreateOrganizationInput): Promise<Organization> {
    const existing = await this.repo.findByExternalId(input.externalId);
    if (existing) {
      return existing;
    }
    const created = await this.repo.create(input);
    this.logger.info('organization mirrored', { orgId: created.id, externalId: input.externalId });
    return created;
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
    if (!org) {
      throw new Error('organization did not propagate to the domain mirror');
    }
    this.logger.info('organization created', { orgId: org.id, slug: org.slug });
    return org;
  }

  // User-facing update: drive Better Auth to update the active org, then mirror
  // the new name/slug into the domain row and return it. Mirrors createOrganization.
  async updateOrganization(
    headers: AuthHeaders,
    authOrgId: string,
    input: UpdateOrganizationInput,
  ): Promise<Organization> {
    await this.orgAdmin().updateOrganization(headers, authOrgId, input);
    const org = await this.repo.updateByExternalId(authOrgId, input);
    if (!org) {
      throw new Error('organization did not propagate to the domain mirror');
    }
    this.logger.info('organization updated', { orgId: org.id });
    return org;
  }

  async addMembership(input: AddMembershipInput): Promise<Membership> {
    const org = await this.requireOrg(input.orgExternalId);
    const membership = await this.repo.insertMembership(org.id, input);
    this.logger.info('membership added', { orgId: org.id });
    return membership;
  }

  async removeMembership(externalId: string): Promise<void> {
    await this.repo.deleteMembershipByExternalId(externalId);
    this.logger.info('membership removed', { externalId });
  }

  async recordInvitation(input: RecordInvitationInput): Promise<Invitation> {
    const org = await this.requireOrg(input.orgExternalId);
    const invitation = await this.repo.insertInvitation(org.id, input);
    this.logger.info('invitation recorded', { orgId: org.id });
    await this.emit([{ type: 'invitation.created', orgId: org.id, invitation }]);
    return invitation;
  }

  async recordStudentInvite(
    orgExternalId: string,
    email: string,
    inviteExternalId: string,
  ): Promise<void> {
    const org = await this.requireOrg(orgExternalId);
    await this.students.recordStudentInvite(org.id, email, inviteExternalId);
    await this.emit([{ type: 'student.invited', orgId: org.id, email, inviteExternalId }]);
  }

  // Invitation acceptance — an organizations-domain event with two grants:
  // student invites link the pending student row(s) (identity persists that),
  // staff invites grant the membership their mirror records. Returns the org
  // the accepting account should act in, for session stamping at the boundary.
  async acceptInvite(input: AcceptInviteInput): Promise<{ orgExternalId: string | null }> {
    if (input.role === STUDENT_ROLE) {
      await this.students.linkStudentByInvite(
        input.inviteExternalId,
        input.email,
        input.userExternalId,
      );
      const orgExternalId = await this.students.studentOrgExternalId(input.userExternalId);
      this.logger.info('student invite accepted', { inviteExternalId: input.inviteExternalId });
      const org = orgExternalId ? await this.repo.findByExternalId(orgExternalId) : null;
      if (org) {
        await this.emit([
          {
            type: 'student.invite.accepted',
            orgId: org.id,
            email: input.email,
            inviteExternalId: input.inviteExternalId,
            userExternalId: input.userExternalId,
          },
        ]);
      }
      return { orgExternalId };
    }
    const record = await this.repo.findInvitationByExternalId(input.inviteExternalId);
    if (!record || record.status !== 'pending') {
      // Canceled/unknown mirror → no grant; the token alone proves nothing.
      this.logger.warn('invitation accept refused: mirror not pending', {
        inviteExternalId: input.inviteExternalId,
      });
      return { orgExternalId: null };
    }
    await this.orgAdmin().grantMembership(record.orgExternalId, input.userExternalId, record.role);
    await this.repo.setInvitationStatusByExternalId(input.inviteExternalId, 'accepted');
    this.logger.info('invitation accepted', { inviteExternalId: input.inviteExternalId });
    const org = await this.requireOrg(record.orgExternalId);
    await this.emit([
      {
        type: 'invitation.accepted',
        orgId: org.id,
        inviteExternalId: input.inviteExternalId,
        role: record.role,
        userExternalId: input.userExternalId,
      },
    ]);
    return { orgExternalId: record.orgExternalId };
  }

  async getByExternalId(externalId: string): Promise<Organization | null> {
    return this.repo.findByExternalId(externalId);
  }

  async getBySlug(slug: string): Promise<Organization | null> {
    return this.repo.findBySlug(slug);
  }

  async assignCourse(input: AssignCourseInput): Promise<CourseAssignment> {
    const org = await this.requireOrg(input.orgExternalId);
    const assignment = await this.repo.insertCourseAssignment(org.id, input);
    this.logger.info('course assigned', { orgId: org.id, courseId: input.courseId });
    return assignment;
  }

  async unassignCourse(input: AssignCourseInput): Promise<void> {
    const org = await this.requireOrg(input.orgExternalId);
    await this.repo.deleteCourseAssignment(org.id, input.membershipId, input.courseId);
    this.logger.info('course unassigned', { orgId: org.id, courseId: input.courseId });
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
    if (existing) {
      this.logger.warn('invite rejected: already a member or invited', { orgId: ctx.orgId });
      throw new OrganizationRuleError('That email is already a member or invited');
    }
    await this.orgAdmin().invite(ctx, input);
    const created = await this.membersRepo.findByEmail(ctx.orgId, input.email);
    if (!created) {
      throw new Error('invitation did not propagate to the domain mirror');
    }
    this.logger.info('member invited', { orgId: ctx.orgId, memberId: created.id });
    return toMember(created);
  }

  async inviteStudent(ctx: MemberWriteContext, email: string): Promise<void> {
    await this.orgAdmin().inviteStudent(ctx, email);
    this.logger.info('student invited', { orgId: ctx.orgId });
  }

  async updateMemberRole(ctx: MemberWriteContext, id: string, role: Role): Promise<Member | null> {
    const member = await this.membersRepo.findById(ctx.orgId, id);
    if (!member) {
      return null;
    }
    if (member.role === 'owner') {
      this.logger.warn('role change rejected: owner role immutable', {
        orgId: ctx.orgId,
        memberId: id,
      });
      throw new OrganizationRuleError('The owner role cannot be reassigned');
    }
    if (member.kind !== 'member' || !member.memberExternalId) {
      this.logger.warn('role change rejected: not an active member', {
        orgId: ctx.orgId,
        memberId: id,
      });
      throw new OrganizationRuleError('Only active members can have their role changed');
    }
    await this.orgAdmin().updateRole(ctx, member.memberExternalId, role);
    const updated = await this.membersRepo.findById(ctx.orgId, id);
    this.logger.info('member role updated', { orgId: ctx.orgId, memberId: id, role });
    return updated ? toMember(updated) : null;
  }

  async removeMember(ctx: MemberWriteContext, id: string): Promise<boolean> {
    const member = await this.membersRepo.findById(ctx.orgId, id);
    if (!member) {
      return false;
    }
    if (member.role === 'owner') {
      this.logger.warn('member removal rejected: owner cannot be removed', {
        orgId: ctx.orgId,
        memberId: id,
      });
      throw new OrganizationRuleError('The owner cannot be removed');
    }
    if (member.kind === 'member' && member.memberExternalId) {
      await this.orgAdmin().removeMember(ctx, member.memberExternalId);
    } else if (member.kind === 'invitation' && member.invitationExternalId) {
      // better-invite tokens can only be canceled by their creator; the domain
      // mirror is authoritative for staff grants (acceptInvite refuses
      // non-pending mirrors), so canceling the mirror is canceling the invite.
      await this.repo.setInvitationStatusByExternalId(member.invitationExternalId, 'canceled');
      await this.emit([
        {
          type: 'invitation.canceled',
          orgId: ctx.orgId,
          inviteExternalId: member.invitationExternalId,
        },
      ]);
    }
    this.logger.info('member removed', { orgId: ctx.orgId, memberId: id });
    return true;
  }

  private async requireOrg(externalId: string): Promise<Organization> {
    const org = await this.repo.findByExternalId(externalId);
    if (!org) {
      throw new Error(`unknown organization for externalId ${externalId}`);
    }
    return org;
  }
}
