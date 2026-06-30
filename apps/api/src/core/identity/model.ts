// identity context — domain entities & value objects.
// Framework-free, runtime-free. Two identities, both mirrors of a Better Auth
// user linked by `externalId`: User (staff) and Student (learner).

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
  readonly externalId: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
