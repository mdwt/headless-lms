// OrgAdmin (organizations' member-write port) implemented over Better Auth's
// organization API. Member/invitation writes flow through Better Auth (the source
// of truth); its hooks mirror the change into the domain tables, which the
// organizations members repo reads.
import { fromNodeHeaders } from 'better-auth/node';
import { APIError } from 'better-auth/api';
import {
  OrganizationRuleError,
  type OrgAdmin,
  type MemberWriteContext,
  type Role,
  type InviteMemberInput,
  type NewOrganizationInput,
  type UpdateOrganizationInput,
  type AuthHeaders,
} from '../../core/organizations/index.js';
import type { Auth } from './index.js';
import { STUDENT_ROLE } from './invites.js';

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
      if (!org) {
        throw new Error('Better Auth did not return the created organization');
      }
      return { externalId: org.id };
    },
    async setActiveOrganization(headers: AuthHeaders, externalId: string): Promise<void> {
      await auth.api.setActiveOrganization({
        body: { organizationId: externalId },
        headers: fromNodeHeaders(headers),
      });
    },
    async updateOrganization(
      headers: AuthHeaders,
      externalId: string,
      input: UpdateOrganizationInput,
    ): Promise<void> {
      try {
        await auth.api.updateOrganization({
          body: { organizationId: externalId, data: { name: input.name, slug: input.slug } },
          headers: fromNodeHeaders(headers),
        });
      } catch (err) {
        // Surface Better Auth validation/permission failures (e.g. slug taken) as
        // a domain rule error the route maps to 409 rather than a raw 500.
        if (err instanceof APIError) {
          throw new OrganizationRuleError(err.message || 'Could not update organization');
        }
        throw err;
      }
    },
    async invite(ctx: MemberWriteContext, input: InviteMemberInput): Promise<void> {
      // One invite system for all populations: mint a better-invite invitation
      // (role = staff role); its afterCreateInvite hook mirrors it into the
      // domain, which the members list reads.
      await auth.api.createInvite({
        body: { email: input.email, role: input.role },
        headers: headersOf(ctx),
      });
    },
    async inviteStudent(ctx: MemberWriteContext, email: string): Promise<void> {
      // Same provider, student role: afterCreateInvite records the invite id on
      // the student row; sendUserInvitation emails the portal welcome link.
      await auth.api.createInvite({
        body: { email, role: STUDENT_ROLE },
        headers: headersOf(ctx),
      });
    },
    async grantMembership(
      orgExternalId: string,
      userExternalId: string,
      role: string,
    ): Promise<void> {
      // Server-side (no session): the accepted invitation is the authorisation.
      await auth.api.addMember({
        body: { userId: userExternalId, organizationId: orgExternalId, role },
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
  };
}
