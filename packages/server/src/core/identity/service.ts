// identity context — service implementation (inbound port).
import type { IdentityService, IdentityRepository } from "./ports.js";
import type { User, Student } from "./model.js";
import type { RegisterUserInput, RegisterStudentInput } from "./types.js";

export class IdentityServiceImpl implements IdentityService {
  constructor(private readonly repo: IdentityRepository) {}

  async registerUser(input: RegisterUserInput): Promise<User> {
    const existing = await this.repo.findUserByExternalId(input.externalId);
    if (existing) return existing;
    return this.repo.insertUser(input);
  }

  async registerStudent(input: RegisterStudentInput): Promise<Student> {
    const existing = await this.repo.findStudentByExternalId(input.orgId, input.externalId);
    if (existing) return existing;
    return this.repo.insertStudent(input);
  }

  async getUserByExternalId(externalId: string): Promise<User | null> {
    return this.repo.findUserByExternalId(externalId);
  }

  async getStudentByExternalId(orgId: string, externalId: string): Promise<Student | null> {
    return this.repo.findStudentByExternalId(orgId, externalId);
  }
}
