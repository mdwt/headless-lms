import { describe, expect, it } from 'vitest';
import { runCase, toolSpecs, type ToolCase } from '../test-support.js';
import { communityTools } from './communities.js';

const actor = { id: 'ou_1', role: 'owner' };

const cases: ToolCase[] = [
  {
    tool: 'list_communities',
    args: { status: 'published' },
    service: 'content.listCommunities',
    expected: ['org_1', { page: 1, pageSize: 20, status: 'published' }],
  },
  {
    tool: 'list_spaces',
    args: { communityId: 'cmy_1' },
    service: 'content.listSpaces',
    expected: ['org_1', 'cmy_1'],
    returns: [{ id: 'spc_1' }],
  },
  {
    tool: 'create_community',
    args: { title: 'Founders' },
    service: 'content.createCommunity',
    expected: ['org_1', { title: 'Founders' }, actor],
  },
  {
    tool: 'update_community',
    args: { communityId: 'cmy_1', status: 'published' },
    service: 'content.updateCommunity',
    expected: ['org_1', 'cmy_1', { status: 'published' }, actor],
  },
  {
    tool: 'update_community_messaging',
    args: { communityId: 'cmy_1', memberToMember: false },
    service: 'content.patchDmSettings',
    expected: ['org_1', 'cmy_1', { memberToMember: false }, actor],
  },
  {
    tool: 'create_space',
    args: { communityId: 'cmy_1', name: 'Wins', accessRule: 'by_request' },
    service: 'content.createSpace',
    expected: ['org_1', 'cmy_1', { name: 'Wins', accessRule: 'by_request' }, actor],
  },
  {
    tool: 'update_space',
    args: { communityId: 'cmy_1', spaceId: 'spc_1', capacity: 20 },
    service: 'content.updateSpace',
    expected: ['org_1', 'cmy_1', 'spc_1', { capacity: 20 }, actor],
  },
  {
    tool: 'reorder_spaces',
    args: { communityId: 'cmy_1', ids: ['spc_2', 'spc_1'] },
    service: 'content.reorderSpaces',
    expected: ['org_1', 'cmy_1', ['spc_2', 'spc_1'], actor],
    returns: [],
  },
  {
    tool: 'set_space_topics',
    args: { communityId: 'cmy_1', spaceId: 'spc_1', topics: [{ id: 'top_1', name: 'Intros' }] },
    service: 'content.setSpaceTopics',
    expected: ['org_1', 'cmy_1', 'spc_1', { topics: [{ id: 'top_1', name: 'Intros' }] }, actor],
  },
  {
    tool: 'add_space_link',
    args: { communityId: 'cmy_1', spaceId: 'spc_1', contentId: 'crs_1' },
    service: 'content.addSpaceLink',
    expected: ['org_1', 'cmy_1', 'spc_1', 'crs_1', actor],
  },
  {
    tool: 'reorder_space_links',
    args: { communityId: 'cmy_1', spaceId: 'spc_1', ids: ['lnk_2', 'lnk_1'] },
    service: 'content.reorderSpaceLinks',
    expected: ['org_1', 'cmy_1', 'spc_1', ['lnk_2', 'lnk_1'], actor],
  },
  {
    tool: 'remove_space_link',
    args: { communityId: 'cmy_1', spaceId: 'spc_1', linkId: 'lnk_1' },
    service: 'content.removeSpaceLink',
    expected: ['org_1', 'cmy_1', 'spc_1', 'lnk_1', actor],
  },
  {
    tool: 'delete_space',
    args: { communityId: 'cmy_1', spaceId: 'spc_1' },
    service: 'content.deleteSpace',
    expected: ['org_1', 'cmy_1', 'spc_1', actor],
    returns: undefined,
  },
  {
    tool: 'delete_community',
    args: { communityId: 'cmy_1' },
    service: 'content.deleteCommunity',
    expected: ['org_1', 'cmy_1', actor],
    returns: undefined,
  },
  {
    tool: 'get_community_analytics',
    args: { communityId: 'cmy_1' },
    service: 'reporting.admin.communityAnalytics',
    expected: ['org_1', 'cmy_1'],
  },
];

describe('community tools', () => {
  it('declare their scope and hints', () => {
    expect(toolSpecs(communityTools)).toEqual([
      ['list_communities', 'communities:read', 'read', true, false],
      ['list_spaces', 'communities:read', 'read', true, false],
      ['create_community', 'communities:write', 'write', false, false],
      ['update_community', 'communities:write', 'write', true, false],
      ['update_community_messaging', 'communities:write', 'write', true, false],
      ['create_space', 'communities:write', 'write', false, false],
      ['update_space', 'communities:write', 'write', true, false],
      ['reorder_spaces', 'communities:write', 'write', true, false],
      ['set_space_topics', 'communities:write', 'write', true, false],
      ['add_space_link', 'communities:write', 'write', false, false],
      ['reorder_space_links', 'communities:write', 'write', true, false],
      ['remove_space_link', 'communities:write', 'destructive', true, false],
      ['delete_space', 'communities:delete', 'destructive', true, false],
      ['delete_community', 'communities:delete', 'destructive', true, false],
      ['get_community_analytics', 'analytics:read', 'read', true, false],
    ]);
  });

  it.each(cases)('$tool calls $service once', (c) => runCase(communityTools, c));
});
