// organizations context — domain entities & value objects.
// Framework-free, runtime-free. The org is the tenant root that owns all
// org-scoped data; memberships and invitations are mirrored from the auth
// adapter's organization plugin. Owner/member/inviter all reference the
// identity USER (staff), not a student.
import type { Role } from "./roles.js";

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
  readonly authInvitationId: string;
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
