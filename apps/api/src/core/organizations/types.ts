// organizations context — DTOs and use-case inputs/outputs.

export type OrganizationId = string;
export type MembershipId = string;
export type InvitationId = string;

export interface CreateOrganizationInput {
  // Links to the better-auth organization record.
  externalId: string;
  name: string;
  slug: string;
  // The identity USER who owns the organization.
  ownerId: string;
}

// A user-facing request to create a new organization. Unlike
// CreateOrganizationInput (the mirror slice), this carries no externalId/ownerId:
// Better Auth creates the org (inferring the owner from the session) and its
// hooks mirror it into the domain, at which point the service reads it back.
export interface NewOrganizationInput {
  name: string;
  slug: string;
}

export interface AddMembershipInput {
  // The owning org's better-auth id (used to locate the domain org).
  orgExternalId: string;
  // The membership's own better-auth member id.
  externalId: string;
  // The identity USER this membership belongs to.
  userId: string;
  role: string;
}

export interface RecordInvitationInput {
  // The owning org's better-auth id (used to locate the domain org).
  orgExternalId: string;
  authInvitationId: string;
  email: string;
  role: string;
  status: string;
  // The identity USER who issued the invitation.
  inviterUserId: string;
  expiresAt: Date | null;
}

export interface AcceptInvitationInput {
  authInvitationId: string;
}

export interface AssignCourseInput {
  // The owning org's better-auth id (used to locate the domain org).
  orgExternalId: string;
  membershipId: string;
  courseId: string;
}
