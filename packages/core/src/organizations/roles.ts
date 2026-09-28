// organizations context — roles and the authorization matrix.
// Defined in code (no DB enum). The DB stores role as text; the domain narrows
// it to Role and answers authorization questions here. The Role type itself is
// owned by @headless-lms/core/types; RANK/MATRIX below are Record<Role, …>, so the
// compiler forces this file to cover every role the published type declares.
import type { Role } from '../types/index.js';

export type { Role };
export const ROLES = ['owner', 'admin', 'instructor', 'student'] as const satisfies readonly Role[];

/**
 * The roles that operate the back office. `student` belongs to the org but
 * never appears on a staff surface, so the member-management types are typed
 * with this narrower union — the exclusion is a compiler guarantee, not a
 * convention a query has to remember.
 */
export type StaffRole = Exclude<Role, 'student'>;
export const STAFF_ROLES = ['owner', 'admin', 'instructor'] as const satisfies readonly StaffRole[];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function isStaffRole(value: string): value is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(value);
}

export function parseRole(value: string): Role {
  if (!isRole(value)) {
    throw new Error(`unknown role: ${value}`);
  }
  return value;
}

export type Permission =
  | 'manage_billing'
  | 'manage_org_settings'
  | 'manage_users'
  | 'create_course'
  | 'edit_assigned_course'
  | 'view_student_progress'
  | 'consume_content';

// Unconditional (true), course-scoped ("assigned"), or enrollment-scoped
// ("enrolled" — access owned by entitlements). Absent ⇒ denied.
//
// "assigned" is a granted-but-narrowed answer: the role holds the permission,
// but only over some subset of courses. Nothing narrows it today — there is no
// course-assignment store — so callers must decide what a narrowed grant means
// for them. `authorize` treats it as denied; `tools.ts` treats it as granted.
export type Capability = true | 'assigned' | 'enrolled';

const MATRIX: Record<Role, Partial<Record<Permission, Capability>>> = {
  owner: {
    manage_billing: true,
    manage_org_settings: true,
    manage_users: true,
    create_course: true,
    edit_assigned_course: true,
    view_student_progress: true,
  },
  admin: {
    manage_org_settings: true,
    manage_users: true,
    create_course: true,
    edit_assigned_course: true,
    view_student_progress: true,
  },
  instructor: {
    edit_assigned_course: 'assigned',
    view_student_progress: 'assigned',
  },
  // A learner belongs to the org to consume content they hold an
  // entitlement for. No management capability of any kind.
  student: {
    consume_content: 'enrolled',
  },
};

export function capability(role: Role, permission: Permission): Capability | false {
  return MATRIX[role][permission] ?? false;
}

// Better Auth's role model is broader than ours: it keeps a built-in `member`
// role and allows comma-joined multi-role strings. Normalize any incoming role
// string to a single domain Role before persisting: `member` -> `instructor`, a
// multi-role string -> its highest-privilege known role, unknown -> `instructor`.
const RANK: Record<Role, number> = { owner: 3, admin: 2, instructor: 1, student: 0 };

export function normalizeRole(raw: string): Role {
  let best: Role = 'instructor';
  let bestRank = -1;
  for (const token of raw.split(',').map((t) => t.trim())) {
    const r: Role | null = isRole(token) ? token : token === 'member' ? 'instructor' : null;
    if (r && RANK[r] > bestRank) {
      best = r;
      bestRank = RANK[r];
    }
  }
  return best;
}

// Invites carry either a staff Role or this marker: the invited account is
// a portal student, not an org member. Owned by the organizations domain — the
// invite provider adapter reuses it to branch links, emails, and grants.
export const STUDENT_ROLE = 'student';
