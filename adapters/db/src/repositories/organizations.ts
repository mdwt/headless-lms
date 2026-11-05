// organizations — Drizzle repository (implements the core outbound port).
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type {
  CreateOrgUserInput,
  Invite,
  NewInviteRow,
  NewOrganizationRow,
  Organization,
  OrganizationsRepository,
  OrgUser,
  UpdateOrganizationInput,
  UpdateOrgUserInput,
} from "@headless-lms/core/organizations";
import { invites, organizations, orgUsers } from "../schema/organizations.js";
import type { Logger } from "@headless-lms/core/shared/ports";
import { noopLogger } from "@headless-lms/core/shared/logger";
import { ConflictError } from "@headless-lms/core/shared/errors";
import { isUniqueViolation, pgErrorFields, translateDbErrors } from "./pg-errors.js";

const INVITE_STATUSES = ["pending", "accepted", "rejected", "canceled"] as const;
type InviteStatus = (typeof INVITE_STATUSES)[number];
const toStatus = (s: string): InviteStatus =>
  (INVITE_STATUSES as readonly string[]).includes(s) ? (s as InviteStatus) : "pending";

function toInvite(row: typeof invites.$inferSelect): Invite {
  return {
    id: row.id,
    orgId: row.orgId,
    email: row.email,
    roleKey: row.roleKey,
    status: row.status,
    invitedBy: row.invitedBy,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleOrganizationsRepository implements OrganizationsRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly logger: Logger = noopLogger,
  ) {}

  async create(input: NewOrganizationRow): Promise<Organization> {
    const [row] = await this.db
      .insert(organizations)
      .values({
        externalId: input.externalId,
        name: input.name,
        slug: input.slug,
        ownerId: input.ownerId,
        id: input.id,
      })
      .returning();
    if (!row) {
      throw new Error("failed to insert organization");
    }
    return row!;
  }

  async update(id: string, input: UpdateOrganizationInput): Promise<Organization | null> {
    const [row] = await this.db
      .update(organizations)
      .set({ name: input.name, slug: input.slug })
      .where(eq(organizations.id, id))
      .returning();
    return row ?? null;
  }

  async delete(id: string): Promise<Organization> {
    const [row] = await this.db.delete(organizations).where(eq(organizations.id, id)).returning();

    if (!row) {
      throw new Error("failed to delete organization");
    }
    return row;
  }

  async findById(id: string): Promise<Organization | null> {
    const [row] = await this.db.select().from(organizations).where(eq(organizations.id, id));
    return row ?? null;
  }

  async listIds(): Promise<string[]> {
    const rows = await this.db
      .select({ id: organizations.id })
      .from(organizations)
      .orderBy(asc(organizations.id));
    return rows.map((row) => row.id);
  }

  async findByExternalId(externalId: string): Promise<Organization | null> {
    const [row] = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.externalId, externalId))
      .limit(1);
    return row ?? null;
  }

  async findBySlug(slug: string): Promise<Organization | null> {
    const [row] = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);
    return row ?? null;
  }

  async upsertPendingInvite(orgId: string, input: NewInviteRow): Promise<Invite> {
    const [row] = await this.db
      .insert(invites)
      .values({
        orgId,
        email: input.email,
        roleKey: input.roleKey,
        status: "pending",
        invitedBy: input.invitedBy,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      })
      .onConflictDoUpdate({
        target: [invites.orgId, invites.email],
        targetWhere: sql`${invites.status} = 'pending'`,
        set: {
          roleKey: input.roleKey,
          invitedBy: input.invitedBy,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
        },
      })
      .returning();
    if (!row) {
      throw new Error("failed to upsert invite");
    }
    return toInvite(row);
  }

  async setInviteStatus(orgId: string, id: string, status: string): Promise<Invite | null> {
    const [row] = await this.db
      .update(invites)
      .set({ status: toStatus(status) })
      .where(and(eq(invites.orgId, orgId), eq(invites.id, id)))
      .returning();
    return row ? toInvite(row) : null;
  }

  async setInviteRole(
    orgId: string,
    id: string,
    roleKey: string,
    invitedBy: string,
  ): Promise<Invite | null> {
    const [row] = await this.db
      .update(invites)
      .set({ roleKey, invitedBy })
      .where(and(eq(invites.orgId, orgId), eq(invites.id, id), eq(invites.status, "pending")))
      .returning();
    return row ? toInvite(row) : null;
  }

  async findInviteByTokenHash(tokenHash: string): Promise<Invite | null> {
    const [row] = await this.db
      .select()
      .from(invites)
      .where(eq(invites.tokenHash, tokenHash))
      .limit(1);
    return row ? toInvite(row) : null;
  }

  async findPendingInvite(orgId: string, email: string): Promise<Invite | null> {
    const [row] = await this.db
      .select()
      .from(invites)
      .where(
        and(
          eq(invites.orgId, orgId),
          sql`lower(${invites.email}) = lower(${email})`,
          eq(invites.status, "pending"),
        ),
      )
      .limit(1);
    return row ? toInvite(row) : null;
  }

  async setInviteToken(
    orgId: string,
    id: string,
    tokenHash: string,
    expiresAt: Date,
    invitedBy: string,
  ): Promise<Invite | null> {
    const [row] = await this.db
      .update(invites)
      .set({ tokenHash, expiresAt, invitedBy })
      .where(and(eq(invites.orgId, orgId), eq(invites.id, id), eq(invites.status, "pending")))
      .returning();
    return row ? toInvite(row) : null;
  }

  async findOrgUser(orgId: string, userId: string): Promise<OrgUser | null> {
    const [row] = await this.db
      .select()
      .from(orgUsers)
      .where(and(eq(orgUsers.orgId, orgId), eq(orgUsers.userId, userId)))
      .limit(1);
    return row ?? null;
  }

  async findOrgUsersByUser(userId: string): Promise<OrgUser[]> {
    const rows = await this.db
      .select()
      .from(orgUsers)
      .where(eq(orgUsers.userId, userId))
      .orderBy(orgUsers.createdAt);
    return rows;
  }

  async findOrgUserById(orgId: string, id: string): Promise<OrgUser | null> {
    const [row] = await this.db
      .select()
      .from(orgUsers)
      .where(and(eq(orgUsers.orgId, orgId), eq(orgUsers.id, id)))
      .limit(1);
    return row ?? null;
  }

  async findOrgUsersByIds(orgId: string, ids: string[]): Promise<OrgUser[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.db
      .select()
      .from(orgUsers)
      .where(and(eq(orgUsers.orgId, orgId), inArray(orgUsers.id, ids)));
    return rows;
  }

  async createOrgUser(input: CreateOrgUserInput): Promise<OrgUser> {
    try {
      const [row] = await this.db
        .insert(orgUsers)
        .values({
          orgId: input.orgId,
          userId: input.userId,
          status: input.status ?? "active",
        })
        .returning();
      if (!row) {
        throw new Error("failed to insert org user");
      }
      return row;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError("That account already belongs to this organization");
      }
      throw err;
    }
  }

  async updateOrgUser(
    orgId: string,
    id: string,
    patch: UpdateOrgUserInput,
  ): Promise<OrgUser | null> {
    const [row] = await this.db
      .update(orgUsers)
      .set({
        ...(patch.status !== undefined && { status: patch.status }),
      })
      .where(and(eq(orgUsers.orgId, orgId), eq(orgUsers.id, id)))
      .returning();
    return row ?? null;
  }

  async deleteOrgUser(orgId: string, id: string): Promise<OrgUser | null> {
    try {
      const [row] = await this.db
        .delete(orgUsers)
        .where(and(eq(orgUsers.orgId, orgId), eq(orgUsers.id, id)))
        .returning();
      return row ?? null;
    } catch (err) {
      if (pgErrorFields(err)?.code === "23503") {
        throw Object.assign(
          new ConflictError(
            "This person has written posts, comments or messages and cannot be deleted",
          ),
          { cause: err },
        );
      }
      throw err;
    }
  }
}
translateDbErrors(DrizzleOrganizationsRepository);
