// organizations context — service implementation (inbound port).
import type { OrganizationService, OrganizationsRepository } from "./ports.js";
import type { Organization, Membership, Invitation } from "./model.js";
import type {
  ProvisionOrganizationInput,
  AddMembershipInput,
  RecordInvitationInput,
  AcceptInvitationInput,
} from "./types.js";

export class OrganizationServiceImpl implements OrganizationService {
  constructor(private readonly repo: OrganizationsRepository) {}

  async provisionOrganization(input: ProvisionOrganizationInput): Promise<Organization> {
    const existing = await this.repo.findByAuthOrgId(input.authOrgId);
    if (existing) return existing;
    return this.repo.insertOrganization(input);
  }

  async addMembership(input: AddMembershipInput): Promise<Membership> {
    const org = await this.requireOrg(input.authOrgId);
    return this.repo.insertMembership(org.id, input);
  }

  async removeMembership(authMemberId: string): Promise<void> {
    await this.repo.deleteMembershipByAuthMemberId(authMemberId);
  }

  async recordInvitation(input: RecordInvitationInput): Promise<Invitation> {
    const org = await this.requireOrg(input.authOrgId);
    return this.repo.insertInvitation(org.id, input);
  }

  async acceptInvitation(input: AcceptInvitationInput): Promise<void> {
    await this.repo.setInvitationStatusByAuthId(input.authInvitationId, "accepted");
  }

  async getByAuthOrgId(authOrgId: string): Promise<Organization | null> {
    return this.repo.findByAuthOrgId(authOrgId);
  }

  private async requireOrg(authOrgId: string): Promise<Organization> {
    const org = await this.repo.findByAuthOrgId(authOrgId);
    if (!org) throw new Error(`unknown organization for authOrgId ${authOrgId}`);
    return org;
  }
}
