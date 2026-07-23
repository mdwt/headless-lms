// identity context — domain entities, DTOs, and events.
// Two identities, both mirrors of a Better Auth user linked by `externalId`:
// User (staff) and Student (learner).

export interface User {
  readonly id: string;
  // The auth engine's user id (e.g. better-auth). The mirror link.
  readonly externalId: string;
  readonly email: string;
  readonly displayName: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface Student {
  readonly id: string;
  // The org this student belongs to (students are org-scoped tenants).
  readonly orgId: string;
  /** better-auth user id once linked; NULL until an invitation is accepted. */
  readonly externalId: string | null;
  /** Latest pending better-invite invitation id; cleared on link. */
  readonly inviteExternalId: string | null;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type UserId = string;
export type StudentId = string;

export interface RegisterUserInput {
  externalId: string;
  email: string;
  displayName: string;
}

export interface RegisterStudentInput {
  orgId: string;
  externalId: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface CreateStudentInput {
  orgId: string;
  email: string;
  firstName: string;
  lastName: string;
}

/** Domain events the identity context emits. Empty placeholder. */
export type IdentityEvent = never;
