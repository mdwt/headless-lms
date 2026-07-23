// organizations context — domain entities, DTOs, and events.
// The org is the tenant root that owns all org-scoped data; memberships and
// invitations are mirrored from the auth adapter's organization plugin.
// Owner/member/inviter all reference the identity USER (staff), not a student.
import type { DomainEvent } from "./shared.js";

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
  readonly role: InviteRole;
  readonly status: string;
  // The identity USER who issued the invitation.
  readonly invitedBy: string;
  readonly expiresAt: Date | null;
  readonly createdAt: Date;
}

/** Roles an invitation can carry — staff roles plus the portal student. Never owner. */
export type InviteRole = "admin" | "instructor" | "student";

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

/** A request to mint an invitation: domain-owned token, emailed to the invitee. */
export interface CreateInviteInput {
  orgId: string;
  email: string;
  role: InviteRole;
  // The identity USER issuing the invitation.
  inviterUserId: string;
}

/** A token-carrying acceptance: the logged-in account claiming an invitation. */
export interface AcceptInviteInput {
  token: string;
  /** The accepting auth account's id. */
  userExternalId: string;
  /** The accepting account's email — must match the invitation. */
  email: string;
}

export interface AssignCourseInput {
  // The owning org's better-auth id (used to locate the domain org).
  orgExternalId: string;
  membershipId: string;
  courseId: string;
}

/** A student was invited to create their portal account. */
export interface StudentInvited extends DomainEvent {
  type: "student.invited";
  email: string;
  invitationId: string;
}

/** A staff invitation was created. */
export interface InvitationCreated extends DomainEvent {
  type: "invitation.created";
  invitation: Invitation;
}

/** A pending invitation was canceled (the token dies with it). */
export interface InvitationCanceled extends DomainEvent {
  type: "invitation.canceled";
  invitationId: string;
}

/** An invited student created/linked their account. */
export interface StudentInviteAccepted extends DomainEvent {
  type: "student.invite.accepted";
  email: string;
  invitationId: string;
  /** The auth account now linked to the student row. */
  userExternalId: string;
}

/** A staff invitation was accepted and the membership granted. */
export interface InvitationAccepted extends DomainEvent {
  type: "invitation.accepted";
  invitationId: string;
  role: string;
  userExternalId: string;
}

/** Domain events the organizations context emits. */
export type OrganizationEvent =
  | StudentInvited
  | InvitationCreated
  | InvitationCanceled
  | StudentInviteAccepted
  | InvitationAccepted;
