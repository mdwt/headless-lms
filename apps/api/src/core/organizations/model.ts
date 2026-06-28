// organizations context — domain entities & value objects.
// Framework-free, runtime-free. The org is the tenant root that owns all
// org-scoped data; memberships and invitations are mirrored from the auth
// adapter's organization plugin.

export interface Organization {
  readonly id: string;
  // Links to the better-auth organization record owned by the auth adapter.
  readonly authOrgId: string;
  readonly name: string;
  readonly slug: string;
  // The student who owns the organization (better-auth's creator/owner member).
  readonly ownerStudentId: string;
  readonly createdAt: Date;
}

export interface Membership {
  readonly id: string;
  readonly orgId: string;
  readonly studentId: string;
  readonly role: string;
  // Links to the better-auth member record.
  readonly authMemberId: string;
  readonly createdAt: Date;
}

export interface Invitation {
  readonly id: string;
  readonly orgId: string;
  readonly email: string;
  readonly role: string;
  readonly status: string;
  readonly inviterStudentId: string;
  // Links to the better-auth invitation record.
  readonly authInvitationId: string;
  readonly expiresAt: Date | null;
  readonly createdAt: Date;
}
