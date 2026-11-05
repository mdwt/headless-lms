import { describe, expect, it } from 'vitest';
import { OWNER, runCase, toolSpecs, type ToolCase } from '../test-support.js';
import { communityMemberTools } from './community-members.js';

const placement = { communityId: 'cmy_1', spaceId: 'spc_1', orgUserId: 'ou_9' };

const cases: ToolCase[] = [
  {
    tool: 'list_community_members',
    args: { communityId: 'cmy_1', search: 'sam' },
    service: 'reporting.admin.communityMembers',
    expected: ['cmy_1', { page: 1, pageSize: 20, search: 'sam' }, OWNER],
  },
  {
    tool: 'list_space_members',
    args: { communityId: 'cmy_1', spaceId: 'spc_1', page: 2 },
    service: 'entitlements.listSpaceMembers',
    expected: ['cmy_1', 'spc_1', { page: 2, pageSize: 20 }, OWNER],
  },
  {
    tool: 'add_space_member',
    args: placement,
    service: 'entitlements.addSpaceMember',
    expected: ['cmy_1', 'spc_1', 'ou_9', OWNER],
  },
  {
    tool: 'invite_space_member',
    args: placement,
    service: 'entitlements.invite',
    expected: ['cmy_1', 'spc_1', 'ou_9', OWNER],
  },
  {
    tool: 'approve_space_request',
    args: placement,
    service: 'entitlements.approve',
    expected: ['cmy_1', 'spc_1', 'ou_9', OWNER],
  },
  {
    tool: 'decline_space_request',
    args: placement,
    service: 'entitlements.decline',
    expected: ['cmy_1', 'spc_1', 'ou_9', OWNER],
  },
  {
    tool: 'remove_space_member',
    args: placement,
    service: 'entitlements.remove',
    expected: ['cmy_1', 'spc_1', 'ou_9', OWNER],
  },
];

describe('community member tools', () => {
  it('name the core method they call and their hints', () => {
    expect(toolSpecs(communityMemberTools)).toEqual([
      ['list_community_members', 'reporting.admin.communityMembers', 'read', true, false],
      ['list_space_members', 'entitlements.listSpaceMembers', 'read', true, false],
      ['add_space_member', 'entitlements.addSpaceMember', 'write', false, false],
      ['invite_space_member', 'entitlements.invite', 'write', false, true],
      ['approve_space_request', 'entitlements.approve', 'write', true, false],
      ['decline_space_request', 'entitlements.decline', 'write', true, false],
      ['remove_space_member', 'entitlements.remove', 'destructive', true, false],
    ]);
  });

  it.each(cases)('$tool calls $service once', (c) => runCase(communityMemberTools, c));
});
