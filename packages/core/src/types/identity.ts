// identity context — the person.
//
// One row per human, global, mirroring a Better Auth account via `externalId`.
// A person's link to an organization — including whether they are staff or a
// learner there — is the organizations context's OrgUser, not a second
// identity. See ./organizations.ts.

export type { CreateUserInput, ProvisionUserInput, UpdateUserInput } from './schemas/identity.js';

export interface User {
  readonly id: string;
  readonly externalId: string | null;
  readonly email: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type ActiveSession = {
  user: User;
  session: {
    activeOrganizationId?: string | null;
  };
};

export interface SessionVerifier {
  verify(headers: Record<string, string | string[] | undefined>): Promise<ActiveSession | null>;
}

export interface AccountProvisioner {
  create(input: {
    email: string;
    password?: string;
    name?: string;
  }): Promise<{ externalId: string }>;
  updateEmail(externalId: string, email: string): Promise<void>;
  setPassword(externalId: string, password: string): Promise<void>;
  revokeSessions(externalId: string): Promise<void>;
  delete(externalId: string): Promise<void>;
}

export type UserId = string;
