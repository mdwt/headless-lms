// identity — Drizzle repository (implements the core outbound port).
import { and, eq, isNull } from 'drizzle-orm';
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
import { progressRecords } from '../schema/progress.js';
import type { Logger } from '../../../core/shared/ports.js';
import { noopLogger } from '../../../core/shared/logger.js';
import { ConflictError } from '../../../core/shared/errors.js';

// Postgres unique_violation. The node-postgres driver sometimes wraps the
// original error (e.g. behind `cause`), so check both levels.
function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: unknown } | undefined)?.code;
  if (code === '23505') {
    return true;
  }
  const cause = (err as { cause?: unknown } | undefined)?.cause;
  const causeCode = (cause as { code?: unknown } | undefined)?.code;
  return causeCode === '23505';
}

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
    try {
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
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError('A student with this email already exists');
      }
      throw err;
    }
  }

  async deleteStudent(orgId: string, id: string): Promise<boolean> {
    // progress_records carries no student FK (denormalized by design), so its
    // rows are removed here; entitlements cascade off the students FK.
    await this.db
      .delete(progressRecords)
      .where(and(eq(progressRecords.orgId, orgId), eq(progressRecords.studentId, id)));
    const rows = await this.db
      .delete(students)
      .where(and(eq(students.orgId, orgId), eq(students.id, id)))
      .returning({ id: students.id });
    return rows.length > 0;
  }

  async linkPendingStudent(orgId: string, email: string, externalId: string): Promise<number> {
    const rows = await this.db
      .update(students)
      .set({ externalId })
      .where(and(eq(students.orgId, orgId), eq(students.email, email), isNull(students.externalId)))
      .returning({ id: students.id });
    return rows.length;
  }
}
