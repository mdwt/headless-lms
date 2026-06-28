// organizations context — DTOs and use-case inputs/outputs.

export type OrganizationId = string;
export type MembershipId = string;
export type InvitationId = string;

export interface ProvisionOrganizationInput {
  authOrgId: string;
  name: string;
  slug: string;
  ownerStudentId: string;
}

export interface AddMembershipInput {
  authOrgId: string;
  authMemberId: string;
  studentId: string;
  role: string;
}

export interface RecordInvitationInput {
  authOrgId: string;
  authInvitationId: string;
  email: string;
  role: string;
  status: string;
  inviterStudentId: string;
  expiresAt: Date | null;
}

export interface AcceptInvitationInput {
  authInvitationId: string;
}

export interface AssignCourseInput {
  authOrgId: string;
  membershipId: string;
  courseId: string;
}
