import { describe, expect, it } from 'vitest';
import { RECIPIENT_RULES } from './index.js';

describe('RECIPIENT_RULES', () => {
  it('has one rule for every event that produces notifications', () => {
    expect(Object.keys(RECIPIENT_RULES).sort()).toEqual(
      [
        'content.course.activity.published',
        'discussion.chat.created',
        'discussion.chat.participant.added',
        'discussion.comment.created',
        'discussion.comment.published',
        'discussion.comment.reaction.added',
        'discussion.comment.removed',
        'discussion.comment.reported',
        'discussion.comment.updated',
        'discussion.digest.due',
        'discussion.message.reaction.added',
        'discussion.message.reported',
        'discussion.message.sent',
        'discussion.message.updated',
        'discussion.post.created',
        'discussion.post.published',
        'discussion.post.reaction.added',
        'discussion.post.removed',
        'discussion.post.reported',
        'discussion.post.updated',
        'entitlement.created',
        'entitlement.deleted',
        'entitlement.ending_soon',
        'entitlement.expired',
        'entitlement.space_member.created',
        'entitlement.space_member.deleted',
        'entitlement.space_member.updated',
        'organization.user.updated',
      ].sort(),
    );
  });
});
