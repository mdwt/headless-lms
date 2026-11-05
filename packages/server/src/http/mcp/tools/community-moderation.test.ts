import { describe, expect, it } from 'vitest';
import { OWNER, runCase, toolSpecs, type ToolCase } from '../test-support.js';
import { communityModerationTools } from './community-moderation.js';

const cases: ToolCase[] = [
  {
    tool: 'get_space_moderation_queue',
    args: { communityId: 'cmy_1', spaceId: 'spc_1' },
    service: 'posts.moderationQueue',
    expected: ['cmy_1', 'spc_1', OWNER],
  },
  {
    tool: 'get_message_moderation_queue',
    args: { communityId: 'cmy_1' },
    service: 'chats.messageQueue',
    expected: ['cmy_1', OWNER],
  },
  {
    tool: 'approve_post',
    args: { communityId: 'cmy_1', postId: 'pst_1' },
    service: 'posts.approve',
    expected: ['pst_1', 'cmy_1', OWNER],
  },
  {
    tool: 'dismiss_post_flags',
    args: { communityId: 'cmy_1', postId: 'pst_1', resolution: 'dismissed' },
    service: 'posts.resolveFlags',
    expected: ['pst_1', 'dismissed', 'cmy_1', OWNER],
    returns: undefined,
  },
  {
    tool: 'remove_post',
    args: { communityId: 'cmy_1', postId: 'pst_1' },
    service: 'posts.remove',
    expected: ['pst_1', 'cmy_1', OWNER],
  },
  {
    tool: 'restore_post',
    args: { communityId: 'cmy_1', postId: 'pst_1' },
    service: 'posts.restore',
    expected: ['pst_1', 'cmy_1', OWNER],
  },
  {
    tool: 'dismiss_post_comment_flags',
    args: { communityId: 'cmy_1', commentId: 'cmt_1' },
    service: 'discussion.resolveReports',
    expected: ['cmt_1', { communityId: 'cmy_1' }, OWNER],
    returns: undefined,
  },
  {
    tool: 'remove_post_comment',
    args: { communityId: 'cmy_1', commentId: 'cmt_1' },
    service: 'discussion.remove',
    expected: ['cmt_1', { communityId: 'cmy_1' }, OWNER],
  },
  {
    tool: 'restore_post_comment',
    args: { communityId: 'cmy_1', commentId: 'cmt_1' },
    service: 'discussion.restore',
    expected: ['cmt_1', { communityId: 'cmy_1' }, OWNER],
  },
  {
    tool: 'dismiss_message_flags',
    args: { communityId: 'cmy_1', messageId: 'msg_1', resolution: 'dismissed' },
    service: 'chats.resolveMessageFlags',
    expected: ['msg_1', 'dismissed', 'cmy_1', OWNER],
    returns: undefined,
  },
  {
    tool: 'lock_chat',
    args: { communityId: 'cmy_1', chatId: 'cht_1' },
    service: 'chats.lock',
    expected: ['cht_1', 'cmy_1', OWNER],
  },
  {
    tool: 'unlock_chat',
    args: { communityId: 'cmy_1', chatId: 'cht_1' },
    service: 'chats.unlock',
    expected: ['cht_1', 'cmy_1', OWNER],
  },
];

describe('community moderation tools', () => {
  it('name their operation and hints', () => {
    expect(toolSpecs(communityModerationTools)).toEqual([
      ['get_space_moderation_queue', 'posts.moderationQueue', 'read', true, false],
      ['get_message_moderation_queue', 'chats.messageQueue', 'read', true, false],
      ['approve_post', 'posts.approve', 'write', true, false],
      ['dismiss_post_flags', 'posts.resolveFlags', 'write', true, false],
      ['remove_post', 'posts.remove', 'destructive', true, false],
      ['restore_post', 'posts.restore', 'write', true, false],
      ['dismiss_post_comment_flags', 'discussion.resolveReports', 'write', true, false],
      ['remove_post_comment', 'discussion.remove', 'destructive', true, false],
      ['restore_post_comment', 'discussion.restore', 'write', true, false],
      ['dismiss_message_flags', 'chats.resolveMessageFlags', 'write', true, false],
      ['lock_chat', 'chats.lock', 'destructive', true, false],
      ['unlock_chat', 'chats.unlock', 'write', true, false],
    ]);
  });

  it.each(cases)('$tool calls $service once', (c) => runCase(communityModerationTools, c));
});
