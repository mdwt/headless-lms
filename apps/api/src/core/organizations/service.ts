// organizations context — service implementation (inbound port).
import type { OrganizationService, OrganizationsRepository } from "./ports.js";
import type { Organization, Membership, Invitation, CourseAssignment } from "./model.js";
import { normalizeRole } from "./roles.js";
import type {
  ProvisionOrganizationInput,
  AddMembershipInput,
  RecordInvitationInput,
  AcceptInvitationInput,
  AssignCourseInput,
} from "./types.js";

export class OrganizationServiceImpl implements OrganizationService {
  constructor(private readonly repo: OrganizationsRepository) {}

  async provisionOrganization(input: ProvisionOrganizationInput): Promise<Organization> {
    const existing = await this.repo.findByAuthOrgId(input.authOrgId);
    if (existing) return existing;
    return this.repo.insertOrganization(input);
  }

  async addMembership(input: AddMembershipInput): Promise<Membership> {
    const org = await this.requireOrg(input.authOrgId);
    return this.repo.insertMembership(org.id, { ...input, role: normalizeRole(input.role) });
  }

  async removeMembership(authMemberId: string): Promise<void> {
    await this.repo.deleteMembershipByAuthMemberId(authMemberId);
  }

  async recordInvitation(input: RecordInvitationInput): Promise<Invitation> {
    const org = await this.requireOrg(input.authOrgId);
    return this.repo.insertInvitation(org.id, input);
  }

  async acceptInvitation(input: AcceptInvitationInput): Promise<void> {
    await this.repo.setInvitationStatusByAuthId(input.authInvitationId, "accepted");
  }

  async getByAuthOrgId(authOrgId: string): Promise<Organization | null> {
    return this.repo.findByAuthOrgId(authOrgId);
  }

  async assignCourse(input: AssignCourseInput): Promise<CourseAssignment> {
    const org = await this.requireOrg(input.authOrgId);
    return this.repo.insertCourseAssignment(org.id, input);
  }

  async unassignCourse(input: AssignCourseInput): Promise<void> {
    const org = await this.requireOrg(input.authOrgId);
    await this.repo.deleteCourseAssignment(org.id, input.membershipId, input.courseId);
  }

  async assignedCourseIds(orgId: string, membershipId: string): Promise<string[]> {
    return this.repo.findAssignedCourseIds(orgId, membershipId);
  }

  async getMembershipByStudent(studentId: string): Promise<Membership | null> {
    return this.repo.findMembershipByStudent(studentId);
  }

  private async requireOrg(authOrgId: string): Promise<Organization> {
    const org = await this.repo.findByAuthOrgId(authOrgId);
    if (!org) throw new Error(`unknown organization for authOrgId ${authOrgId}`);
    return org;
  }
}
