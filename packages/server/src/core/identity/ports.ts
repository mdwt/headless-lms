// identity context — ports.
import type { User, Student } from "./model.js";
import type { RegisterUserInput, RegisterStudentInput } from "./types.js";

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
}

// Outbound port (persistence contract the repository fulfils).
export interface IdentityRepository {
  insertUser(input: RegisterUserInput): Promise<User>;
  findUserByExternalId(externalId: string): Promise<User | null>;
  insertStudent(input: RegisterStudentInput): Promise<Student>;
  findStudentByExternalId(orgId: string, externalId: string): Promise<Student | null>;
}
