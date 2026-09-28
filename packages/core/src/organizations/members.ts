// organizations context — member-management types (invite / change-role / remove).
// The operational surface over the org's members and pending invites. Roles
// come from ./roles.ts (the single role model); writes go through Better Auth.
import type { StaffRole } from './roles.js';
import type { OrgUserProfile } from '../types/index.js';

export type MemberStatus = 'active' | 'invited';

export interface Member extends OrgUserProfile {
  role: StaffRole;
  status: MemberStatus;
  joinedAt: string | null;
  invitedAt: string | null;
}

export interface MembersQuery {
  page: number;
  pageSize: number;
  search?: string | undefined;
  sort?: string | undefined;
  role?: StaffRole | undefined;
  status?: MemberStatus | undefined;
}

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export class OrganizationRuleError extends Error {}
export class InviteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InviteError';
  }
}
