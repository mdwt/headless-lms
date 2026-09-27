// organizations — Drizzle repository (implements the core outbound port).
import { and, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  parseRole,
  type CreateOrgUserInput,
  type Invite,
  type NewInviteRow,
  type NewOrganizationRow,
  type Organization,
  type OrganizationsRepository,
  type OrgUser,
  type UpdateOrganizationInput,
  type UpdateOrgUserInput,
} from '@headless-lms/core/organizations';
import { invites, organizations, orgUsers } from '../schema/organizations.js';
import type { Logger } from '@headless-lms/core/shared/ports';
import { noopLogger } from '@headless-lms/core/shared/logger';
import { ConflictError } from '@headless-lms/core/shared/errors';
import { isUniqueViolation, translateDbErrors } from './pg-errors.js';

const INVITE_STATUSES = ['pending', 'accepted', 'rejected', 'canceled'] as const;
type InviteStatus = (typeof INVITE_STATUSES)[number];
const toStatus = (s: string): InviteStatus =>
  (INVITE_STATUSES as readonly string[]).includes(s) ? (s as InviteStatus) : 'pending';

function toInvite(row: typeof invites.$inferSelect): Invite {
  return {
    id: row.id,
    orgId: row.orgId,
    email: row.email,
    role: row.role,
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
      throw new Error('failed to insert organization');
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
      throw new Error('failed to delete organization');
    }
    return row;
  }

  async findById(id: string): Promise<Organization | null> {
    const [row] = await this.db.select().from(organizations).where(eq(organizations.id, id));
    return row ?? null;
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
        role: input.role,
        status: 'pending',
        invitedBy: input.invitedBy,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      })
      .onConflictDoUpdate({
        target: [invites.orgId, invites.email],
        targetWhere: sql`${invites.status} = 'pending'`,
        set: {
          role: input.role,
          invitedBy: input.invitedBy,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
        },
      })
      .returning();
    if (!row) {
      throw new Error('failed to upsert invite');
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
          eq(invites.status, 'pending'),
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
  ): Promise<Invite | null> {
    const [row] = await this.db
      .update(invites)
      .set({ tokenHash, expiresAt })
      .where(and(eq(invites.orgId, orgId), eq(invites.id, id), eq(invites.status, 'pending')))
      .returning();
    return row ? toInvite(row) : null;
  }

  async findOrgUser(orgId: string, userId: string): Promise<OrgUser | null> {
    const [row] = await this.db
      .select()
      .from(orgUsers)
      .where(and(eq(orgUsers.orgId, orgId), eq(orgUsers.userId, userId)))
      .limit(1);
    return row ? { ...row, role: parseRole(row.role) } : null;
  }

  async findOrgUsersByUser(userId: string): Promise<OrgUser[]> {
    const rows = await this.db
      .select()
      .from(orgUsers)
      .where(eq(orgUsers.userId, userId))
      .orderBy(orgUsers.createdAt);
    return rows.map((row) => ({ ...row, role: parseRole(row.role) }));
  }

  async findOrgUserById(orgId: string, id: string): Promise<OrgUser | null> {
    const [row] = await this.db
      .select()
      .from(orgUsers)
      .where(and(eq(orgUsers.orgId, orgId), eq(orgUsers.id, id)))
      .limit(1);
    return row ? { ...row, role: parseRole(row.role) } : null;
  }

  async createOrgUser(input: CreateOrgUserInput): Promise<OrgUser> {
    try {
      const [row] = await this.db
        .insert(orgUsers)
        .values({
          orgId: input.orgId,
          userId: input.userId,
          role: input.role,
          status: input.status ?? 'active',
        })
        .returning();
      if (!row) {
        throw new Error('failed to insert org user');
      }
      return { ...row, role: parseRole(row.role) };
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError('That account already belongs to this organization');
      }
      throw err;
    }
  }

  async updateOrgUser(orgId: string, id: string, patch: UpdateOrgUserInput): Promise<OrgUser | null> {
    const [row] = await this.db
      .update(orgUsers)
      .set({
        ...(patch.role !== undefined && { role: patch.role }),
        ...(patch.status !== undefined && { status: patch.status }),
      })
      .where(and(eq(orgUsers.orgId, orgId), eq(orgUsers.id, id)))
      .returning();
    return row ? { ...row, role: parseRole(row.role) } : null;
  }

  async findStudentOrgUsers(userId: string): Promise<OrgUser[]> {
    const rows = await this.db
      .select()
      .from(orgUsers)
      .where(and(eq(orgUsers.userId, userId), eq(orgUsers.role, 'student')))
      .orderBy(orgUsers.createdAt);
    return rows.map((row) => ({ ...row, role: parseRole(row.role) }));
  }

  async cancelPendingInvite(orgId: string, email: string): Promise<Invite | null> {
    const [row] = await this.db
      .update(invites)
      .set({ status: 'canceled' })
      .where(
        and(
          eq(invites.orgId, orgId),
          sql`lower(${invites.email}) = lower(${email})`,
          eq(invites.status, 'pending'),
        ),
      )
      .returning();
    return row ? toInvite(row) : null;
  }

  async deleteOrgUser(orgId: string, id: string): Promise<OrgUser | null> {
    const [row] = await this.db
      .delete(orgUsers)
      .where(and(eq(orgUsers.orgId, orgId), eq(orgUsers.id, id)))
      .returning();

    return row ?? null;
  }
}
translateDbErrors(DrizzleOrganizationsRepository);
