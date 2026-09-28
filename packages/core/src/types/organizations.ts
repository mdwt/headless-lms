export type {
  Organization,
  OrganizationInput,
  OrgUser,
  OrgUserInput,
  Invite,
  InviteInput,
  Role,
  OrgUserProfile,
  OrgUserStatus,
  InviteRole,
  NewOrganizationInput,
  AddOrgUserInput,
  CreateOrgUserInput,
  UpdateOrgUserInput,
  CreateInviteInput,
  AcceptInviteInput,
} from './schemas/organizations.js';

export type OrganizationId = string;
export type OrgUserId = string;
export type InviteId = string;

export interface CreateOrganizationInput {
  externalId?: string;
  name?: string;
  slug?: string;
  logo?: string;
  ownerId: string;
}
