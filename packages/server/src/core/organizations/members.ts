// organizations context — member-management types (invite / change-role / remove).
// The operational surface over the org's members and pending invitations. Roles
// come from ./roles.ts (the single role model); writes go through Better Auth.
import type { Role } from './roles.js';

export type MemberStatus = 'active' | 'invited';

export interface Member {
  readonly id: string;
  name: string;
  email: string;
  image?: string | null;
  role: Role;
  status: MemberStatus;
  joinedAt: string | null;
  invitedAt: string | null;
}

export interface MembersQuery {
  page: number;
  pageSize: number;
  search?: string | undefined;
  sort?: string | undefined;
  role?: Role | undefined;
  status?: MemberStatus | undefined;
}

export interface InviteMemberInput {
  email: string;
  role: Role;
}

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Raised when an action violates a member-management rule (e.g. reassigning the
 *  owner). Surfaces at the HTTP boundary as 409 Conflict. */
export class OrganizationRuleError extends Error {}
