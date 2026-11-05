import { describe, expect, it } from 'vitest';
import { OWNER, runCase, toolSpecs, type ToolCase } from '../test-support.js';
import { commentTools } from './comments.js';

const cases: ToolCase[] = [
  {
    tool: 'list_comments',
    args: { reported: 'true' },
    service: 'discussion.listComments',
    expected: [{ page: 1, pageSize: 20, reported: true }, OWNER],
  },
  {
    tool: 'publish_comment',
    args: { commentId: 'cmt_1' },
    service: 'discussion.publish',
    expected: ['cmt_1', 'lesson', OWNER],
  },
  {
    tool: 'dismiss_comment_reports',
    args: { commentId: 'cmt_1' },
    service: 'discussion.resolveReports',
    expected: ['cmt_1', 'lesson', OWNER],
    returns: undefined,
  },
  {
    tool: 'reply_to_comment',
    args: { commentId: 'cmt_1', body: 'Thanks!' },
    service: 'discussion.replyToComment',
    expected: ['cmt_1', 'Thanks!', OWNER],
  },
  {
    tool: 'remove_comment',
    args: { commentId: 'cmt_1' },
    service: 'discussion.remove',
    expected: ['cmt_1', 'lesson', OWNER],
  },
];

describe('comment tools', () => {
  it('name their operation and hints', () => {
    expect(toolSpecs(commentTools)).toEqual([
      ['list_comments', 'discussion.listComments', 'read', true, false],
      ['publish_comment', 'discussion.publish', 'write', true, false],
      ['dismiss_comment_reports', 'discussion.resolveReports', 'write', true, false],
      ['reply_to_comment', 'discussion.replyToComment', 'write', false, false],
      ['remove_comment', 'discussion.remove', 'destructive', true, false],
    ]);
  });

  it.each(cases)('$tool calls $service once', (c) => runCase(commentTools, c));
});
