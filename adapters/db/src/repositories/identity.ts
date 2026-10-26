// identity — Drizzle repository (implements the core outbound port).
//
// The person only. A person's link to an organization lives in the
// organizations context (`org_users`), not here.
import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { IdentityRepository, ProfilePatch } from "@headless-lms/core/identity";
import type {
  CreateUserInput,
  Logger,
  UpdateUserInput,
  User,
  UserProfile,
} from "@headless-lms/core/types";
import { userProfiles, users } from "../schema/identity.js";
import { noopLogger } from "@headless-lms/core/shared/logger";
import { translateDbErrors } from "./pg-errors.js";

export class DrizzleIdentityRepository implements IdentityRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly logger: Logger = noopLogger,
  ) {}

  async insertUser(input: CreateUserInput): Promise<User> {
    const [row] = await this.db
      .insert(users)
      .values({
        id: input.id,
        externalId: input.externalId ?? null,
        email: input.email,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
      })
      .returning();
    if (!row) {
      throw new Error("failed to insert user");
    }
    return row;
  }

  async updateUser(id: string, input: UpdateUserInput): Promise<User | null> {
    // An empty patch would be an UPDATE with no SET — read the row back instead.
    if (Object.keys(input).length === 0) {
      return this.findUserById(id);
    }
    const [row] = await this.db.update(users).set(input).where(eq(users.id, id)).returning();
    return row ?? null;
  }

  async findUserById(id: string): Promise<User | null> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ?? null;
  }

  async findUserByExternalId(externalId: string): Promise<User | null> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.externalId, externalId))
      .limit(1);
    return row ?? null;
  }

  // Case-insensitive: the address comes from whatever an admin typed into an
  // invite, the row from whatever the auth provider stored.
  async findUserByEmail(email: string): Promise<User | null> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = lower(${email})`)
      .limit(1);
    return row ?? null;
  }

  async findProfile(userId: string): Promise<UserProfile | null> {
    const [row] = await this.db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);
    return row ?? null;
  }

  async upsertProfile(userId: string, patch: ProfilePatch): Promise<UserProfile> {
    const existing = await this.findProfile(userId);
    if (!existing) {
      const [row] = await this.db
        .insert(userProfiles)
        .values({
          userId,
          displayName: patch.displayName ?? null,
          headline: patch.headline ?? null,
          bio: patch.bio ?? null,
          imageAssetOrgId: patch.imageAssetOrgId ?? null,
          imageAssetId: patch.imageAssetId ?? null,
          extra: patch.extra ?? {},
        })
        .returning();
      if (!row) {
        throw new Error("failed to insert profile");
      }
      return row;
    }
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.displayName !== undefined) {
      set.displayName = patch.displayName;
    }
    if (patch.headline !== undefined) {
      set.headline = patch.headline;
    }
    if (patch.bio !== undefined) {
      set.bio = patch.bio;
    }
    if (patch.imageAssetOrgId !== undefined) {
      set.imageAssetOrgId = patch.imageAssetOrgId;
      set.imageAssetId = patch.imageAssetId;
    }
    if (patch.extra !== undefined) {
      set.extra = patch.extra;
    }
    const [row] = await this.db
      .update(userProfiles)
      .set(set)
      .where(eq(userProfiles.userId, userId))
      .returning();
    if (!row) {
      throw new Error("failed to update profile");
    }
    return row;
  }
}
translateDbErrors(DrizzleIdentityRepository);
