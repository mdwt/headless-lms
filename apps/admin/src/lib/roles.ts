/**
 * Authorization helpers. The API is the source of truth; this is UI gating —
 * hide/disable what a role can't do. The `role` these take is now
 * **server-resolved** (`getServerSession` → org plugin active member) and
 * threaded down via `SessionProvider`/AppShell props, not a live client hook.
 * Mirrors the better-auth org roles (owner/admin/instructor).
 */

import type { Role, SessionUser } from "./api/types";

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  instructor: "Instructor",
};

export const ROLE_RANK: Record<Role, number> = {
  owner: 3,
  admin: 2,
  instructor: 1,
};

/**
 * Every org role (owner/admin/instructor) has back-office access. Non-members
 * never reach here: the server resolver yields `no-organization` for them, and
 * the layout renders the org-creation island rather than the shell.
 */
export function canAccessDashboard(_role: Role): boolean {
  return true;
}

/** Owner/Admin see and do everything across the org. */
export function isManager(role: Role): boolean {
  return role === "owner" || role === "admin";
}

export const can = {
  manageCourses: (u: SessionUser) => isManager(u.role),
  createCourse: (u: SessionUser) => isManager(u.role),
  deleteCourse: (u: SessionUser) => isManager(u.role),
  publishCourse: (u: SessionUser) => isManager(u.role),
  /** Instructors may edit content only for their assigned courses. */
  editCourse: (u: SessionUser, courseId: string) =>
    isManager(u.role) || (u.role === "instructor" && u.scopedCourseIds.includes(courseId)),
  manageStudents: (u: SessionUser) => isManager(u.role),
  manageEntitlements: (u: SessionUser) => isManager(u.role),
  viewMembers: (u: SessionUser) => isManager(u.role),
  manageRoles: (u: SessionUser) => isManager(u.role),
  inviteMembers: (u: SessionUser) => isManager(u.role),
};

/** Nav visibility per role. */
export function visibleNav(role: Role): {
  overview: boolean;
  courses: boolean;
  media: boolean;
  students: boolean;
  entitlements: boolean;
  members: boolean;
  connectedApps: boolean;
} {
  const manager = isManager(role);
  return {
    overview: true,
    courses: true,
    // Anyone who builds course content can manage media.
    media: true,
    students: manager,
    entitlements: manager,
    members: manager,
    // All dashboard users can see and revoke their own connected apps.
    connectedApps: true,
  };
}
