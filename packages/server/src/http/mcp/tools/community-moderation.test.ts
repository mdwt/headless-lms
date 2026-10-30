import { describe, expect, it } from 'vitest';
import { runCase, toolSpecs, type ToolCase } from '../test-support.js';
import { communityModerationTools } from './community-moderation.js';

const actor = { id: 'ou_1', role: 'owner' };

const cases: ToolCase[] = [
  {
    tool: 'get_space_moderation_queue',
    args: { communityId: 'cmy_1', spaceId: 'spc_1' },
    service: 'posts.moderationQueue',
    expected: ['org_1', actor, 'cmy_1', 'spc_1'],
  },
  {
    tool: 'get_message_moderation_queue',
    args: { communityId: 'cmy_1' },
    service: 'chats.messageQueue',
    expected: ['org_1', actor, 'cmy_1'],
  },
  {
    tool: 'approve_post',
    args: { communityId: 'cmy_1', postId: 'pst_1' },
    service: 'posts.approve',
    expected: ['org_1', 'pst_1', actor, 'cmy_1'],
  },
  {
    tool: 'dismiss_post_flags',
    args: { communityId: 'cmy_1', postId: 'pst_1', resolution: 'dismissed' },
    service: 'posts.resolveFlags',
    expected: ['org_1', 'pst_1', actor, 'dismissed', 'cmy_1'],
    returns: undefined,
  },
  {
    tool: 'remove_post',
    args: { communityId: 'cmy_1', postId: 'pst_1' },
    service: 'posts.remove',
    expected: ['org_1', 'pst_1', actor, 'cmy_1'],
  },
  {
    tool: 'restore_post',
    args: { communityId: 'cmy_1', postId: 'pst_1' },
    service: 'posts.restore',
    expected: ['org_1', 'pst_1', actor, 'cmy_1'],
  },
  {
    tool: 'dismiss_post_comment_flags',
    args: { communityId: 'cmy_1', commentId: 'cmt_1' },
    service: 'discussion.resolveReports',
    expected: ['org_1', 'cmt_1', actor, 'cmy_1'],
    returns: undefined,
  },
  {
    tool: 'remove_post_comment',
    args: { communityId: 'cmy_1', commentId: 'cmt_1' },
    service: 'discussion.remove',
    expected: ['org_1', 'cmt_1', actor, 'cmy_1'],
  },
  {
    tool: 'restore_post_comment',
    args: { communityId: 'cmy_1', commentId: 'cmt_1' },
    service: 'discussion.restore',
    expected: ['org_1', 'cmt_1', actor, 'cmy_1'],
  },
  {
    tool: 'dismiss_message_flags',
    args: { communityId: 'cmy_1', messageId: 'msg_1', resolution: 'dismissed' },
    service: 'chats.resolveMessageFlags',
    expected: ['org_1', actor, 'msg_1', 'dismissed', 'cmy_1'],
    returns: undefined,
  },
  {
    tool: 'lock_chat',
    args: { communityId: 'cmy_1', chatId: 'cht_1' },
    service: 'chats.lock',
    expected: ['org_1', actor, 'cht_1', 'cmy_1'],
  },
  {
    tool: 'unlock_chat',
    args: { communityId: 'cmy_1', chatId: 'cht_1' },
    service: 'chats.unlock',
    expected: ['org_1', actor, 'cht_1', 'cmy_1'],
  },
];

describe('community moderation tools', () => {
  it('declare their scope and hints', () => {
    expect(toolSpecs(communityModerationTools)).toEqual([
      ['get_space_moderation_queue', 'community_moderation:read', 'read', true, false],
      ['get_message_moderation_queue', 'community_moderation:read', 'read', true, false],
      ['approve_post', 'community_moderation:write', 'write', true, false],
      ['dismiss_post_flags', 'community_moderation:write', 'write', true, false],
      ['remove_post', 'community_moderation:write', 'destructive', true, false],
      ['restore_post', 'community_moderation:write', 'write', true, false],
      ['dismiss_post_comment_flags', 'community_moderation:write', 'write', true, false],
      ['remove_post_comment', 'community_moderation:write', 'destructive', true, false],
      ['restore_post_comment', 'community_moderation:write', 'write', true, false],
      ['dismiss_message_flags', 'community_moderation:write', 'write', true, false],
      ['lock_chat', 'community_moderation:write', 'destructive', true, false],
      ['unlock_chat', 'community_moderation:write', 'write', true, false],
    ]);
  });

  it.each(cases)('$tool calls $service once', (c) => runCase(communityModerationTools, c));
});
