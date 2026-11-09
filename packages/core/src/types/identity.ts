// identity context — the person.
//
// One row per human, global, mirroring a Better Auth account via `externalId`.
// A person's link to an organization, and the roles they hold there, are the
// organizations context's OrgUser and role assignments, not a second identity. See ./organizations.ts.

export type {
  CreateUserInput,
  ProvisionUserInput,
  UpdateUserInput,
  UserProfile,
  UserProfileView,
} from './schemas/identity.js';

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

export type HeaderBag = Record<string, string | string[] | undefined>;

export type CredentialLimit = { scopes: string[] } | { roleKey: string };

export type AccessGrant = {
  userId: string;
  orgId: string;
  clientId: string;
  limit: CredentialLimit;
};

export type AccessRequest = {
  method: string;
  url: string;
  headers: HeaderBag;
};

export interface AccessTokenVerifier {
  verifyAccess(request: AccessRequest): Promise<AccessGrant | null>;
  verifyApiKey(headers: HeaderBag): Promise<AccessGrant | null>;
}

export type ConnectedApp = {
  clientId: string;
  name: string;
  iconUrl: string | null;
  scopes: string[];
  connectedAt: Date;
};

export type ApiKeySummary = {
  id: string;
  name: string | null;
  start: string | null;
  role: { key: string; name: string | null } | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
};

export type CreatedApiKey = ApiKeySummary & { key: string };
