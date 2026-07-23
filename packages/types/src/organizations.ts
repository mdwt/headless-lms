// organizations context — domain entities, DTOs, and events.
// The org is the tenant root that owns all org-scoped data; memberships and
// invitations are mirrored from the auth adapter's organization plugin.
// Owner/member/inviter all reference the identity USER (staff), not a student.

/** Domain roles. The authorization matrix lives in core (roles.ts). */
export type Role = "owner" | "admin" | "instructor";

export interface Organization {
  readonly id: string;
  // Links to the better-auth organization record owned by the auth adapter.
  readonly externalId: string;
  readonly name: string;
  readonly slug: string;
  // The identity USER who owns the organization (better-auth's creator/owner).
  readonly ownerId: string;
  readonly createdAt: Date;
}

export interface Membership {
  readonly id: string;
  readonly orgId: string;
  // The identity USER this membership belongs to.
  readonly userId: string;
  readonly role: Role;
  // Links to the better-auth member record.
  readonly externalId: string;
  readonly createdAt: Date;
}

export interface Invitation {
  readonly id: string;
  readonly orgId: string;
  readonly email: string;
  readonly role: Role;
  readonly status: string;
  // The identity USER who issued the invitation. (Schema column property is the
  // misspelt `invetedBy`; mirrored here to match the persisted row.)
  readonly invetedBy: string;
  // Links to the better-auth invitation record.
  readonly externalId: string;
  readonly expiresAt: Date | null;
  readonly createdAt: Date;
}

export interface CourseAssignment {
  readonly id: string;
  readonly orgId: string;
  readonly membershipId: string;
  readonly courseId: string;
  readonly createdAt: Date;
}

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

// A user-facing request to update the active organization's profile. Applied
// via Better Auth (the source of truth), then mirrored into the domain org row.
export interface UpdateOrganizationInput {
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
  externalId: string;
  email: string;
  role: string;
  status: string;
  // The identity USER who issued the invitation.
  inviterUserId: string;
  expiresAt: Date | null;
}

export interface AcceptInvitationInput {
  externalId: string;
}

export interface AssignCourseInput {
  // The owning org's better-auth id (used to locate the domain org).
  orgExternalId: string;
  membershipId: string;
  courseId: string;
}

/** Domain events the organizations context emits. Empty placeholder. */
export type OrganizationEvent = never;
