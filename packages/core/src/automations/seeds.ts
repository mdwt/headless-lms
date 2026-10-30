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

function notify(kind: string, communityId?: string): AutomationAction {
  return {
    type: 'notify',
    input: communityId === undefined ? { kind } : { kind, communityId },
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
      description: 'Notify the person when they are given the moderator role.',
      triggers: ['organization.user.updated'],
      actions: [notify('youAreNowAModerator')],
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
      name: 'Send digest',
      description: 'Open the daily digest for every community.',
      triggers: ['schedule:0 7 * * *'],
      actions: [{ type: 'sendDigest', input: {} }],
      filter: null,
    },
    {
      name: 'Remove unattached uploads',
      description: 'Remove member uploads older than an hour that nothing references.',
      triggers: ['schedule:0 * * * *'],
      actions: [{ type: 'removeUnattachedUploads', input: {} }],
      filter: null,
    },
    {
      name: 'Welcome to the community',
      description: 'Notify a person when a grant opens a community.',
      triggers: ['entitlement.created'],
      actions: [notify('welcomeToCommunity')],
      filter: null,
    },
    {
      name: 'Membership ended',
      description: 'Email a person when a grant that opened a community ends.',
      triggers: ['entitlement.expired', 'entitlement.deleted'],
      actions: [email('membershipEnded')],
      filter: null,
    },
  ];
}

export function communitySeeds(communityId: string): SeedAutomation[] {
  const filter = { communityId };
  const scoped = (template: string): AutomationAction => email(template, communityId);
  const told = (kind: string): AutomationAction => notify(kind, communityId);
  return [
    {
      name: 'Membership ending soon',
      description: 'Notify a member a week before this community grant ends.',
      triggers: ['entitlement.ending_soon'],
      actions: [told('membershipEndingSoon')],
      filter: { communityId },
    },
    {
      name: 'New post in a space',
      description: 'Notify members who can open the space.',
      triggers: ['discussion.post.published'],
      actions: [told('newPostInSpace')],
      filter,
    },
    {
      name: 'Your post was published',
      description: 'Notify the author when a pending post is published.',
      triggers: ['discussion.post.published'],
      actions: [told('yourPostWasPublished')],
      filter,
    },
    {
      name: 'Your post was removed',
      description: 'Notify the author when someone else removes their post.',
      triggers: ['discussion.post.removed'],
      actions: [told('yourPostWasRemoved')],
      filter,
    },
    {
      name: 'New comment on a post you follow',
      description: 'Notify the author and followers when a comment is published.',
      triggers: ['discussion.comment.created'],
      actions: [told('newCommentOnPost')],
      filter,
    },
    {
      name: 'Reply to your comment',
      description: 'Notify the parent author when a reply is published.',
      triggers: ['discussion.comment.created'],
      actions: [told('replyToYourComment')],
      filter,
    },
    {
      name: 'Your comment was removed',
      description: 'Notify the author when someone else removes their comment.',
      triggers: ['discussion.comment.removed'],
      actions: [told('yourCommentWasRemoved')],
      filter,
    },
    {
      name: 'Post awaiting review',
      description: 'Notify staff and moderators when a post enters review.',
      triggers: ['discussion.post.created', 'discussion.post.updated'],
      actions: [told('postAwaitingReview')],
      filter,
    },
    {
      name: 'Join request',
      description: 'Notify staff and moderators when someone requests a space.',
      triggers: ['entitlement.space_member.created'],
      actions: [told('joinRequest')],
      filter,
    },
    {
      name: 'Request approved',
      description: 'Notify the member when their request is approved.',
      triggers: ['entitlement.space_member.updated'],
      actions: [told('requestApproved')],
      filter,
    },
    {
      name: 'Request declined',
      description: 'Notify the person when their request is declined.',
      triggers: ['entitlement.space_member.deleted'],
      actions: [told('requestDeclined')],
      filter,
    },
    {
      name: 'Invited to a space',
      description: 'Notify the person when they are invited to a space.',
      triggers: ['entitlement.space_member.created'],
      actions: [told('invitedToSpace')],
      filter,
    },
    {
      name: 'New message',
      description: 'Notify participants who are not muted, at most once per chat per 15 minutes.',
      triggers: ['discussion.message.sent'],
      actions: [told('newMessage')],
      filter,
    },
    {
      name: 'Message request',
      description: 'Notify the recipient when a direct chat starts as a request.',
      triggers: ['discussion.chat.created'],
      actions: [told('messageRequest')],
      filter,
    },
    {
      name: 'Added to a group chat',
      description: 'Notify the person added to a group chat.',
      triggers: ['discussion.chat.participant.added'],
      actions: [told('addedToGroupChat')],
      filter,
    },
    {
      name: 'Something was flagged',
      description: 'Notify staff and moderators when a post or comment is flagged.',
      triggers: ['discussion.post.reported', 'discussion.comment.reported'],
      actions: [told('somethingWasFlagged')],
      filter,
    },
    {
      name: 'A message was flagged',
      description: 'Notify staff when a message is flagged.',
      triggers: ['discussion.message.reported'],
      actions: [told('messageWasFlagged')],
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
