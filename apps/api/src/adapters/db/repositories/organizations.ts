// organizations — Drizzle repository (implements the core outbound port).
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { OrganizationsRepository } from "../../../core/organizations/ports.js";
import type { Organization, Membership, Invitation } from "../../../core/organizations/model.js";
import type {
  ProvisionOrganizationInput,
  AddMembershipInput,
  RecordInvitationInput,
} from "../../../core/organizations/types.js";
import { organizations, memberships, invitations } from "../schema/organizations.js";

export class DrizzleOrganizationsRepository implements OrganizationsRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async insertOrganization(input: ProvisionOrganizationInput): Promise<Organization> {
    const [row] = await this.db
      .insert(organizations)
      .values({
        authOrgId: input.authOrgId,
        name: input.name,
        slug: input.slug,
        ownerStudentId: input.ownerStudentId,
      })
      .returning();
    if (!row) throw new Error("failed to insert organization");
    return row;
  }

  async findByAuthOrgId(authOrgId: string): Promise<Organization | null> {
    const [row] = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.authOrgId, authOrgId))
      .limit(1);
    return row ?? null;
  }

  async insertMembership(orgId: string, input: AddMembershipInput): Promise<Membership> {
    const [row] = await this.db
      .insert(memberships)
      .values({
        orgId,
        studentId: input.studentId,
        role: input.role,
        authMemberId: input.authMemberId,
      })
      .onConflictDoNothing({ target: memberships.authMemberId })
      .returning();
    if (row) return row;
    // Already mirrored (hook fired more than once) — return the existing row.
    const [existing] = await this.db
      .select()
      .from(memberships)
      .where(eq(memberships.authMemberId, input.authMemberId))
      .limit(1);
    if (!existing) throw new Error("failed to insert membership");
    return existing;
  }

  async deleteMembershipByAuthMemberId(authMemberId: string): Promise<void> {
    await this.db.delete(memberships).where(eq(memberships.authMemberId, authMemberId));
  }

  async insertInvitation(orgId: string, input: RecordInvitationInput): Promise<Invitation> {
    const [row] = await this.db
      .insert(invitations)
      .values({
        orgId,
        email: input.email,
        role: input.role,
        status: input.status,
        inviterStudentId: input.inviterStudentId,
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
      .set({ status })
      .where(eq(invitations.authInvitationId, authInvitationId));
  }
}
