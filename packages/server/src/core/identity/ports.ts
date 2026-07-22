// identity context — ports.
import type { User, Student } from './model.js';
import type { RegisterUserInput, RegisterStudentInput, CreateStudentInput } from './types.js';

// Capabilities used by the auth adapter to provision a domain identity when a
// credential user is created — narrow slices of the identity service.
export interface UserProvisioner {
  registerUser(input: RegisterUserInput): Promise<User>;
}

export interface StudentProvisioner {
  registerStudent(input: RegisterStudentInput): Promise<Student>;
}

// Inbound port (use cases the service exposes).
export interface IdentityService extends UserProvisioner, StudentProvisioner {
  getUserByExternalId(externalId: string): Promise<User | null>;
  // Students are org-scoped: the same login (externalId) resolves independently
  // per org, so the portal org is required to pick the right row.
  getStudentByExternalId(orgId: string, externalId: string): Promise<Student | null>;
  // The org (as its better-auth external id) a login belongs to as a student, so
  // the auth layer can stamp it onto the session at login. Null when the login is
  // not a student (e.g. staff) or the row is ambiguous across orgs.
  studentOrgExternalId(externalId: string): Promise<string | null>;
  createStudent(input: CreateStudentInput): Promise<Student>;
  getStudentById(orgId: string, id: string): Promise<Student | null>;
  recordStudentInvite(orgId: string, email: string, inviteId: string): Promise<void>;
  linkStudentByInvite(inviteId: string, email: string, externalId: string): Promise<void>;
}

// Outbound port (persistence contract the repository fulfils).
export interface IdentityRepository {
  insertUser(input: RegisterUserInput): Promise<User>;
  findUserByExternalId(externalId: string): Promise<User | null>;
  insertStudent(input: RegisterStudentInput): Promise<Student>;
  findStudentByExternalId(orgId: string, externalId: string): Promise<Student | null>;
  findStudentOrgExternalId(externalId: string): Promise<string | null>;
  findStudentByEmail(orgId: string, email: string): Promise<Student | null>;
  findStudentById(orgId: string, id: string): Promise<Student | null>;
  insertPendingStudent(input: CreateStudentInput): Promise<Student>;
  setInviteIdByEmail(orgId: string, email: string, inviteId: string): Promise<void>;
  linkPendingStudents(inviteId: string, email: string, externalId: string): Promise<number>;
}
