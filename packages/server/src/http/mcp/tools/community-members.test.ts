import { describe, expect, it } from 'vitest';
import { runCase, toolSpecs, type ToolCase } from '../test-support.js';
import { communityMemberTools } from './community-members.js';

const actor = { id: 'ou_1', role: 'owner' };
const placement = { communityId: 'cmy_1', spaceId: 'spc_1', orgUserId: 'ou_9' };

const cases: ToolCase[] = [
  {
    tool: 'list_community_members',
    args: { communityId: 'cmy_1', search: 'sam' },
    service: 'reporting.admin.communityMembers',
    expected: ['org_1', 'cmy_1', { page: 1, pageSize: 20, search: 'sam' }],
  },
  {
    tool: 'list_space_members',
    args: { communityId: 'cmy_1', spaceId: 'spc_1', page: 2 },
    service: 'entitlements.listSpaceMembers',
    expected: ['org_1', actor, 'cmy_1', 'spc_1', { page: 2, pageSize: 20 }],
  },
  {
    tool: 'add_space_member',
    args: placement,
    service: 'entitlements.addSpaceMember',
    expected: ['org_1', actor, 'cmy_1', 'spc_1', 'ou_9'],
  },
  {
    tool: 'invite_space_member',
    args: placement,
    service: 'entitlements.invite',
    expected: ['org_1', actor, 'cmy_1', 'spc_1', 'ou_9'],
  },
  {
    tool: 'approve_space_request',
    args: placement,
    service: 'entitlements.approve',
    expected: ['org_1', actor, 'cmy_1', 'spc_1', 'ou_9'],
  },
  {
    tool: 'decline_space_request',
    args: placement,
    service: 'entitlements.decline',
    expected: ['org_1', actor, 'cmy_1', 'spc_1', 'ou_9'],
  },
  {
    tool: 'remove_space_member',
    args: placement,
    service: 'entitlements.remove',
    expected: ['org_1', actor, 'cmy_1', 'spc_1', 'ou_9'],
  },
];

describe('community member tools', () => {
  it('declare their scope and hints', () => {
    expect(toolSpecs(communityMemberTools)).toEqual([
      ['list_community_members', 'community_members:read', 'read', true, false],
      ['list_space_members', 'community_members:read', 'read', true, false],
      ['add_space_member', 'community_members:write', 'write', false, false],
      ['invite_space_member', 'community_members:write', 'write', false, true],
      ['approve_space_request', 'community_members:write', 'write', true, false],
      ['decline_space_request', 'community_members:write', 'write', true, false],
      ['remove_space_member', 'community_members:write', 'destructive', true, false],
    ]);
  });

  it.each(cases)('$tool calls $service once', (c) => runCase(communityMemberTools, c));
});
