// identity context — service implementation (inbound port).
import { ConflictError } from '../shared/errors.js';
import type { IdentityService, IdentityRepository } from './ports.js';
import type { User, Student } from './model.js';
import type { RegisterUserInput, RegisterStudentInput, CreateStudentInput } from './types.js';
import type { Logger } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';

export class IdentityServiceImpl implements IdentityService {
  constructor(
    private readonly repo: IdentityRepository,
    private readonly logger: Logger = noopLogger,
  ) {}

  async registerUser(input: RegisterUserInput): Promise<User> {
    const existing = await this.repo.findUserByExternalId(input.externalId);
    if (existing) {
      return existing;
    }
    const user = await this.repo.insertUser(input);
    this.logger.info('user registered', { userId: user.id, externalId: input.externalId });
    return user;
  }

  async registerStudent(input: RegisterStudentInput): Promise<Student> {
    const existing = await this.repo.findStudentByExternalId(input.orgId, input.externalId);
    if (existing) {
      return existing;
    }
    const student = await this.repo.insertStudent(input);
    this.logger.info('student registered', { orgId: input.orgId, studentId: student.id });
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

  async createStudent(input: CreateStudentInput): Promise<Student> {
    const existing = await this.repo.findStudentByEmail(input.orgId, input.email);
    if (existing) {
      throw new ConflictError('A student with this email already exists');
    }
    const student = await this.repo.insertPendingStudent(input);
    this.logger.info('student created', { orgId: input.orgId, studentId: student.id });
    return student;
  }

  async getStudentById(orgId: string, id: string): Promise<Student | null> {
    return this.repo.findStudentById(orgId, id);
  }

  async recordStudentInvite(orgId: string, email: string, inviteId: string): Promise<void> {
    await this.repo.setInviteIdByEmail(orgId, email, inviteId);
    this.logger.info('student invite recorded', { orgId, inviteId });
  }

  async linkStudentByInvite(inviteId: string, email: string, externalId: string): Promise<void> {
    const linked = await this.repo.linkPendingStudents(inviteId, email, externalId);
    this.logger.info('student invite accepted', { inviteId, linked });
  }
}
