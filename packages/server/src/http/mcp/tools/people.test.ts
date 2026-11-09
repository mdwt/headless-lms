import { describe, expect, it } from 'vitest';
import {
  listTools,
  runCase,
  toolContext,
  fakeContainer,
  OWNER,
  toolSpecs,
  type ToolCase,
} from '../test-support.js';
import { peopleTools } from './people.js';

const cases: ToolCase[] = [
  {
    tool: 'list_students',
    args: { search: 'sam' },
    service: 'reporting.admin.listStudents',
    expected: [{ page: 1, pageSize: 20, search: 'sam' }, OWNER],
  },
  {
    tool: 'invite_student',
    args: { email: 'sam@acme.test', firstName: 'Sam' },
    service: 'organizations.createInvite',
    expected: [{ email: 'sam@acme.test', firstName: 'Sam', sendEmail: true }, OWNER, 'usr_1'],
    returns: {
      id: 'inv_1',
      orgId: 'org_1',
      email: 'sam@acme.test',
      roleKey: 'member',
      status: 'pending',
      invitedBy: 'usr_1',
      tokenHash: 'hash',
      expiresAt: new Date('2026-11-06T00:00:00.000Z'),
      createdAt: new Date('2026-10-30T00:00:00.000Z'),
      updatedAt: new Date('2026-10-30T00:00:00.000Z'),
    },
    shown: {
      id: 'inv_1',
      email: 'sam@acme.test',
      roleKey: 'member',
      status: 'pending',
      expiresAt: '2026-11-06T00:00:00.000Z',
      createdAt: '2026-10-30T00:00:00.000Z',
    },
  },
  {
    tool: 'list_access',
    args: { orgUserId: 'ou_9' },
    service: 'entitlements.list',
    expected: [{ page: 1, pageSize: 20, orgUserId: 'ou_9' }, OWNER],
  },
  {
    tool: 'grant_access',
    args: { orgUserId: 'ou_9', contentId: 'crs_1', expiresAt: '2026-12-31T00:00:00.000Z' },
    service: 'entitlements.grant',
    expected: [
      { orgUserId: 'ou_9', contentId: 'crs_1', expiresAt: new Date('2026-12-31T00:00:00.000Z') },
      OWNER,
    ],
  },
  {
    tool: 'revoke_access',
    args: { orgUserId: 'ou_9', bundleId: 'bnd_1' },
    service: 'entitlements.revoke',
    expected: [{ orgUserId: 'ou_9', bundleId: 'bnd_1' }, OWNER],
  },
  { tool: 'get_dashboard', args: {}, service: 'reporting.admin.overview', expected: [OWNER] },
  {
    tool: 'get_enrollment_trend',
    args: { days: 7 },
    service: 'reporting.admin.enrollments',
    expected: [7, OWNER],
    returns: [],
  },
  {
    tool: 'get_course_analytics',
    args: { courseId: 'crs_1' },
    service: 'reporting.admin.courseAnalytics',
    expected: ['crs_1', OWNER],
  },
  {
    tool: 'list_course_learners',
    args: { courseId: 'crs_1', search: 'ja' },
    service: 'reporting.admin.courseLearners',
    expected: ['crs_1', { page: 1, pageSize: 20, search: 'ja' }, OWNER],
  },
  {
    tool: 'get_course_enrollment_trend',
    args: { courseId: 'crs_1' },
    service: 'reporting.admin.courseEnrollments',
    expected: ['crs_1', 30, OWNER],
    returns: [],
  },
  {
    tool: 'get_student_analytics',
    args: { id: 'ou_9' },
    service: 'reporting.admin.studentAnalytics',
    expected: ['ou_9', OWNER],
  },
];

describe('student, access and analytics tools', () => {
  it('declare their operation and hints', () => {
    expect(toolSpecs(peopleTools)).toEqual([
      ['list_students', 'read', true, false],
      ['invite_student', 'write', false, true],
      ['list_access', 'read', true, false],
      ['grant_access', 'write', false, false],
      ['revoke_access', 'destructive', false, false],
      ['get_dashboard', 'read', true, false],
      ['get_enrollment_trend', 'read', true, false],
      ['get_course_analytics', 'read', true, false],
      ['list_course_learners', 'read', true, false],
      ['get_course_enrollment_trend', 'read', true, false],
      ['get_student_analytics', 'read', true, false],
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
