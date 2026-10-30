// identity context — the person.
//
// One row per human, global, mirroring a Better Auth account via `externalId`.
// A person's link to an organization — including whether they are staff or a
// learner there — is the organizations context's OrgUser, not a second
// identity. See ./organizations.ts.

export type {
  CreateUserInput,
  Notification,
  NotificationKind,
  NotificationPreference,
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

export type AccessGrant = {
  userId: string;
  orgId: string;
  scopes: string[];
  clientId: string;
};

export type AccessRequest = {
  method: string;
  url: string;
  headers: HeaderBag;
};

export interface AccessTokenVerifier {
  verifyAccess(request: AccessRequest): Promise<AccessGrant | null>;
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
  scopes: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
};

export type CreatedApiKey = ApiKeySummary & { key: string };

export type NewApiKey = {
  authUserId: string;
  orgId: string;
  name: string;
  scopes: string[];
};

export interface AppAccessAdmin {
  listConnectedApps(headers: HeaderBag, orgId: string): Promise<ConnectedApp[]>;
  revokeConnectedApp(headers: HeaderBag, orgId: string, clientId: string): Promise<void>;
  listApiKeys(headers: HeaderBag, orgId: string): Promise<ApiKeySummary[]>;
  createApiKey(input: NewApiKey): Promise<CreatedApiKey>;
  deleteApiKey(headers: HeaderBag, orgId: string, keyId: string): Promise<void>;
}
