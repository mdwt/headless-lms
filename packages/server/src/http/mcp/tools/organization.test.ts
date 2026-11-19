import { describe, expect, it } from 'vitest';
import { runCase, OWNER, toolSpecs, type ToolCase } from '../test-support.js';
import { organizationTools } from './organization.js';

const NOW = new Date('2026-11-11T10:00:00.000Z');
const CLUB = {
  id: 'app_club',
  name: 'Acme Club',
  slug: 'club',
  domain: 'https://club.acme.test',
  courses: false,
  community: true,
};
const STORED = { ...CLUB, orgId: 'org_1' };

const cases: ToolCase[] = [
  {
    tool: 'update_organization',
    args: { name: 'Acme', slug: 'acme' },
    service: 'organizations.updateOrganization',
    expected: [{ name: 'Acme', slug: 'acme' }, OWNER],
    returns: { id: 'org_1', name: 'Acme', slug: 'acme', createdAt: NOW },
    shown: { id: 'org_1', name: 'Acme', slug: 'acme', createdAt: NOW.toISOString() },
  },
  {
    tool: 'list_apps',
    args: {},
    service: 'organizations.listApps',
    expected: [OWNER],
    returns: [STORED],
    shown: { apps: [CLUB] },
  },
  {
    tool: 'create_app',
    args: {
      name: ' Acme Club ',
      slug: 'club',
      domain: 'https://club.acme.test/',
      courses: false,
      community: true,
    },
    service: 'organizations.createApp',
    expected: [
      {
        name: 'Acme Club',
        slug: 'club',
        domain: 'https://club.acme.test',
        courses: false,
        community: true,
      },
      OWNER,
    ],
    returns: STORED,
    shown: CLUB,
  },
  {
    tool: 'update_app',
    args: { appId: 'app_club', domain: 'https://club.acme.test/' },
    service: 'organizations.updateApp',
    expected: ['app_club', { domain: 'https://club.acme.test' }, OWNER],
    returns: STORED,
    shown: CLUB,
  },
  {
    tool: 'delete_app',
    args: { appId: 'app_club' },
    service: 'organizations.deleteApp',
    expected: ['app_club', OWNER],
    returns: undefined,
  },
  {
    tool: 'list_roles',
    args: {},
    service: 'organizations.listRoles',
    expected: [OWNER],
    returns: [],
    shown: { roles: [] },
  },
  {
    tool: 'delete_role',
    args: { key: 'role_x' },
    service: 'organizations.deleteRole',
    expected: ['role_x', OWNER],
    returns: undefined,
  },
  {
    tool: 'list_person_roles',
    args: { orgUserId: 'ou_9' },
    service: 'organizations.listAssignments',
    expected: ['ou_9', OWNER],
    returns: [],
    shown: { roles: [] },
  },
  {
    tool: 'list_roles_on_content',
    args: { contentId: 'crs_1' },
    service: 'organizations.listAssignmentsOn',
    expected: ['crs_1', OWNER],
    returns: [],
    shown: { roles: [] },
  },
  {
    tool: 'set_org_role',
    args: { orgUserId: 'ou_9', roleKey: 'instructor' },
    service: 'organizations.setOrgRole',
    expected: ['ou_9', 'instructor', OWNER],
    returns: [],
    shown: { roles: [] },
  },
  {
    tool: 'assign_role',
    args: { orgUserId: 'ou_9', contentId: 'crs_1', roleKey: 'instructor' },
    service: 'organizations.assignRole',
    expected: ['ou_9', 'crs_1', 'instructor', OWNER],
    returns: [],
    shown: { roles: [] },
  },
  {
    tool: 'unassign_role',
    args: { orgUserId: 'ou_9', contentId: 'crs_1' },
    service: 'organizations.unassignRole',
    expected: ['ou_9', 'crs_1', OWNER],
    returns: [],
    shown: { roles: [] },
  },
  {
    tool: 'resend_invite',
    args: { orgUserId: 'ou_9', domain: 'https://club.acme.test/' },
    service: 'organizations.resendInvite',
    expected: ['ou_9', OWNER, 'usr_1', 'https://club.acme.test'],
    returns: undefined,
  },
  {
    tool: 'cancel_invite',
    args: { orgUserId: 'ou_9' },
    service: 'organizations.cancelInvite',
    expected: ['ou_9', OWNER],
    returns: undefined,
  },
  {
    tool: 'remove_person',
    args: { orgUserId: 'ou_9' },
    service: 'organizations.removePerson',
    expected: ['ou_9', OWNER],
    returns: undefined,
  },
];

describe('organization tools', () => {
  it('name their operation and hints', () => {
    expect(toolSpecs(organizationTools)).toEqual([
      ['update_organization', 'write', true, false],
      ['list_apps', 'read', true, false],
      ['create_app', 'write', false, false],
      ['update_app', 'write', true, false],
      ['delete_app', 'destructive', false, false],
      ['list_roles', 'read', true, false],
      ['get_role', 'read', true, false],
      ['update_role', 'write', true, false],
      ['create_role', 'write', false, false],
      ['reset_role', 'destructive', true, false],
      ['delete_role', 'destructive', false, false],
      ['list_team', 'read', true, false],
      ['list_person_roles', 'read', true, false],
      ['list_roles_on_content', 'read', true, false],
      ['set_org_role', 'write', true, false],
      ['assign_role', 'write', true, false],
      ['unassign_role', 'destructive', true, false],
      ['invite_person', 'write', false, true],
      ['resend_invite', 'write', false, true],
      ['cancel_invite', 'destructive', false, false],
      ['remove_person', 'destructive', false, false],
    ]);
  });

  it.each(cases)('$tool calls $service once', (c) => runCase(organizationTools, c));
});
