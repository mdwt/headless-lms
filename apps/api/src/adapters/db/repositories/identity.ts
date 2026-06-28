// identity — Drizzle repository (implements the core outbound port).
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { IdentityRepository } from "../../../core/identity/ports.js";
import type { Student } from "../../../core/identity/model.js";
import type { RegisterStudentInput } from "../../../core/identity/types.js";
import { students } from "../schema/identity.js";

export class DrizzleIdentityRepository implements IdentityRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async insert(input: RegisterStudentInput): Promise<Student> {
    const [row] = await this.db
      .insert(students)
      .values({
        authUserId: input.authUserId,
        email: input.email,
        displayName: input.displayName,
      })
      .returning();
    if (!row) throw new Error("failed to insert student");
    return row;
  }

  async findByAuthUserId(authUserId: string): Promise<Student | null> {
    const [row] = await this.db
      .select()
      .from(students)
      .where(eq(students.authUserId, authUserId))
      .limit(1);
    return row ?? null;
  }
}
