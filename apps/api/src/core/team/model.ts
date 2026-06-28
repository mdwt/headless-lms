// team context — org members. Framework-free.

export type Role = "owner" | "admin" | "instructor" | "student";
export type MemberStatus = "active" | "invited";

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

/** Raised when an action violates a team rule (e.g. reassigning the owner). */
export class TeamRuleError extends Error {}
