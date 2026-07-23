// organizations context — service implementation (inbound port).
import type {
  OrganizationService,
  OrganizationsRepository,
  OrganizationsUnitOfWork,
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
  type Page,
} from './members.js';
import type {
  CreateOrganizationInput,
  NewOrganizationInput,
  UpdateOrganizationInput,
  AddMembershipInput,
  CreateInviteInput,
  AcceptInviteInput,
  InviteRole,
  AssignCourseInput,
} from './types.js';
import type { Logger, OutboxAppender } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';
import type { Mailer } from '../shared/mailer.js';
import { generateInviteToken, hashInviteToken } from '../shared/invite-token.js';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface InviteUrls {
  studentPortalUrl: string;
  adminAppUrl: string;
}

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

const noopOutbox: OutboxAppender = { append: async () => {} };

export class OrganizationServiceImpl implements OrganizationService {
  /** Writes that emit an event run through the UoW so the row and its outbox
   *  entry commit in one transaction. Absent (tests) → passthrough, no events. */
  private readonly uow: OrganizationsUnitOfWork;

  constructor(
    private readonly repo: OrganizationsRepository,
    private readonly membersRepo: MembersRepository,
    private readonly orgAdmin: () => OrgAdmin,
    private readonly students: StudentLinker,
    uow?: OrganizationsUnitOfWork,
    private readonly logger: Logger = noopLogger,
    private readonly mailer?: Pick<Mailer, 'send'>,
    private readonly inviteUrls?: InviteUrls,
  ) {
    this.uow = uow ?? { run: (fn) => fn({ organizations: repo, outbox: noopOutbox }) };
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

  async createInvite(input: CreateInviteInput): Promise<Invitation> {
    const { orgId, email, role, inviterUserId } = input;
    if (role === STUDENT_ROLE) {
      if (!(await this.students.hasPendingStudent(orgId, email))) {
        throw new OrganizationRuleError('No pending student with this email');
      }
    } else {
      const existing = await this.membersRepo.findByEmail(orgId, email);
      if (existing?.kind === 'member') {
        this.logger.warn('invite rejected: already a member', { orgId });
        throw new OrganizationRuleError('That email is already a member');
      }
    }
    const { token, tokenHash } = generateInviteToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const pending = await this.repo.findPendingInvitation(orgId, email);
    const invitation = await this.uow.run(async ({ organizations, outbox }) => {
      const row = pending
        ? await organizations.rotateInvitationToken(orgId, pending.id, tokenHash, expiresAt)
        : await organizations.insertInvitation(orgId, {
            email,
            role,
            invitedBy: inviterUserId,
            tokenHash,
            expiresAt,
          });
      if (!row) {
        throw new Error('invitation row disappeared during re-issue');
      }
      await outbox.append([
        role === STUDENT_ROLE
          ? { type: 'student.invited', orgId, email, invitationId: row.id }
          : { type: 'invitation.created', orgId, invitation: row },
      ]);
      return row;
    });
    await this.sendInviteEmail(email, role, token);
    this.logger.info('invite created', { orgId, invitationId: invitation.id, role });
    return invitation;
  }

  async peekInvite(token: string): Promise<Invitation | null> {
    const invitation = await this.repo.findInvitationByTokenHash(hashInviteToken(token));
    if (!invitation || invitation.status !== 'pending') {
      return null;
    }
    if (invitation.expiresAt && invitation.expiresAt < new Date()) {
      return null;
    }
    return invitation;
  }

  async inviteAllowsSignup(token: string, email: string): Promise<boolean> {
    const invitation = await this.peekInvite(token);
    return invitation !== null && invitation.email.toLowerCase() === email.toLowerCase();
  }

  async acceptInvite(
    input: AcceptInviteInput,
  ): Promise<{ orgExternalId: string; role: InviteRole } | null> {
    const invitation = await this.peekInvite(input.token);
    if (!invitation) {
      this.logger.warn('invite accept refused: token invalid or expired');
      return null;
    }
    if (invitation.email.toLowerCase() !== input.email.toLowerCase()) {
      this.logger.warn('invite accept refused: email mismatch', {
        orgId: invitation.orgId,
        invitationId: invitation.id,
      });
      return null;
    }
    const org = await this.repo.findById(invitation.orgId);
    if (!org) {
      return null;
    }
    if (invitation.role === STUDENT_ROLE) {
      const linked = await this.students.linkPendingStudent(
        invitation.orgId,
        invitation.email,
        invitation.id,
        input.userExternalId,
      );
      if (!linked) {
        this.logger.warn('student invite accept refused: no pending student row', {
          orgId: invitation.orgId,
          invitationId: invitation.id,
        });
        return null;
      }
      await this.uow.run(({ organizations }) =>
        organizations.setInvitationStatus(invitation.orgId, invitation.id, 'accepted'),
      );
    } else {
      await this.orgAdmin().grantMembership(org.externalId, input.userExternalId, invitation.role);
      await this.uow.run(async ({ organizations, outbox }) => {
        await organizations.setInvitationStatus(invitation.orgId, invitation.id, 'accepted');
        await outbox.append([
          {
            type: 'invitation.accepted',
            orgId: invitation.orgId,
            invitationId: invitation.id,
            role: invitation.role,
            userExternalId: input.userExternalId,
          },
        ]);
      });
    }
    this.logger.info('invite accepted', {
      orgId: invitation.orgId,
      invitationId: invitation.id,
      role: invitation.role,
    });
    return { orgExternalId: org.externalId, role: invitation.role };
  }

  private async sendInviteEmail(email: string, role: InviteRole, token: string): Promise<void> {
    if (!this.mailer || !this.inviteUrls) {
      throw new Error('invite delivery is not configured (mailer / invite urls missing)');
    }
    const base =
      role === STUDENT_ROLE
        ? `${this.inviteUrls.studentPortalUrl}/welcome`
        : `${this.inviteUrls.adminAppUrl}/invite`;
    const query = new URLSearchParams({ token, email });
    const inviteUrl = `${base}?${query.toString()}`;
    try {
      if (role === STUDENT_ROLE) {
        await this.mailer.send(email, 'studentInvite', { inviteUrl, studentName: email });
      } else {
        await this.mailer.send(email, 'memberInvite', {
          inviteUrl,
          inviterName: 'Your team',
          role,
        });
      }
    } catch (err) {
      // A failed email must not abort invite creation: the token is already
      // minted and recorded, so the admin can fix transport and resend.
      this.logger.error('failed to send invite email', {
        email,
        role,
        err: err instanceof Error ? err : new Error(String(err)),
      });
    }
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

  async assertInvitable(orgExternalId: string, email: string, role: string): Promise<void> {
    if (role === STUDENT_ROLE) {
      return;
    }
    const org = await this.requireOrg(orgExternalId);
    const existing = await this.membersRepo.findByEmail(org.id, email);
    if (existing) {
      this.logger.warn('invite rejected: already a member or invited', { orgId: org.id });
      throw new OrganizationRuleError('That email is already a member or invited');
    }
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
    } else if (member.kind === 'invitation' && member.invitationId) {
      const invitationId = member.invitationId;
      await this.uow.run(async ({ organizations, outbox }) => {
        await organizations.setInvitationStatus(ctx.orgId, invitationId, 'canceled');
        await outbox.append([{ type: 'invitation.canceled', orgId: ctx.orgId, invitationId }]);
      });
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
