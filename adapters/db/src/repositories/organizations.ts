// organizations — Drizzle repository (implements the core outbound port).
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type {
  CreateOrgUserInput,
  Invite,
  NewInviteRow,
  NewOrganizationRow,
  Organization,
  OrganizationMetadata,
  OrganizationsRepository,
  OrgUser,
  UpdateOrganizationInput,
  UpdateOrgUserInput,
} from "@headless-lms/core/organizations";
import type { App, UpdateAppInput } from "@headless-lms/core/types";
import { apps, invites, organizations, orgUsers } from "../schema/organizations.js";
import type { Logger } from "@headless-lms/core/shared/ports";
import { noopLogger } from "@headless-lms/core/shared/logger";
import { ConflictError, InvalidInputError } from "@headless-lms/core/shared/errors";
import { isUniqueViolation, pgErrorFields, translateDbErrors } from "./pg-errors.js";

const APP_TAKEN: Record<string, { code: string; message: string }> = {
  apps_domain_uq: { code: "domain_taken", message: "That domain is already in use" },
  apps_org_slug_uq: { code: "slug_taken", message: "That slug is already in use" },
  apps_courses_uq: {
    code: "courses_taken",
    message: "The organization already has an app that serves courses",
  },
  apps_community_uq: {
    code: "community_taken",
    message: "The organization already has an app that serves the community",
  },
};

function refusedApp(err: unknown): unknown {
  const pg = pgErrorFields(err);
  if (pg?.code === "23514" && pg.constraint === "apps_serves_ck") {
    return Object.assign(new InvalidInputError("An app serves courses, the community, or both"), {
      cause: err,
    });
  }
  const taken = pg?.code === "23505" && pg.constraint ? APP_TAKEN[pg.constraint] : undefined;
  return taken ? Object.assign(new ConflictError(taken.message, taken.code), { cause: err }) : err;
}

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

  async setMetadata(id: string, metadata: OrganizationMetadata): Promise<Organization> {
    const [row] = await this.db
      .update(organizations)
      .set({ metadata })
      .where(eq(organizations.id, id))
      .returning();
    if (!row) {
      throw new Error("failed to update organization");
    }
    return row;
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

  async createApp(app: App): Promise<App> {
    try {
      const [row] = await this.db.insert(apps).values(app).returning();
      if (!row) {
        throw new Error("failed to insert app");
      }
      return row;
    } catch (err) {
      throw refusedApp(err);
    }
  }

  async listApps(orgId: string): Promise<App[]> {
    return this.db
      .select()
      .from(apps)
      .where(eq(apps.orgId, orgId))
      .orderBy(desc(apps.courses), asc(apps.id));
  }

  async findAppByDomain(domain: string): Promise<App | null> {
    const [row] = await this.db.select().from(apps).where(eq(apps.domain, domain)).limit(1);
    return row ?? null;
  }

  async updateApp(orgId: string, id: string, patch: UpdateAppInput): Promise<App | null> {
    const changes = {
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.slug !== undefined && { slug: patch.slug }),
      ...(patch.domain !== undefined && { domain: patch.domain }),
      ...(patch.courses !== undefined && { courses: patch.courses }),
      ...(patch.community !== undefined && { community: patch.community }),
    };
    if (Object.keys(changes).length === 0) {
      const [row] = await this.db
        .select()
        .from(apps)
        .where(and(eq(apps.orgId, orgId), eq(apps.id, id)))
        .limit(1);
      return row ?? null;
    }
    try {
      const [row] = await this.db
        .update(apps)
        .set(changes)
        .where(and(eq(apps.orgId, orgId), eq(apps.id, id)))
        .returning();
      return row ?? null;
    } catch (err) {
      throw refusedApp(err);
    }
  }

  async deleteApp(orgId: string, id: string): Promise<App | null> {
    const [row] = await this.db
      .delete(apps)
      .where(and(eq(apps.orgId, orgId), eq(apps.id, id)))
      .returning();
    return row ?? null;
  }
}
translateDbErrors(DrizzleOrganizationsRepository);
