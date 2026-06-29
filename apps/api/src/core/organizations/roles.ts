// organizations context — roles and the authorization matrix.
// Defined in code (no DB enum). The DB stores role as text; the domain narrows
// it to Role and answers authorization questions here.

export const ROLES = ["owner", "admin", "instructor", "student"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function parseRole(value: string): Role {
  if (!isRole(value)) throw new Error(`unknown role: ${value}`);
  return value;
}

export type Permission =
  | "manage_billing"
  | "manage_org_settings"
  | "manage_users"
  | "create_course"
  | "edit_assigned_course"
  | "view_student_progress"
  | "consume_content";

// Unconditional (true), course-scoped ("assigned" — requires the course to be
// assigned to the member), or enrollment-scoped ("enrolled" — access owned by
// entitlements). Absent ⇒ denied.
export type Capability = true | "assigned" | "enrolled";

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
    edit_assigned_course: "assigned",
    view_student_progress: "assigned",
  },
  student: {
    consume_content: "enrolled",
  },
};

export function capability(role: Role, permission: Permission): Capability | false {
  return MATRIX[role][permission] ?? false;
}

export function canForCourse(
  role: Role,
  permission: Permission,
  ctx: { assignedCourseIds: readonly string[]; courseId: string },
): boolean {
  const cap = capability(role, permission);
  if (cap === true) return true;
  if (cap === "assigned") return ctx.assignedCourseIds.includes(ctx.courseId);
  return false;
}

// Better Auth's role model is broader than ours: it keeps a built-in `member`
// role and allows comma-joined multi-role strings. Normalize any incoming role
// string to a single domain Role before persisting: `member` -> `student`, a
// multi-role string -> its highest-privilege known role, unknown -> `student`.
const RANK: Record<Role, number> = { owner: 3, admin: 2, instructor: 1, student: 0 };

export function normalizeRole(raw: string): Role {
  let best: Role = "student";
  let bestRank = -1;
  for (const token of raw.split(",").map((t) => t.trim())) {
    const r: Role | null = isRole(token) ? token : token === "member" ? "student" : null;
    if (r && RANK[r] > bestRank) {
      best = r;
      bestRank = RANK[r];
    }
  }
  return best;
}
