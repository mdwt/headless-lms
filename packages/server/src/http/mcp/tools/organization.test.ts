import { describe, expect, it } from 'vitest';
import { runCase, OWNER, toolSpecs, type ToolCase } from '../test-support.js';
import { organizationTools } from './organization.js';
import { TOOLS } from './index.js';

const cases: ToolCase[] = [
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
      ['update_organization', 'organizations.updateOrganization', 'write', true, false],
      ['list_roles', 'organizations.listRoles', 'read', true, false],
      ['get_role', 'organizations.getRole', 'read', true, false],
      ['update_role', 'organizations.updateRole', 'write', true, false],
      ['create_role', 'organizations.createRole', 'write', false, false],
      ['reset_role', 'organizations.resetRole', 'destructive', true, false],
      ['delete_role', 'organizations.deleteRole', 'destructive', false, false],
      ['list_team', 'organizations.listTeam', 'read', true, false],
      ['list_person_roles', 'organizations.listAssignments', 'read', true, false],
      ['list_roles_on_content', 'organizations.listAssignmentsOn', 'read', true, false],
      ['set_org_role', 'organizations.setOrgRole', 'write', true, false],
      ['assign_role', 'organizations.assignRole', 'write', true, false],
      ['unassign_role', 'organizations.unassignRole', 'destructive', true, false],
      ['invite_person', 'organizations.createInvite', 'write', false, true],
      ['cancel_invite', 'organizations.cancelInvite', 'destructive', false, false],
      ['remove_person', 'organizations.removePerson', 'destructive', false, false],
    ]);
  });

  it.each(cases)('$tool calls $service once', (c) => runCase(organizationTools, c));

  it('offers no tool that transfers ownership', () => {
    expect(TOOLS.filter((tool) => tool.operation === 'organizations.transferOwnership')).toEqual(
      [],
    );
  });
});
