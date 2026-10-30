import {
  CourseIdPathParam,
  CreateInvite,
  EnrollmentSeriesQuery,
  EntitlementIdParam,
  EntitlementsQuery,
  GrantEntitlement,
  SetEntitlementStatus,
  StudentIdParam,
  StudentsQuery,
  UpdateStudentBody,
} from '../../schemas/index.js';
import { actor, defineTool, noInput, type Tool } from '../tool.js';

export const peopleTools: Tool[] = [
  defineTool({
    name: 'list_students',
    title: 'List students',
    description:
      'Search and page through the students with their access count, average progress, status and last activity.',
    scope: 'students:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: StudentsQuery,
    call: (input, { container, scope }) => container.reporting.admin.listStudents(scope.orgId, input),
  }),
  defineTool({
    name: 'update_student',
    title: 'Update student',
    description:
      "Correct a student's first name, last name and email. All three are required. Returns the student's membership record; list_students shows the updated profile.",
    scope: 'students:write',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: UpdateStudentBody.extend(StudentIdParam.shape),
    call: ({ id, ...profile }, { container, scope }) =>
      container.organizations.updateStudent({ orgId: scope.orgId, orgUserId: id, ...profile }),
  }),
  defineTool({
    name: 'invite_student',
    title: 'Invite student',
    description:
      'Invite someone by email as a student. They exist as an invited student at once. sendEmail false skips the email.',
    scope: 'students:invite',
    kind: 'write',
    idempotent: false,
    openWorld: true,
    input: CreateInvite.omit({ role: true }),
    call: (input, { container, scope }) =>
      container.organizations.createInvite(actor(scope), {
        orgId: scope.orgId,
        inviterUserId: scope.userId,
        role: 'student',
        ...input,
      }),
  }),
  defineTool({
    name: 'resend_student_invite',
    title: 'Resend student invite',
    description: "Send a pending student's invite email again.",
    scope: 'students:invite',
    kind: 'write',
    idempotent: false,
    openWorld: true,
    input: StudentIdParam,
    call: ({ id }, { container, scope }) =>
      container.organizations.resendStudentInvite(actor(scope), {
        orgId: scope.orgId,
        orgUserId: id,
        inviterUserId: scope.userId,
      }),
  }),
  defineTool({
    name: 'list_access',
    title: 'List access',
    description: 'Who has access to what. Filter by student (orgUserId), content, type or status.',
    scope: 'access:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: EntitlementsQuery,
    call: (input, { container, scope }) => container.entitlements.list(scope.orgId, input),
  }),
  defineTool({
    name: 'grant_access',
    title: 'Grant access',
    description:
      'Give a student access to one course, download or community (contentId) or to a bundle (bundleId), never both. expiresAt is a date-time, or null for no expiry.',
    scope: 'access:write',
    kind: 'write',
    idempotent: false,
    openWorld: false,
    input: GrantEntitlement,
    call: (input, { container, scope }) => container.entitlements.grant(scope.orgId, input),
  }),
  defineTool({
    name: 'set_access_status',
    title: 'Revoke or reinstate access',
    description: 'Revoke an access grant, or reinstate a revoked one.',
    scope: 'access:write',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: SetEntitlementStatus.extend(EntitlementIdParam.shape),
    call: ({ id, status }, { container, scope }) =>
      container.entitlements.setStatus(scope.orgId, id, status),
  }),
  defineTool({
    name: 'get_dashboard',
    title: 'Get dashboard',
    description:
      'Published and draft course counts, active students, and access grants expiring soon.',
    scope: 'analytics:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: noInput,
    call: (_input, { container, scope }) => container.reporting.admin.overview(scope.orgId),
  }),
  defineTool({
    name: 'get_enrollment_trend',
    title: 'Get enrollment trend',
    description:
      'Daily enrollments across the organization for the last days (default 30, at most 365).',
    scope: 'analytics:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: EnrollmentSeriesQuery,
    call: ({ days }, { container, scope }) =>
      container.reporting.admin.enrollments(scope.orgId, days),
  }),
  defineTool({
    name: 'get_course_analytics',
    title: 'Get course analytics',
    description:
      'Enrolled, started and completed counts, average progress and per-activity engagement for one course.',
    scope: 'analytics:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: CourseIdPathParam,
    call: ({ courseId }, { container, scope }) =>
      container.reporting.admin.courseAnalytics(scope.orgId, courseId),
  }),
  defineTool({
    name: 'get_course_enrollment_trend',
    title: 'Get course enrollment trend',
    description: 'Daily enrollments in one course for the last days (default 30, at most 365).',
    scope: 'analytics:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: EnrollmentSeriesQuery.extend(CourseIdPathParam.shape),
    call: ({ courseId, days }, { container, scope }) =>
      container.reporting.admin.courseEnrollments(scope.orgId, courseId, days),
  }),
  defineTool({
    name: 'get_student_analytics',
    title: 'Get student analytics',
    description:
      "One student's enrolled, started and completed counts, average progress and progress in each course.",
    scope: 'analytics:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: StudentIdParam,
    call: ({ id }, { container, scope }) => container.reporting.admin.studentAnalytics(scope.orgId, id),
  }),
];
