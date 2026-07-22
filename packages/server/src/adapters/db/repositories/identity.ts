// identity — Drizzle repository (implements the core outbound port).
import { and, eq, isNull, or } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { IdentityRepository } from '../../../core/identity/ports.js';
import type { User, Student } from '../../../core/identity/model.js';
import type {
  RegisterUserInput,
  RegisterStudentInput,
  CreateStudentInput,
} from '../../../core/identity/types.js';
import { users, students } from '../schema/identity.js';
import { organizations } from '../schema/organizations.js';
import type { Logger } from '../../../core/shared/ports.js';
import { noopLogger } from '../../../core/shared/logger.js';

export class DrizzleIdentityRepository implements IdentityRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly logger: Logger = noopLogger,
  ) {}

  async insertUser(input: RegisterUserInput): Promise<User> {
    const [row] = await this.db
      .insert(users)
      .values({
        externalId: input.externalId,
        email: input.email,
        displayName: input.displayName,
      })
      .returning();
    if (!row) {
      throw new Error('failed to insert user');
    }
    return row;
  }

  async findUserByExternalId(externalId: string): Promise<User | null> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.externalId, externalId))
      .limit(1);
    return row ?? null;
  }

  async insertStudent(input: RegisterStudentInput): Promise<Student> {
    const [row] = await this.db
      .insert(students)
      .values({
        orgId: input.orgId,
        externalId: input.externalId,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
      })
      .returning();
    if (!row) {
      throw new Error('failed to insert student');
    }
    return row;
  }

  async findStudentByExternalId(orgId: string, externalId: string): Promise<Student | null> {
    const [row] = await this.db
      .select()
      .from(students)
      .where(and(eq(students.orgId, orgId), eq(students.externalId, externalId)))
      .limit(1);
    return row ?? null;
  }

  // The org (as its better-auth external id) a login is a student in — for
  // stamping the portal org onto the session at login. Only resolves when the
  // externalId maps to exactly one student row (the common, single-org case).
  async findStudentOrgExternalId(externalId: string): Promise<string | null> {
    const rows = await this.db
      .select({ orgExternalId: organizations.externalId })
      .from(students)
      .innerJoin(organizations, eq(organizations.id, students.orgId))
      .where(eq(students.externalId, externalId))
      .limit(2);
    return rows.length === 1 ? (rows[0]?.orgExternalId ?? null) : null;
  }

  async findStudentByEmail(orgId: string, email: string): Promise<Student | null> {
    const [row] = await this.db
      .select()
      .from(students)
      .where(and(eq(students.orgId, orgId), eq(students.email, email)))
      .limit(1);
    return row ?? null;
  }

  async findStudentById(orgId: string, id: string): Promise<Student | null> {
    const [row] = await this.db
      .select()
      .from(students)
      .where(and(eq(students.orgId, orgId), eq(students.id, id)))
      .limit(1);
    return row ?? null;
  }

  async insertPendingStudent(input: CreateStudentInput): Promise<Student> {
    const [row] = await this.db
      .insert(students)
      .values({
        orgId: input.orgId,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
      })
      .returning();
    if (!row) {
      throw new Error('failed to insert student');
    }
    return row;
  }

  async setInviteIdByEmail(orgId: string, email: string, inviteId: string): Promise<void> {
    await this.db
      .update(students)
      .set({ inviteId })
      .where(and(eq(students.orgId, orgId), eq(students.email, email), isNull(students.externalId)));
  }

  // Link every still-pending row minted for this invite OR carrying the invited
  // email (resent tokens, one login across orgs). Pending guard makes it idempotent.
  async linkPendingStudents(inviteId: string, email: string, externalId: string): Promise<number> {
    const rows = await this.db
      .update(students)
      .set({ externalId, inviteId: null })
      .where(
        and(isNull(students.externalId), or(eq(students.inviteId, inviteId), eq(students.email, email))),
      )
      .returning({ id: students.id });
    return rows.length;
  }
}
