// OrgAdmin (organizations' member-write port) implemented over Better Auth's
// organization API. Member/invitation writes flow through Better Auth (the source
// of truth); its hooks mirror the change into the domain tables, which the
// organizations members repo reads.
import { fromNodeHeaders } from "better-auth/node";
import type {
  OrgAdmin,
  MemberWriteContext,
  Role,
  InviteMemberInput,
  NewOrganizationInput,
  AuthHeaders,
} from "../../core/organizations/index.js";
import type { Auth } from "./index.js";

export function createOrgAdmin(auth: Auth): OrgAdmin {
  const headersOf = (ctx: MemberWriteContext) => fromNodeHeaders(ctx.headers);
  return {
    async createOrganization(
      headers: AuthHeaders,
      input: NewOrganizationInput,
    ): Promise<{ externalId: string }> {
      const org = await auth.api.createOrganization({
        body: { name: input.name, slug: input.slug },
        headers: fromNodeHeaders(headers),
      });
      if (!org) throw new Error("Better Auth did not return the created organization");
      return { externalId: org.id };
    },
    async setActiveOrganization(headers: AuthHeaders, externalId: string): Promise<void> {
      await auth.api.setActiveOrganization({
        body: { organizationId: externalId },
        headers: fromNodeHeaders(headers),
      });
    },
    async invite(ctx: MemberWriteContext, input: InviteMemberInput): Promise<void> {
      await auth.api.createInvitation({
        body: { email: input.email, role: input.role, organizationId: ctx.authOrgId },
        headers: headersOf(ctx),
      });
    },
    async updateRole(ctx: MemberWriteContext, authMemberId: string, role: Role): Promise<void> {
      await auth.api.updateMemberRole({
        body: { memberId: authMemberId, role, organizationId: ctx.authOrgId },
        headers: headersOf(ctx),
      });
    },
    async removeMember(ctx: MemberWriteContext, authMemberId: string): Promise<void> {
      await auth.api.removeMember({
        body: { memberIdOrEmail: authMemberId, organizationId: ctx.authOrgId },
        headers: headersOf(ctx),
      });
    },
    async cancelInvitation(ctx: MemberWriteContext, authInvitationId: string): Promise<void> {
      await auth.api.cancelInvitation({
        body: { invitationId: authInvitationId },
        headers: headersOf(ctx),
      });
    },
  };
}
