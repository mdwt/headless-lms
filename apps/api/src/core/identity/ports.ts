// identity context — ports.
import type { Student } from "./model.js";
import type { RegisterStudentInput } from "./types.js";

// Capability used by the auth adapter to provision a domain student when a
// credential user is created — a narrow slice of the identity service.
export interface StudentProvisioner {
  registerStudent(input: RegisterStudentInput): Promise<Student>;
}

// Inbound port (use cases the service exposes).
export interface IdentityService extends StudentProvisioner {
  getStudentByAuthUserId(authUserId: string): Promise<Student | null>;
}

// Outbound port (persistence contract the repository fulfils).
export interface IdentityRepository {
  insert(input: RegisterStudentInput): Promise<Student>;
  findByAuthUserId(authUserId: string): Promise<Student | null>;
}
