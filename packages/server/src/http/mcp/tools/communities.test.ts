import { describe, expect, it } from 'vitest';
import { OWNER, runCase, toolSpecs, type ToolCase } from '../test-support.js';
import { communityTools } from './communities.js';

const cases: ToolCase[] = [
  {
    tool: 'list_communities',
    args: { status: 'published' },
    service: 'content.listCommunities',
    expected: [{ page: 1, pageSize: 20, status: 'published' }, OWNER],
  },
  {
    tool: 'list_spaces',
    args: { communityId: 'cmy_1' },
    service: 'content.listSpaces',
    expected: ['cmy_1', OWNER],
    returns: [{ id: 'spc_1' }],
  },
  {
    tool: 'create_community',
    args: { title: 'Founders' },
    service: 'content.createCommunity',
    expected: [{ title: 'Founders' }, OWNER],
  },
  {
    tool: 'update_community',
    args: { communityId: 'cmy_1', status: 'published' },
    service: 'content.updateCommunity',
    expected: ['cmy_1', { status: 'published' }, OWNER],
  },
  {
    tool: 'update_community_messaging',
    args: { communityId: 'cmy_1', memberToMember: false },
    service: 'content.patchCommunitySettings',
    expected: ['cmy_1', { memberToMember: false }, OWNER],
  },
  {
    tool: 'create_space',
    args: { communityId: 'cmy_1', name: 'Wins', accessRule: 'by_request' },
    service: 'content.createSpace',
    expected: ['cmy_1', { name: 'Wins', accessRule: 'by_request' }, OWNER],
  },
  {
    tool: 'update_space',
    args: { communityId: 'cmy_1', spaceId: 'spc_1', capacity: 20 },
    service: 'content.updateSpace',
    expected: ['cmy_1', 'spc_1', { capacity: 20 }, OWNER],
  },
  {
    tool: 'reorder_spaces',
    args: { communityId: 'cmy_1', ids: ['spc_2', 'spc_1'] },
    service: 'content.reorderSpaces',
    expected: ['cmy_1', ['spc_2', 'spc_1'], OWNER],
    returns: [],
  },
  {
    tool: 'set_space_topics',
    args: { communityId: 'cmy_1', spaceId: 'spc_1', topics: [{ id: 'top_1', name: 'Intros' }] },
    service: 'content.setSpaceTopics',
    expected: ['cmy_1', 'spc_1', { topics: [{ id: 'top_1', name: 'Intros' }] }, OWNER],
  },
  {
    tool: 'add_space_link',
    args: { communityId: 'cmy_1', spaceId: 'spc_1', contentId: 'crs_1' },
    service: 'content.addSpaceLink',
    expected: ['cmy_1', 'spc_1', 'crs_1', OWNER],
  },
  {
    tool: 'reorder_space_links',
    args: { communityId: 'cmy_1', spaceId: 'spc_1', ids: ['lnk_2', 'lnk_1'] },
    service: 'content.reorderSpaceLinks',
    expected: ['cmy_1', 'spc_1', ['lnk_2', 'lnk_1'], OWNER],
  },
  {
    tool: 'remove_space_link',
    args: { communityId: 'cmy_1', spaceId: 'spc_1', linkId: 'lnk_1' },
    service: 'content.removeSpaceLink',
    expected: ['cmy_1', 'spc_1', 'lnk_1', OWNER],
  },
  {
    tool: 'delete_space',
    args: { communityId: 'cmy_1', spaceId: 'spc_1' },
    service: 'content.deleteSpace',
    expected: ['cmy_1', 'spc_1', OWNER],
    returns: undefined,
  },
  {
    tool: 'delete_community',
    args: { communityId: 'cmy_1' },
    service: 'content.deleteCommunity',
    expected: ['cmy_1', OWNER],
    returns: undefined,
  },
  {
    tool: 'get_community_analytics',
    args: { communityId: 'cmy_1' },
    service: 'reporting.admin.communityAnalytics',
    expected: ['cmy_1', OWNER],
  },
];

describe('community tools', () => {
  it('declare their operation and hints', () => {
    expect(toolSpecs(communityTools)).toEqual([
      ['list_communities', 'read', true, false],
      ['list_spaces', 'read', true, false],
      ['create_community', 'write', false, false],
      ['update_community', 'write', true, false],
      ['update_community_messaging', 'write', true, false],
      ['create_space', 'write', false, false],
      ['update_space', 'write', true, false],
      ['reorder_spaces', 'write', true, false],
      ['set_space_topics', 'write', true, false],
      ['add_space_link', 'write', false, false],
      ['reorder_space_links', 'write', true, false],
      ['remove_space_link', 'destructive', true, false],
      ['delete_space', 'destructive', true, false],
      ['delete_community', 'destructive', true, false],
      ['get_community_analytics', 'read', true, false],
    ]);
  });

  it.each(cases)('$tool calls $service once', (c) => runCase(communityTools, c));
});
