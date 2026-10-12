import { describe, expect, it } from 'vitest';
import { runCase, toolSpecs, type ToolCase } from '../test-support.js';
import { commentTools } from './comments.js';

const actor = { id: 'ou_1', role: 'owner' };

const cases: ToolCase[] = [
  {
    tool: 'list_comments',
    args: { reported: 'true' },
    service: 'discussion.listComments',
    expected: ['org_1', { page: 1, pageSize: 20, reported: true }],
  },
  {
    tool: 'publish_comment',
    args: { commentId: 'cmt_1' },
    service: 'discussion.publish',
    expected: ['org_1', 'cmt_1', actor],
  },
  {
    tool: 'dismiss_comment_reports',
    args: { commentId: 'cmt_1' },
    service: 'discussion.resolveReports',
    expected: ['org_1', 'cmt_1', actor],
    returns: undefined,
  },
  {
    tool: 'reply_to_comment',
    args: { activityId: 'act_1', commentId: 'cmt_1', body: 'Thanks!' },
    service: 'discussion.postComment',
    expected: ['org_1', { actor, activityId: 'act_1', parentId: 'cmt_1', body: 'Thanks!' }],
  },
  {
    tool: 'remove_comment',
    args: { commentId: 'cmt_1' },
    service: 'discussion.remove',
    expected: ['org_1', 'cmt_1', actor],
  },
];

describe('comment tools', () => {
  it('declare their scope and hints', () => {
    expect(toolSpecs(commentTools)).toEqual([
      ['list_comments', 'comments:read', 'read', true, false],
      ['publish_comment', 'comments:moderate', 'write', true, false],
      ['dismiss_comment_reports', 'comments:moderate', 'write', true, false],
      ['reply_to_comment', 'comments:moderate', 'write', false, false],
      ['remove_comment', 'comments:moderate', 'destructive', true, false],
    ]);
  });

  it.each(cases)('$tool calls $service once', (c) => runCase(commentTools, c));
});
