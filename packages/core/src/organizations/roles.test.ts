import { describe, it, expect } from 'vitest';
import { ROLES, isRole, parseRole, capability, normalizeRole } from './roles.js';

describe('roles', () => {
  it('exposes the staff roles plus student', () => {
    expect([...ROLES]).toEqual(['owner', 'admin', 'instructor', 'student']);
  });

  it('treats student as a known role', () => {
    expect(isRole('student')).toBe(true);
    expect(parseRole('student')).toBe('student');
  });

  it('grants student content consumption only when enrolled', () => {
    expect(capability('student', 'consume_content')).toBe('enrolled');
  });

  it('grants student no management capability', () => {
    expect(capability('student', 'manage_users')).toBe(false);
    expect(capability('student', 'create_course')).toBe(false);
    expect(capability('student', 'view_student_progress')).toBe(false);
    expect(capability('student', 'edit_assigned_course')).toBe(false);
  });

  it('ranks student below every staff role', () => {
    expect(normalizeRole('student,instructor')).toBe('instructor');
  });

  it('parseRole accepts a known role and rejects an unknown one', () => {
    expect(parseRole('instructor')).toBe('instructor');
    expect(isRole('member')).toBe(false);
    expect(() => parseRole('member')).toThrow(/unknown role/);
  });

  it('capability reflects the permission matrix', () => {
    expect(capability('owner', 'manage_billing')).toBe(true);
    expect(capability('admin', 'manage_billing')).toBe(false);
    expect(capability('instructor', 'edit_assigned_course')).toBe('assigned');
    expect(capability('instructor', 'manage_users')).toBe(false);
    expect(capability('instructor', 'create_course')).toBe(false);
  });
});

describe('normalizeRole', () => {
  it('passes through known single roles', () => {
    expect(normalizeRole('owner')).toBe('owner');
    expect(normalizeRole('instructor')).toBe('instructor');
  });
  it("maps Better Auth's member to instructor", () => {
    expect(normalizeRole('member')).toBe('instructor');
  });
  it('collapses a multi-role string to the highest-privilege role', () => {
    expect(normalizeRole('admin,instructor')).toBe('admin');
    expect(normalizeRole('instructor,owner')).toBe('owner');
  });
  it('maps an unknown role to instructor', () => {
    expect(normalizeRole('superuser')).toBe('instructor');
  });
});
