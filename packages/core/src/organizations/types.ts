// organizations context — DTOs, owned by @headless-lms/core/types.
import type { Organization } from '../types/index.js';

export type {
  OrganizationId,
  OrgUserId,
  InviteId,
  NewOrganizationInput,
  AddOrgUserInput,
  CreateInviteInput,
  AcceptInviteInput,
  InviteRole,
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

export type UpdateOrganizationInput = Partial<Omit<Organization, 'createdAt,updatedAt'>>;

export interface LinkOrgUserInput {
  orgId: string;
  userId: string;
  role: string;
}

export interface UnlinkOrgUserInput {
  orgExternalId: string;
  userExternalId: string;
}

export interface UpdatePersonInput {
  firstName?: string;
  lastName?: string;
  email?: string;
}

export interface UpdateStudentInput extends UpdatePersonInput {
  orgId: string;
  orgUserId: string;
}

export interface ResendStudentInviteInput {
  orgId: string;
  orgUserId: string;
  inviterUserId: string;
}
