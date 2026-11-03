import type { NotificationTypeDeclaration } from '../../types/index.js';

export const NOTIFICATION_TYPES: NotificationTypeDeclaration[] = [
  {
    type: 'post.published',
    scopes: ['space'],
    reasons: ['space_member'],
    display: { space: ['spaceName', 'postTitle', 'authorName', 'excerpt'] },
    email: { space: { template: 'newPostInSpace' } },
    push: { space: { title: 'New post in {{spaceName}}', body: '{{authorName}}: {{postTitle}}' } },
  },
  {
    type: 'post.approved',
    scopes: ['space'],
    reasons: ['subject'],
    display: { space: ['postTitle', 'spaceName'] },
    email: { space: { template: 'yourPostWasPublished' } },
    push: {
      space: {
        title: 'Your post was published',
        body: '{{postTitle}} is live in {{spaceName}}',
      },
    },
  },
  {
    type: 'post.awaiting_review',
    scopes: ['space'],
    reasons: ['moderator'],
    display: { space: ['spaceName', 'postTitle', 'authorName'] },
    email: { space: { template: 'postAwaitingReview' } },
    push: {
      space: {
        title: 'Post awaiting review in {{spaceName}}',
        body: '{{authorName}}: {{postTitle}}',
      },
    },
  },
  {
    type: 'post.removed',
    scopes: ['space'],
    reasons: ['subject'],
    display: { space: ['postTitle', 'spaceName'] },
    email: { space: { template: 'yourPostWasRemoved' } },
    push: {
      space: {
        title: 'Your post was removed',
        body: '{{postTitle}} was removed from {{spaceName}}',
      },
    },
  },
  {
    type: 'post.reacted',
    scopes: ['space'],
    reasons: ['post_author'],
    display: { space: ['postTitle', 'reactorName', 'reaction'] },
    email: { space: { template: 'postReacted' } },
    push: {
      space: {
        title: '{{reactorName}} reacted to your post',
        body: '{{reaction}} on {{postTitle}}',
      },
    },
  },
  {
    type: 'comment.created',
    scopes: ['space', 'org'],
    reasons: ['post_author', 'comment_author', 'follower', 'thread_participant'],
    display: {
      space: ['postTitle', 'commenterName', 'excerpt'],
      org: ['activityTitle', 'courseTitle', 'courseId', 'commenterName', 'excerpt'],
    },
    email: {
      space: { template: 'newCommentOnPost', byReason: { comment_author: 'replyToYourComment' } },
      org: { template: 'activityCommentCreated' },
    },
    push: {
      space: { title: '{{commenterName}} commented on {{postTitle}}', body: '{{excerpt}}' },
      org: { title: '{{commenterName}} commented on {{activityTitle}}', body: '{{excerpt}}' },
    },
  },
  {
    type: 'comment.removed',
    scopes: ['space', 'org'],
    reasons: ['subject'],
    display: {
      space: ['postTitle'],
      org: ['activityTitle', 'courseTitle', 'courseId'],
    },
    email: {
      space: { template: 'yourCommentWasRemoved' },
      org: { template: 'activityCommentRemoved' },
    },
    push: {
      space: {
        title: 'Your comment was removed',
        body: 'Your comment on {{postTitle}} was removed',
      },
      org: {
        title: 'Your comment was removed',
        body: 'Your comment on {{activityTitle}} was removed',
      },
    },
  },
  {
    type: 'comment.reacted',
    scopes: ['space', 'org'],
    reasons: ['comment_author'],
    display: {
      space: ['postTitle', 'excerpt', 'reactorName', 'reaction'],
      org: ['activityTitle', 'courseTitle', 'courseId', 'excerpt', 'reactorName', 'reaction'],
    },
    email: {
      space: { template: 'commentReacted' },
      org: { template: 'activityCommentReacted' },
    },
    push: {
      space: {
        title: '{{reactorName}} reacted to your comment',
        body: '{{reaction}} on your comment in {{postTitle}}',
      },
      org: {
        title: '{{reactorName}} reacted to your comment',
        body: '{{reaction}} on your comment in {{activityTitle}}',
      },
    },
  },
  {
    type: 'content.flagged',
    scopes: ['space', 'org'],
    reasons: ['moderator', 'staff'],
    display: {
      space: ['spaceName', 'excerpt', 'reason'],
      org: ['activityTitle', 'courseTitle', 'courseId', 'excerpt', 'reason'],
    },
    email: {
      space: { template: 'somethingWasFlagged' },
      org: { template: 'activityCommentFlagged' },
    },
    push: {
      space: { title: 'Something was flagged in {{spaceName}}', body: '{{reason}}: {{excerpt}}' },
      org: {
        title: 'A comment was flagged in {{activityTitle}}',
        body: '{{reason}}: {{excerpt}}',
      },
    },
  },
  {
    type: 'mention',
    scopes: ['space', 'chat', 'org'],
    reasons: ['mentioned'],
    display: {
      space: ['authorName', 'excerpt', 'postTitle'],
      chat: ['authorName', 'excerpt', 'chatTitle'],
      org: ['authorName', 'excerpt', 'activityTitle', 'courseTitle', 'courseId'],
    },
    email: {
      space: { template: 'mention' },
      chat: { template: 'mention' },
      org: { template: 'activityMention' },
    },
    push: {
      space: { title: '{{authorName}} mentioned you in {{postTitle}}', body: '{{excerpt}}' },
      chat: { title: '{{authorName}} mentioned you in {{chatTitle}}', body: '{{excerpt}}' },
      org: { title: '{{authorName}} mentioned you in {{activityTitle}}', body: '{{excerpt}}' },
    },
  },
  {
    type: 'message.sent',
    scopes: ['chat'],
    reasons: ['participant'],
    display: { chat: ['senderName', 'chatTitle', 'excerpt', 'count', 'summary'] },
    email: { chat: { template: 'newMessage' } },
    push: { chat: { title: '{{chatTitle}}', body: '{{senderName}}: {{summary}}' } },
  },
  {
    type: 'message.reacted',
    scopes: ['chat'],
    reasons: ['message_author'],
    display: { chat: ['excerpt', 'reactorName', 'reaction'] },
    email: { chat: { template: 'messageReacted' } },
    push: {
      chat: {
        title: '{{reactorName}} reacted to your message',
        body: '{{reaction}} on {{excerpt}}',
      },
    },
  },
  {
    type: 'message.flagged',
    scopes: ['chat'],
    reasons: ['staff'],
    display: { chat: ['reason'] },
    email: { chat: { template: 'messageWasFlagged' } },
    push: { chat: { title: 'A message was flagged', body: '{{reason}}' } },
  },
  {
    type: 'chat.request',
    scopes: ['chat'],
    reasons: ['participant'],
    display: { chat: ['senderName', 'excerpt'] },
    email: { chat: { template: 'messageRequest' } },
    push: { chat: { title: '{{senderName}} sent you a message request', body: '{{excerpt}}' } },
  },
  {
    type: 'chat.added',
    scopes: ['chat'],
    reasons: ['subject'],
    display: { chat: ['adderName', 'participantNames'] },
    email: { chat: { template: 'addedToGroupChat' } },
    push: {
      chat: { title: '{{adderName}} added you to a chat', body: 'With {{participantNames}}' },
    },
  },
  {
    type: 'digest',
    scopes: ['community'],
    reasons: ['community_member'],
    display: { community: ['communityTitle', 'from', 'to', 'posts'] },
    email: { community: { template: 'digest' } },
    push: {
      community: {
        title: '{{communityTitle}} digest',
        body: 'The latest posts in {{communityTitle}}',
      },
    },
  },
  {
    type: 'space.join_requested',
    scopes: ['space'],
    reasons: ['moderator'],
    display: { space: ['spaceName', 'memberName', 'seatsLeft'] },
    email: { space: { template: 'joinRequest' } },
    push: {
      space: {
        title: '{{memberName}} asked to join {{spaceName}}',
        body: 'Seats left: {{seatsLeft}}',
      },
    },
  },
  {
    type: 'space.invited',
    scopes: ['space'],
    reasons: ['subject'],
    display: { space: ['spaceName', 'inviterName'] },
    email: { space: { template: 'invitedToSpace' } },
    push: {
      space: {
        title: '{{inviterName}} invited you to {{spaceName}}',
        body: 'Open {{spaceName}} to accept',
      },
    },
  },
  {
    type: 'space.request_approved',
    scopes: ['space'],
    reasons: ['subject'],
    display: { space: ['spaceName'] },
    email: { space: { template: 'requestApproved' } },
    push: {
      space: {
        title: "You're in {{spaceName}}",
        body: 'Your request to join {{spaceName}} was approved',
      },
    },
  },
  {
    type: 'space.request_declined',
    scopes: ['space'],
    reasons: ['subject'],
    display: { space: ['spaceName'] },
    email: { space: { template: 'requestDeclined' } },
    push: {
      space: {
        title: 'Request declined',
        body: 'Your request to join {{spaceName}} was declined',
      },
    },
  },
  {
    type: 'community.welcome',
    scopes: ['community'],
    reasons: ['subject'],
    display: { community: ['communityTitle', 'spaceNames'] },
    email: { community: { template: 'welcomeToCommunity' } },
    push: {
      community: { title: 'Welcome to {{communityTitle}}', body: 'You can open {{spaceNames}}' },
    },
  },
  {
    type: 'community.ending_soon',
    scopes: ['community'],
    reasons: ['subject'],
    display: { community: ['communityTitle', 'expiresAt'] },
    email: { community: { template: 'membershipEndingSoon' } },
    push: {
      community: {
        title: '{{communityTitle}} ends soon',
        body: 'Your access to {{communityTitle}} ends within a week',
      },
    },
  },
  {
    type: 'community.membership_ended',
    scopes: ['org'],
    reasons: ['subject'],
    display: { org: ['communities'] },
    email: { org: { template: 'membershipEnded' } },
    push: { org: { title: 'Your membership has ended', body: 'Your access to a community ended' } },
  },
  {
    type: 'access.granted',
    scopes: ['org'],
    reasons: ['subject'],
    display: { org: ['contentTitle', 'contentType'] },
    email: { org: { template: 'accessGranted' } },
    push: {
      org: {
        title: 'You now have access to {{contentTitle}}',
        body: 'Your {{contentType}} is ready',
      },
    },
  },
  {
    type: 'access.revoked',
    scopes: ['org'],
    reasons: ['subject'],
    display: { org: ['contentTitle'] },
    email: { org: { template: 'accessRevoked' } },
    push: {
      org: { title: 'Access removed', body: 'You no longer have access to {{contentTitle}}' },
    },
  },
  {
    type: 'course.activity_added',
    scopes: ['org'],
    reasons: ['course_member'],
    display: { org: ['courseTitle', 'moduleTitle', 'activityTitle'] },
    email: { org: { template: 'courseActivityAdded' } },
    push: {
      org: { title: 'New in {{courseTitle}}', body: '{{activityTitle}} in {{moduleTitle}}' },
    },
  },
  {
    type: 'moderator.assigned',
    scopes: ['org'],
    reasons: ['subject'],
    display: { org: ['communityTitles'] },
    email: { org: { template: 'youAreNowAModerator' } },
    push: {
      org: { title: 'You are now a moderator', body: 'You can moderate {{communityTitles}}' },
    },
  },
];
