import { describe, expect, it } from 'vitest';
import { runCase, OWNER, toolSpecs, type ToolCase } from '../test-support.js';
import { organizationTools } from './organization.js';

const HOSTS = { courses: 'https://learn.acme.test', community: 'https://club.acme.test' };

const cases: ToolCase[] = [
  {
    tool: 'get_organization_hosts',
    args: {},
    service: 'hosts.get',
    expected: [OWNER],
    returns: HOSTS,
  },
  {
    tool: 'replace_organization_hosts',
    args: { courses: 'https://learn.acme.test/', community: 'https://club.acme.test' },
    service: 'hosts.replace',
    expected: [HOSTS, OWNER],
    returns: HOSTS,
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
    args: { orgUserId: 'ou_9', host: 'https://club.acme.test/' },
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
      ['get_organization_hosts', 'read', true, false],
      ['replace_organization_hosts', 'write', true, false],
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
