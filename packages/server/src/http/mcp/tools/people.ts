import {
  CourseIdPathParam,
  CourseLearnersQuery,
  CreateInvite,
  EnrollmentSeriesQuery,
  EntitlementIdParam,
  EntitlementsQuery,
  GrantEntitlement,
  Invite,
  SetEntitlementStatus,
  StudentIdParam,
  StudentsQuery,
} from '../../schemas/index.js';
import { defineTool, noInput, type Tool } from '../tool.js';

export const peopleTools: Tool[] = [
  defineTool({
    name: 'list_students',
    title: 'List students',
    description:
      'Search and page through the students with their access count, average progress, status and last activity.',
    operation: 'reporting.admin.listStudents',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: StudentsQuery,
    call: (input, { container, caller }) =>
      container.reporting.admin.listStudents(input, caller.actor),
  }),
  defineTool({
    name: 'invite_student',
    title: 'Invite student',
    description:
      'Invite someone by email as a student. They exist as an invited student at once. sendEmail false skips the email.',
    operation: 'organizations.createInvite',
    kind: 'write',
    idempotent: false,
    openWorld: true,
    input: CreateInvite.omit({ roleKey: true }),
    output: Invite,
    call: (input, { container, caller }) =>
      container.organizations.createInvite(
        { ...input, roleKey: 'member' },
        caller.actor,
        caller.userId,
      ),
  }),
  defineTool({
    name: 'resend_student_invite',
    title: 'Resend student invite',
    description: "Send a pending student's invite email again.",
    operation: 'organizations.resendInvite',
    kind: 'write',
    idempotent: false,
    openWorld: true,
    input: StudentIdParam,
    call: ({ id }, { container, caller }) =>
      container.organizations.resendInvite(id, caller.actor, caller.userId),
  }),
  defineTool({
    name: 'list_access',
    title: 'List access',
    description: 'Who has access to what. Filter by student (orgUserId), content, type or status.',
    operation: 'entitlements.list',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: EntitlementsQuery,
    call: (input, { container, caller }) => container.entitlements.list(input, caller.actor),
  }),
  defineTool({
    name: 'grant_access',
    title: 'Grant access',
    description:
      'Give a student access to one course, download, community or event (contentId) or to a bundle (bundleId), never both. expiresAt is a date-time, or null for no expiry.',
    operation: 'entitlements.grant',
    listedFor: ['access:write'],
    kind: 'write',
    idempotent: false,
    openWorld: false,
    input: GrantEntitlement,
    call: (input, { container, caller }) => container.entitlements.grant(input, caller.actor),
  }),
  defineTool({
    name: 'set_access_status',
    title: 'Revoke or reinstate access',
    description: 'Revoke an access grant, or reinstate a revoked one.',
    operation: 'entitlements.setStatus',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: SetEntitlementStatus.extend(EntitlementIdParam.shape),
    call: ({ id, status }, { container, caller }) =>
      container.entitlements.setStatus(id, status, caller.actor),
  }),
  defineTool({
    name: 'get_dashboard',
    title: 'Get dashboard',
    description:
      'Published and draft course counts, active students, and access grants expiring soon.',
    operation: 'reporting.admin.overview',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: noInput,
    call: (_input, { container, caller }) => container.reporting.admin.overview(caller.actor),
  }),
  defineTool({
    name: 'get_enrollment_trend',
    title: 'Get enrollment trend',
    description:
      'Daily enrollments across the organization for the last days (default 30, at most 365).',
    operation: 'reporting.admin.enrollments',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: EnrollmentSeriesQuery,
    call: ({ days }, { container, caller }) =>
      container.reporting.admin.enrollments(days, caller.actor),
  }),
  defineTool({
    name: 'get_course_analytics',
    title: 'Get course analytics',
    description:
      'Enrolled, started and completed counts, average progress and per-activity engagement for one course.',
    operation: 'reporting.admin.courseAnalytics',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: CourseIdPathParam,
    call: ({ courseId }, { container, caller }) =>
      container.reporting.admin.courseAnalytics(courseId, caller.actor),
  }),
  defineTool({
    name: 'list_course_learners',
    title: 'List course learners',
    description:
      "Page through a course's learners: everyone with a grant that opens it, directly or through a bundle, active or not, with that grant and their progress. Search by name or email.",
    operation: 'reporting.admin.courseLearners',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: CourseLearnersQuery.extend(CourseIdPathParam.shape),
    call: ({ courseId, ...query }, { container, caller }) =>
      container.reporting.admin.courseLearners(courseId, query, caller.actor),
  }),
  defineTool({
    name: 'get_course_enrollment_trend',
    title: 'Get course enrollment trend',
    description: 'Daily enrollments in one course for the last days (default 30, at most 365).',
    operation: 'reporting.admin.courseEnrollments',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: EnrollmentSeriesQuery.extend(CourseIdPathParam.shape),
    call: ({ courseId, days }, { container, caller }) =>
      container.reporting.admin.courseEnrollments(courseId, days, caller.actor),
  }),
  defineTool({
    name: 'get_student_analytics',
    title: 'Get student analytics',
    description:
      "One student's enrolled, started and completed counts, average progress and progress in each course.",
    operation: 'reporting.admin.studentAnalytics',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: StudentIdParam,
    call: ({ id }, { container, caller }) =>
      container.reporting.admin.studentAnalytics(id, caller.actor),
  }),
];
