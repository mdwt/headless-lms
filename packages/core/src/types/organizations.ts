export type {
  Organization,
  OrganizationInput,
  OrganizationMetadata,
  OrgUser,
  OrgUserInput,
  Invite,
  InviteInput,
  OrgUserProfile,
  OrgUserStatus,
  NewOrganizationInput,
  AddOrgUserInput,
  CreateOrgUserInput,
  UpdateOrgUserInput,
  CreateInviteInput,
  Hosts,
  AcceptInviteInput,
  Level,
  Permission,
  RoleKey,
  OrgRoleRow,
  RoleAssignment,
} from './schemas/organizations.js';

export type ContentId = string;

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
