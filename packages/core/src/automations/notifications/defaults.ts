import type { NotificationCategory } from '../../types/index.js';

const on = { default: true, locked: false };
const off = { default: false, locked: false };
const lockedOn = { default: true, locked: true };

export const DEFAULT_COMMUNITY_CATEGORIES: NotificationCategory[] = [
  {
    key: 'about_you',
    covers: [
      { type: 'post.approved', reasons: ['subject'] },
      { type: 'post.removed', reasons: ['subject'] },
      { type: 'comment.removed', reasons: ['subject'] },
      { type: 'space.invited', reasons: ['subject'] },
      { type: 'space.request_approved', reasons: ['subject'] },
      { type: 'space.request_declined', reasons: ['subject'] },
      { type: 'community.welcome', reasons: ['subject'] },
      { type: 'community.ending_soon', reasons: ['subject'] },
      { type: 'chat.added', reasons: ['subject'] },
    ],
    channels: { inApp: lockedOn, email: on, push: on },
  },
  {
    key: 'review',
    covers: [
      { type: 'post.awaiting_review', reasons: ['moderator'] },
      { type: 'space.join_requested', reasons: ['moderator'] },
      { type: 'content.flagged', reasons: ['moderator'] },
      { type: 'message.flagged', reasons: ['moderator'] },
    ],
    channels: { inApp: on, email: on, push: on },
  },
  {
    key: 'mentions',
    covers: [{ type: 'mention', reasons: ['mentioned'] }],
    channels: { inApp: on, email: on, push: on },
  },
  {
    key: 'comments_on_my_posts',
    covers: [{ type: 'comment.created', reasons: ['post_author'] }],
    channels: { inApp: on, email: on, push: on },
  },
  {
    key: 'replies_to_my_comments',
    covers: [{ type: 'comment.created', reasons: ['comment_author'] }],
    channels: { inApp: on, email: on, push: on },
  },
  {
    key: 'followed_posts',
    covers: [{ type: 'comment.created', reasons: ['follower', 'thread_participant'] }],
    channels: { inApp: on, email: off, push: on },
  },
  {
    key: 'messages',
    covers: [
      { type: 'message.sent', reasons: ['participant'] },
      { type: 'chat.request', reasons: ['participant'] },
      { type: 'message.reacted', reasons: ['message_author'] },
    ],
    channels: { inApp: on, email: off, push: on },
  },
  {
    key: 'likes_on_my_posts',
    covers: [{ type: 'post.reacted', reasons: ['post_author'] }],
    channels: { inApp: on, email: off, push: off },
  },
  {
    key: 'likes_on_my_comments',
    covers: [{ type: 'comment.reacted', reasons: ['comment_author'] }],
    channels: { inApp: on, email: off, push: off },
  },
  {
    key: 'new_posts',
    perSpace: true,
    covers: [{ type: 'post.published', reasons: ['space_member'] }],
    channels: { inApp: off, email: off, push: off },
  },
  {
    key: 'digest',
    covers: [{ type: 'digest', reasons: ['community_member'] }],
    channels: { email: on },
  },
];

export const DEFAULT_ORG_CATEGORIES: NotificationCategory[] = [
  {
    key: 'about_you',
    covers: [
      { type: 'role.assigned', reasons: ['subject'] },
      { type: 'comment.removed', reasons: ['subject'] },
    ],
    channels: { inApp: lockedOn, email: on, push: on },
  },
  {
    key: 'review',
    covers: [{ type: 'content.flagged', reasons: ['moderator'] }],
    channels: { inApp: on, email: on, push: on },
  },
  {
    key: 'mentions',
    covers: [{ type: 'mention', reasons: ['mentioned'] }],
    channels: { inApp: on, email: on, push: on },
  },
  {
    key: 'replies_to_my_comments',
    covers: [{ type: 'comment.created', reasons: ['comment_author'] }],
    channels: { inApp: on, email: on, push: on },
  },
  {
    key: 'followed_threads',
    covers: [{ type: 'comment.created', reasons: ['thread_participant'] }],
    channels: { inApp: on, email: off, push: on },
  },
  {
    key: 'likes_on_my_comments',
    covers: [{ type: 'comment.reacted', reasons: ['comment_author'] }],
    channels: { inApp: on, email: off, push: off },
  },
  {
    key: 'access',
    covers: [
      { type: 'access.granted', reasons: ['subject'] },
      { type: 'access.revoked', reasons: ['subject'] },
      { type: 'community.membership_ended', reasons: ['subject'] },
    ],
    channels: { inApp: on, email: lockedOn },
  },
  {
    key: 'events',
    covers: [
      { type: 'event.granted', reasons: ['event_member'] },
      { type: 'event.starting_soon', reasons: ['event_member'] },
      { type: 'event.changed', reasons: ['event_member'] },
      { type: 'event.canceled', reasons: ['event_member'] },
      { type: 'event.revoked', reasons: ['event_member'] },
    ],
    channels: { inApp: lockedOn, email: on, push: on },
  },
  {
    key: 'course_content',
    covers: [{ type: 'course.activity_added', reasons: ['course_member'] }],
    channels: { inApp: on, email: off, push: off },
  },
];
