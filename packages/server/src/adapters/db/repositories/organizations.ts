// organizations — Drizzle repository (implements the core outbound port).
import { eq, and } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { OrganizationsRepository } from "../../../core/organizations/ports.js";
import type {
  Organization,
  Membership,
  Invitation,
  CourseAssignment,
} from "../../../core/organizations/model.js";
import { parseRole, normalizeRole } from "../../../core/organizations/index.js";
import type {
  CreateOrganizationInput,
  UpdateOrganizationInput,
  AddMembershipInput,
  RecordInvitationInput,
  AssignCourseInput,
} from "../../../core/organizations/types.js";
import {
  organizations,
  memberships,
  invitations,
  courseAssignments,
} from "../schema/organizations.js";

const INVITATION_STATUSES = ["pending", "accepted", "rejected", "canceled"] as const;
type InvitationStatus = (typeof INVITATION_STATUSES)[number];
const toStatus = (s: string): InvitationStatus =>
  (INVITATION_STATUSES as readonly string[]).includes(s) ? (s as InvitationStatus) : "pending";

export class DrizzleOrganizationsRepository implements OrganizationsRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async create(input: CreateOrganizationInput): Promise<Organization> {
    const [row] = await this.db
      .insert(organizations)
      .values({
        externalId: input.externalId,
        name: input.name,
        slug: input.slug,
        ownerId: input.ownerId,
      })
      .returning();
    if (!row) throw new Error("failed to insert organization");
    return row;
  }

  async updateByExternalId(
    externalId: string,
    input: UpdateOrganizationInput,
  ): Promise<Organization | null> {
    const [row] = await this.db
      .update(organizations)
      .set({ name: input.name, slug: input.slug })
      .where(eq(organizations.externalId, externalId))
      .returning();
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

  async insertMembership(orgId: string, input: AddMembershipInput): Promise<Membership> {
    const [row] = await this.db
      .insert(memberships)
      .values({
        orgId,
        userId: input.userId,
        role: normalizeRole(input.role),
        externalId: input.externalId,
      })
      .onConflictDoNothing({ target: memberships.externalId })
      .returning();
    if (row) return { ...row, role: parseRole(row.role) };
    // Already mirrored (hook fired more than once) — return the existing row.
    const [existing] = await this.db
      .select()
      .from(memberships)
      .where(eq(memberships.externalId, input.externalId))
      .limit(1);
    if (!existing) throw new Error("failed to insert membership");
    return { ...existing, role: parseRole(existing.role) };
  }

  async deleteMembershipByExternalId(externalId: string): Promise<void> {
    await this.db.delete(memberships).where(eq(memberships.externalId, externalId));
  }

  async insertInvitation(orgId: string, input: RecordInvitationInput): Promise<Invitation> {
    const [row] = await this.db
      .insert(invitations)
      .values({
        orgId,
        email: input.email,
        role: normalizeRole(input.role),
        status: toStatus(input.status),
        invetedBy: input.inviterUserId,
        authInvitationId: input.authInvitationId,
        expiresAt: input.expiresAt,
      })
      .onConflictDoNothing({ target: invitations.authInvitationId })
      .returning();
    if (row) return row;
    const [existing] = await this.db
      .select()
      .from(invitations)
      .where(eq(invitations.authInvitationId, input.authInvitationId))
      .limit(1);
    if (!existing) throw new Error("failed to insert invitation");
    return existing;
  }

  async setInvitationStatusByAuthId(authInvitationId: string, status: string): Promise<void> {
    await this.db
      .update(invitations)
      .set({ status: toStatus(status) })
      .where(eq(invitations.authInvitationId, authInvitationId));
  }

  async insertCourseAssignment(orgId: string, input: AssignCourseInput): Promise<CourseAssignment> {
    const [row] = await this.db
      .insert(courseAssignments)
      .values({ orgId, membershipId: input.membershipId, courseId: input.courseId })
      .onConflictDoNothing()
      .returning();
    if (row) return row;
    const [existing] = await this.db
      .select()
      .from(courseAssignments)
      .where(
        and(
          eq(courseAssignments.orgId, orgId),
          eq(courseAssignments.membershipId, input.membershipId),
          eq(courseAssignments.courseId, input.courseId),
        ),
      )
      .limit(1);
    if (!existing) throw new Error("failed to insert course assignment");
    return existing;
  }

  async deleteCourseAssignment(
    orgId: string,
    membershipId: string,
    courseId: string,
  ): Promise<void> {
    await this.db
      .delete(courseAssignments)
      .where(
        and(
          eq(courseAssignments.orgId, orgId),
          eq(courseAssignments.membershipId, membershipId),
          eq(courseAssignments.courseId, courseId),
        ),
      );
  }

  async findAssignedCourseIds(orgId: string, membershipId: string): Promise<string[]> {
    const rows = await this.db
      .select({ courseId: courseAssignments.courseId })
      .from(courseAssignments)
      .where(
        and(eq(courseAssignments.orgId, orgId), eq(courseAssignments.membershipId, membershipId)),
      );
    return rows.map((r) => r.courseId);
  }

  async findMembershipByUser(userId: string): Promise<Membership | null> {
    // v1: a user is assumed to have a single membership; order by createdAt
    // for a deterministic result if more than one ever exists.
    const [row] = await this.db
      .select()
      .from(memberships)
      .where(eq(memberships.userId, userId))
      .orderBy(memberships.createdAt)
      .limit(1);
    return row ? { ...row, role: parseRole(row.role) } : null;
  }
}
