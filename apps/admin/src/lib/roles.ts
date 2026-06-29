/**
 * Authorization helpers. The API is the source of truth; this is UI gating —
 * hide/disable what a role can't do, and redirect students out of the
 * dashboard entirely. Mirrors the better-auth org roles.
 */

import type { Role, SessionUser } from "./api/types";

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  instructor: "Instructor",
  student: "Student",
};

export const ROLE_RANK: Record<Role, number> = {
  owner: 3,
  admin: 2,
  instructor: 1,
  student: 0,
};

/** Students have no back-office access — used to redirect them to login. */
export function canAccessDashboard(role: Role): boolean {
  return role !== "student";
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
