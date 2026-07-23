// identity context — service implementation (inbound port).
import { ConflictError } from '../shared/errors.js';
import type { IdentityService, IdentityRepository, IdentityUnitOfWork } from './ports.js';
import type { User, Student } from './model.js';
import type { RegisterUserInput, RegisterStudentInput, CreateStudentInput } from './types.js';
import type { Logger, OutboxAppender } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';

const noopOutbox: OutboxAppender = { append: async () => {} };

export class IdentityServiceImpl implements IdentityService {
  /** Writes that emit an event run through the UoW so the row and its outbox
   *  entry commit in one transaction. Absent (tests) → passthrough, no events. */
  private readonly uow: IdentityUnitOfWork;

  constructor(
    private readonly repo: IdentityRepository,
    uow?: IdentityUnitOfWork,
    private readonly logger: Logger = noopLogger,
  ) {
    this.uow = uow ?? { run: (fn) => fn({ identity: repo, outbox: noopOutbox }) };
  }

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
    const student = await this.uow.run(async ({ identity, outbox }) => {
      const created = await identity.insertStudent(input);
      await outbox.append([{ type: 'student.created', orgId: created.orgId, student: created }]);
      return created;
    });
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
    const student = await this.uow.run(async ({ identity, outbox }) => {
      const created = await identity.insertPendingStudent(input);
      await outbox.append([{ type: 'student.created', orgId: created.orgId, student: created }]);
      return created;
    });
    this.logger.info('student created', { orgId: input.orgId, studentId: student.id });
    return student;
  }

  async getStudentById(orgId: string, id: string): Promise<Student | null> {
    return this.repo.findStudentById(orgId, id);
  }

  async hasPendingStudent(orgId: string, email: string): Promise<boolean> {
    const student = await this.repo.findStudentByEmail(orgId, email);
    return student !== null && student.externalId === null;
  }

  async linkPendingStudent(
    orgId: string,
    email: string,
    invitationId: string,
    externalId: string,
  ): Promise<boolean> {
    const linked = await this.uow.run(async ({ identity, outbox }) => {
      const count = await identity.linkPendingStudent(orgId, email, externalId);
      if (count > 0) {
        await outbox.append([
          { type: 'student.invite.accepted', orgId, email, invitationId, userExternalId: externalId },
        ]);
      }
      return count > 0;
    });
    if (!linked) {
      this.logger.warn('student invite NOT linked: no pending student row', { orgId, invitationId });
      return false;
    }
    this.logger.info('student linked to account', { orgId, invitationId });
    return true;
  }
}
