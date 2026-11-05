import type { ContentType, Level, OrgUserProfile, Permission } from '../types/index.js';

export type MemberStatus = 'active' | 'invited';

export interface ItemRole {
  contentId: string;
  contentType: ContentType;
  roleKey: string;
  roleName: string;
}

export interface Member extends OrgUserProfile {
  orgRole: { key: string; name: string };
  isOwner: boolean;
  items: ItemRole[];
  status: MemberStatus;
  joinedAt: string | null;
  invitedAt: string | null;
}

export interface MembersQuery {
  page: number;
  pageSize: number;
  search?: string | undefined;
  sort?: string | undefined;
  roleKey?: string | undefined;
  status?: MemberStatus | undefined;
}

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RoleView {
  key: string;
  name: string;
  description: string;
  base: string;
  levels: Level[];
  team: boolean;
  permissions: Permission[];
  system: boolean;
  added: boolean;
  customized: boolean;
  holders: number;
}

export interface UpdateRoleInput {
  name?: string | undefined;
  description?: string | undefined;
  levels?: Level[] | undefined;
  team?: boolean | undefined;
  permissions?: Partial<Record<Permission, boolean>> | undefined;
}

export interface CreateRoleInput {
  base: string;
  name: string;
  description?: string | undefined;
  levels?: Level[] | undefined;
  team?: boolean | undefined;
  permissions?: Partial<Record<Permission, boolean>> | undefined;
}

export interface AssignmentView {
  orgUserId: string;
  roleKey: string;
  roleName: string;
  contentId: string | null;
  contentType: ContentType | null;
}

export interface ViewerPermissions {
  orgRole: { key: string; name: string };
  isOwner: boolean;
  org: Permission[];
  content: Record<string, Permission[]>;
}

export class OrganizationRuleError extends Error {}
export class InviteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InviteError';
  }
}
