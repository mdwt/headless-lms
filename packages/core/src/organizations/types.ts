export type {
  OrganizationId,
  OrgUserId,
  InviteId,
  NewOrganizationInput,
  AddOrgUserInput,
  CreateInviteInput,
  AcceptInviteInput,
  CreateOrgUserInput,
  UpdateOrgUserInput,
  OrgUserStatus,
} from '../types/index.js';

export type { ProvisionUserInput } from '../types/index.js';

export interface CreateOrganizationInput {
  externalId?: string;
  name?: string;
  slug?: string;
  logo?: string;
  ownerId: string;
}

export interface UpdateOrganizationInput {
  name?: string | undefined;
  slug?: string | undefined;
}
