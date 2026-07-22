import { describe, it, expect } from 'vitest';
import { authorize } from './authz.js';
import type { McpPrincipal } from './authz.js';

const owner: McpPrincipal = {
  studentId: 's1',
  orgId: 'o1',
  role: 'owner',
  assignedCourseIds: ['c1', 'c2'],
  scopes: ['lms:read', 'lms:write'],
};

const instructor: McpPrincipal = {
  studentId: 's2',
  orgId: 'o1',
  role: 'instructor',
  assignedCourseIds: ['c1'],
  scopes: ['lms:read', 'lms:write'],
};

describe('authorize', () => {
  it('returns false when the principal lacks the required scope', () => {
    expect(authorize(owner, 'lms:admin', 'manage_billing')).toBe(false);
  });

  it('returns false for owner with wrong scope even for org-global permission', () => {
    expect(authorize(owner, 'missing_scope', 'manage_org_settings')).toBe(false);
  });

  it('returns true for owner with scope and org-global permission', () => {
    expect(authorize(owner, 'lms:write', 'manage_billing')).toBe(true);
  });

  it('returns true for owner with scope and view_student_progress (no course constraint)', () => {
    expect(authorize(owner, 'lms:read', 'view_student_progress')).toBe(true);
  });

  it('returns true for instructor with scope, course-scoped permission, courseId in assignedCourseIds', () => {
    expect(authorize(instructor, 'lms:write', 'edit_assigned_course', 'c1')).toBe(true);
  });

  it('returns false for instructor with scope, course-scoped permission, courseId NOT in assignedCourseIds', () => {
    expect(authorize(instructor, 'lms:write', 'edit_assigned_course', 'c99')).toBe(false);
  });

  it('returns false for instructor lacking the permission entirely', () => {
    expect(authorize(instructor, 'lms:write', 'manage_billing')).toBe(false);
  });

  it('owner with course-scoped permission and a courseId returns true regardless of assignedCourseIds', () => {
    // owner has capability === true for view_student_progress, so canForCourse returns true
    expect(authorize(owner, 'lms:read', 'view_student_progress', 'any_course')).toBe(true);
  });

  it('returns false for instructor without the required scope even when the role would allow it', () => {
    expect(authorize(instructor, 'lms:admin', 'edit_assigned_course', 'c1')).toBe(false);
  });

  it("denies an 'assigned' course-scoped permission called WITHOUT a courseId", () => {
    // instructor.edit_assigned_course is capability "assigned", not true — the
    // org-global path (no courseId) must reject it, requiring the courseId branch.
    expect(authorize(instructor, 'lms:write', 'edit_assigned_course')).toBe(false);
  });
});
