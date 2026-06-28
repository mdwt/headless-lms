// identity context — service implementation (inbound port).
import type { IdentityService, IdentityRepository } from "./ports.js";
import type { Student } from "./model.js";
import type { RegisterStudentInput } from "./types.js";

export class IdentityServiceImpl implements IdentityService {
  constructor(private readonly repo: IdentityRepository) {}

  async registerStudent(input: RegisterStudentInput): Promise<Student> {
    const existing = await this.repo.findByAuthUserId(input.authUserId);
    if (existing) return existing;
    return this.repo.insert(input);
  }

  async getStudentByAuthUserId(authUserId: string): Promise<Student | null> {
    return this.repo.findByAuthUserId(authUserId);
  }
}
