import type { User } from './model.js';
import type { CreateUserInput, UpdateUserInput } from './types.js';
import type { OutboxAppender, UnitOfWork } from '../shared/ports.js';

export interface UserProvisioner {
  createUser(input: CreateUserInput): Promise<User>;
  /** Auth signup entry point. Claims a person provisioned at invite time by
   *  stamping `externalId`; creates the person when the email is unknown.
   *  Throws ConflictError when the email is already linked to an account. */
  linkOrCreateUser(input: CreateUserInput): Promise<User>;
  sendPasswordReset(input: { email: string; url: string }): Promise<void>;
  sendPasswordChanged(input: { email: string }): Promise<void>;
  sendMagicLink(input: { email: string; url: string }): Promise<void>;
}

/** Resolves an auth account to the domain person. Used by the organizations
 *  context at invite acceptance, so core never reads the auth schema. */
export interface UserResolver {
  getUserByExternalId(externalId: string): Promise<User | null>;
  /** A hit says a person exists, NOT that they can sign in — provisioned
   *  students have no account until `externalId` is filled in. */
  getUserByEmail(email: string): Promise<User | null>;
  getUserById(id: string): Promise<User | null>;
}

/** Corrects the person an admin named. Throws ConflictError when a new address
 *  already belongs to somebody else. */
export interface UserEditor {
  updateUser(id: string, input: UpdateUserInput): Promise<User>;
}

/** Inbound HTTP headers carrying the session, forwarded to the auth provider. */
export type AuthHeaders = Record<string, string | string[] | undefined>;

/** Writes to a live session, fulfilled by the auth provider.  */
export interface SessionAdmin {
  /** Points the caller's current session at `orgId`.  */
  stampActiveOrganization(headers: AuthHeaders, orgId: string): Promise<boolean>;
}

// Inbound port (use cases the service exposes).
export interface IdentityService extends UserProvisioner, UserResolver, UserEditor {}

// Outbound port (persistence contract the repository fulfils).
export interface IdentityRepository {
  insertUser(input: CreateUserInput): Promise<User>;
  updateUser(id: string, input: UpdateUserInput): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  findUserByExternalId(externalId: string): Promise<User | null>;
  findUserByEmail(email: string): Promise<User | null>;
}

export interface IdentityTxScope {
  identity: IdentityRepository;
  outbox: OutboxAppender;
}

export type IdentityUnitOfWork = UnitOfWork<IdentityTxScope>;
