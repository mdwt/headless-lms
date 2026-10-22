import type { JsonValue } from '../types/index.js';
import type { AutomationAction } from './model.js';

export interface SeedAutomation {
  name: string;
  description: string;
  triggers: string[];
  actions: AutomationAction[];
  filter: Record<string, JsonValue> | null;
}

function email(template: string, communityId?: string): AutomationAction {
  return {
    type: 'sendEmail',
    input: communityId === undefined ? { template } : { template, communityId },
  };
}

export function orgSeeds(): SeedAutomation[] {
  return [
    {
      name: 'Access granted',
      description: 'Email the person when they are granted a content item.',
      triggers: ['entitlement.created'],
      actions: [email('accessGranted')],
      filter: null,
    },
    {
      name: 'Access revoked',
      description: 'Email the person when a content grant is deleted.',
      triggers: ['entitlement.deleted'],
      actions: [email('accessRevoked')],
      filter: null,
    },
    {
      name: 'You are now a moderator',
      description: 'Email the person when they are given the moderator role.',
      triggers: ['organization.user.updated'],
      actions: [email('youAreNowAModerator')],
      filter: null,
    },
    {
      name: 'Publish due posts',
      description: 'Submit scheduled posts whose time has passed.',
      triggers: ['schedule:* * * * *'],
      actions: [{ type: 'publishDuePosts', input: {} }],
      filter: null,
    },
    {
      name: 'Expire due grants',
      description: 'Expire grants whose time has passed and remind those ending within a week.',
      triggers: ['schedule:0 * * * *'],
      actions: [{ type: 'expireDueGrants', input: {} }],
      filter: null,
    },
    {
      name: 'Digest',
      description: 'Open the daily digest for every community.',
      triggers: ['schedule:0 7 * * *'],
      actions: [{ type: 'sendDigest', input: {} }],
      filter: null,
    },
  ];
}

export function communitySeeds(communityId: string): SeedAutomation[] {
  const filter = { communityId };
  const scoped = (template: string): AutomationAction => email(template, communityId);
  return [
    {
      name: 'Welcome to the community',
      description: 'Email a person when a grant opens this community.',
      triggers: ['entitlement.created'],
      actions: [scoped('welcomeToCommunity')],
      filter: null,
    },
    {
      name: 'Membership ending soon',
      description: 'Email a member a week before this community grant ends.',
      triggers: ['entitlement.ending_soon'],
      actions: [scoped('membershipEndingSoon')],
      filter: { communityId },
    },
    {
      name: 'Membership ended',
      description: 'Email a person when a grant that opened this community ends.',
      triggers: ['entitlement.expired', 'entitlement.deleted'],
      actions: [scoped('membershipEnded')],
      filter: null,
    },
    {
      name: 'New post in a space',
      description: 'Email members who can open the space. Not sent until email preferences exist.',
      triggers: ['discussion.post.published'],
      actions: [scoped('newPostInSpace')],
      filter,
    },
    {
      name: 'Your post was published',
      description: 'Email the author when a pending post is published.',
      triggers: ['discussion.post.published'],
      actions: [scoped('yourPostWasPublished')],
      filter,
    },
    {
      name: 'Your post was removed',
      description: 'Email the author when someone else removes their post.',
      triggers: ['discussion.post.removed'],
      actions: [scoped('yourPostWasRemoved')],
      filter,
    },
    {
      name: 'New comment on a post you follow',
      description: 'Email the author and followers when a comment is published.',
      triggers: ['discussion.comment.created'],
      actions: [scoped('newCommentOnPost')],
      filter,
    },
    {
      name: 'Reply to your comment',
      description: 'Email the parent author when a reply is published.',
      triggers: ['discussion.comment.created'],
      actions: [scoped('replyToYourComment')],
      filter,
    },
    {
      name: 'Your comment was removed',
      description: 'Email the author when someone else removes their comment.',
      triggers: ['discussion.comment.removed'],
      actions: [scoped('yourCommentWasRemoved')],
      filter,
    },
    {
      name: 'Post awaiting review',
      description: 'Email staff and moderators when a post enters review.',
      triggers: ['discussion.post.created', 'discussion.post.updated'],
      actions: [scoped('postAwaitingReview')],
      filter,
    },
    {
      name: 'Join request',
      description: 'Email staff and moderators when someone requests a space.',
      triggers: ['entitlement.space_member.created'],
      actions: [scoped('joinRequest')],
      filter,
    },
    {
      name: 'Request approved',
      description: 'Email the member when their request is approved.',
      triggers: ['entitlement.space_member.updated'],
      actions: [scoped('requestApproved')],
      filter,
    },
    {
      name: 'Request declined',
      description: 'Email the person when their request is declined.',
      triggers: ['entitlement.space_member.deleted'],
      actions: [scoped('requestDeclined')],
      filter,
    },
    {
      name: 'Invited to a space',
      description: 'Email the person when they are invited to a space.',
      triggers: ['entitlement.space_member.created'],
      actions: [scoped('invitedToSpace')],
      filter,
    },
    {
      name: 'New message',
      description: 'Email participants who are not muted, at most once per chat per 15 minutes.',
      triggers: ['discussion.message.sent'],
      actions: [scoped('newMessage')],
      filter,
    },
    {
      name: 'Message request',
      description: 'Email the recipient when a direct chat starts as a request.',
      triggers: ['discussion.chat.created'],
      actions: [scoped('messageRequest')],
      filter,
    },
    {
      name: 'Added to a group chat',
      description: 'Email the person added to a group chat.',
      triggers: ['discussion.chat.participant.added'],
      actions: [scoped('addedToGroupChat')],
      filter,
    },
    {
      name: 'Something was flagged',
      description: 'Email staff and moderators when a post or comment is flagged.',
      triggers: ['discussion.post.reported', 'discussion.comment.reported'],
      actions: [scoped('somethingWasFlagged')],
      filter,
    },
    {
      name: 'A message was flagged',
      description: 'Email staff when a message is flagged.',
      triggers: ['discussion.message.reported'],
      actions: [scoped('messageWasFlagged')],
      filter,
    },
    {
      name: 'Digest',
      description: 'Email members their unread activity. Not sent until email preferences exist.',
      triggers: ['discussion.digest.due'],
      actions: [scoped('digest')],
      filter,
    },
  ];
}

export function seedKey(row: { name: string; filter: Record<string, JsonValue> | null }): string {
  return `${row.name}\0${JSON.stringify(row.filter)}`;
}
