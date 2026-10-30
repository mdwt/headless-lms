import { describe, expect, it } from 'vitest';
import {
  listTools,
  runCase,
  toolContext,
  fakeContainer,
  toolSpecs,
  type ToolCase,
} from '../test-support.js';
import { peopleTools } from './people.js';

const cases: ToolCase[] = [
  {
    tool: 'list_students',
    args: { search: 'sam' },
    service: 'reporting.admin.listStudents',
    expected: ['org_1', { page: 1, pageSize: 20, search: 'sam' }],
  },
  {
    tool: 'update_student',
    args: { id: 'ou_9', firstName: 'Sam', lastName: 'Lee', email: 'sam@acme.test' },
    service: 'organizations.updateStudent',
    expected: [
      {
        orgId: 'org_1',
        orgUserId: 'ou_9',
        firstName: 'Sam',
        lastName: 'Lee',
        email: 'sam@acme.test',
      },
    ],
  },
  {
    tool: 'invite_student',
    args: { email: 'sam@acme.test', firstName: 'Sam' },
    service: 'organizations.createInvite',
    expected: [
      { id: 'ou_1', role: 'owner' },
      {
        orgId: 'org_1',
        inviterUserId: 'usr_1',
        role: 'student',
        email: 'sam@acme.test',
        firstName: 'Sam',
        sendEmail: true,
      },
    ],
  },
  {
    tool: 'resend_student_invite',
    args: { id: 'ou_9' },
    service: 'organizations.resendStudentInvite',
    expected: [
      { id: 'ou_1', role: 'owner' },
      { orgId: 'org_1', orgUserId: 'ou_9', inviterUserId: 'usr_1' },
    ],
    returns: undefined,
  },
  {
    tool: 'list_access',
    args: { orgUserId: 'ou_9' },
    service: 'entitlements.list',
    expected: ['org_1', { page: 1, pageSize: 20, orgUserId: 'ou_9' }],
  },
  {
    tool: 'grant_access',
    args: { orgUserId: 'ou_9', contentId: 'crs_1', expiresAt: '2026-12-31T00:00:00.000Z' },
    service: 'entitlements.grant',
    expected: [
      'org_1',
      { orgUserId: 'ou_9', contentId: 'crs_1', expiresAt: new Date('2026-12-31T00:00:00.000Z') },
    ],
  },
  {
    tool: 'set_access_status',
    args: { id: 'ent_1', status: 'revoked' },
    service: 'entitlements.setStatus',
    expected: ['org_1', 'ent_1', 'revoked'],
  },
  { tool: 'get_dashboard', args: {}, service: 'reporting.admin.overview', expected: ['org_1'] },
  {
    tool: 'get_enrollment_trend',
    args: { days: 7 },
    service: 'reporting.admin.enrollments',
    expected: ['org_1', 7],
    returns: [],
  },
  {
    tool: 'get_course_analytics',
    args: { courseId: 'crs_1' },
    service: 'reporting.admin.courseAnalytics',
    expected: ['org_1', 'crs_1'],
  },
  {
    tool: 'get_course_enrollment_trend',
    args: { courseId: 'crs_1' },
    service: 'reporting.admin.courseEnrollments',
    expected: ['org_1', 'crs_1', 30],
    returns: [],
  },
  {
    tool: 'get_student_analytics',
    args: { id: 'ou_9' },
    service: 'reporting.admin.studentAnalytics',
    expected: ['org_1', 'ou_9'],
  },
];

describe('student, access and analytics tools', () => {
  it('declare their scope and hints', () => {
    expect(toolSpecs(peopleTools)).toEqual([
      ['list_students', 'students:read', 'read', true, false],
      ['update_student', 'students:write', 'write', true, false],
      ['invite_student', 'students:invite', 'write', false, true],
      ['resend_student_invite', 'students:invite', 'write', false, true],
      ['list_access', 'access:read', 'read', true, false],
      ['grant_access', 'access:write', 'write', false, false],
      ['set_access_status', 'access:write', 'destructive', true, false],
      ['get_dashboard', 'analytics:read', 'read', true, false],
      ['get_enrollment_trend', 'analytics:read', 'read', true, false],
      ['get_course_analytics', 'analytics:read', 'read', true, false],
      ['get_course_enrollment_trend', 'analytics:read', 'read', true, false],
      ['get_student_analytics', 'analytics:read', 'read', true, false],
    ]);
  });

  it.each(cases)('$tool calls $service once', (c) => runCase(peopleTools, c));

  it('lists grant_access with expiresAt as a date-time string', async () => {
    const tools = await listTools(toolContext(fakeContainer()), peopleTools);
    const grant = tools.find((tool) => tool.name === 'grant_access');
    expect(JSON.stringify(grant?.inputSchema.properties?.expiresAt)).toContain(
      '"format":"date-time"',
    );
  });

  it('cannot invite anyone but a student', async () => {
    const tools = await listTools(toolContext(fakeContainer()), peopleTools);
    const invite = tools.find((tool) => tool.name === 'invite_student');
    expect(Object.keys(invite?.inputSchema.properties ?? {})).not.toContain('role');
  });
});
