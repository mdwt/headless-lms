// identity context — service implementation (inbound port).
import type { IdentityService, IdentityRepository } from "./ports.js";
import type { User, Student } from "./model.js";
import type { RegisterUserInput, RegisterStudentInput } from "./types.js";
import type { Logger } from "../shared/ports.js";
import { noopLogger } from "../shared/logger.js";

export class IdentityServiceImpl implements IdentityService {
  constructor(
    private readonly repo: IdentityRepository,
    private readonly logger: Logger = noopLogger,
  ) {}

  async registerUser(input: RegisterUserInput): Promise<User> {
    const existing = await this.repo.findUserByExternalId(input.externalId);
    if (existing) return existing;
    const user = await this.repo.insertUser(input);
    this.logger.info("user registered", { userId: user.id, externalId: input.externalId });
    return user;
  }

  async registerStudent(input: RegisterStudentInput): Promise<Student> {
    const existing = await this.repo.findStudentByExternalId(input.orgId, input.externalId);
    if (existing) return existing;
    const student = await this.repo.insertStudent(input);
    this.logger.info("student registered", { orgId: input.orgId, studentId: student.id });
    return student;
  }

  async getUserByExternalId(externalId: string): Promise<User | null> {
    return this.repo.findUserByExternalId(externalId);
  }

  async getStudentByExternalId(orgId: string, externalId: string): Promise<Student | null> {
    return this.repo.findStudentByExternalId(orgId, externalId);
  }

  async studentOrgExternalId(externalId: string): Promise<string | null> {
    return this.repo.findStudentOrgExternalId(externalId);
  }
}
