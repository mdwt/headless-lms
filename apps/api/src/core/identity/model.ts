// identity context — domain entities & value objects.
// Framework-free, runtime-free.

export interface Student {
  readonly id: string;
  // Links to the credential/session record owned by the auth adapter.
  readonly authUserId: string;
  readonly email: string;
  readonly displayName: string;
  readonly createdAt: Date;
}
