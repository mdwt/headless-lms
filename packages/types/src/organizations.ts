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

/** An accepted invitation: the auth-side invite + the account that accepted it.
 *  Acceptance is an organizations-domain event; for student invites the grant
 *  itself (linking the student row) is delegated to the identity context. */
export interface AcceptInviteInput {
  /** The invitation's auth-provider id. */
  inviteExternalId: string;
  /** Role carried by the invitation — 'student' or a staff role. */
  role: string;
  /** The invited email (verified against the account by the invite provider). */
  email: string;
  /** The accepting auth account's id. */
  userExternalId: string;
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
  inviteExternalId: string;
}

/** A staff invitation was recorded (mirror of the minted invite). */
export interface InvitationCreated extends DomainEvent {
  type: "invitation.created";
  invitation: Invitation;
}

/** A pending staff invitation was canceled (mirror-side; the token dies with it). */
export interface InvitationCanceled extends DomainEvent {
  type: "invitation.canceled";
  inviteExternalId: string;
}

/** An invited student created/linked their account. */
export interface StudentInviteAccepted extends DomainEvent {
  type: "student.invite.accepted";
  email: string;
  inviteExternalId: string;
  /** The auth account now linked to the student row(s). */
  userExternalId: string;
}

/** A staff invitation was accepted and the membership granted. */
export interface InvitationAccepted extends DomainEvent {
  type: "invitation.accepted";
  inviteExternalId: string;
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
