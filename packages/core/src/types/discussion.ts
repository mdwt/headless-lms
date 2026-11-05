export type {
  ActivityCommentsRule,
  BlockedUser,
  Chat,
  ChatKind,
  ChatLastMessage,
  ChatLiveEvent,
  ChatStatus,
  ChatUnreadSummary,
  ChatUser,
  CommentFlagResolution,
  CommentStatus,
  DigestRun,
  FlaggedComment,
  FlaggedCommentView,
  LiveMessage,
  Mention,
  MentionItemType,
  MentionView,
  Message,
  MessageAttachment,
  MessageFile,
  MessageFlag,
  MessageFlagResolution,
  MessageReaction,
  MessageView,
  Post,
  PostView,
  PostBookmark,
  PostFlag,
  PostFlagResolution,
  PostReaction,
  PostStatus,
  ReactionEmoji,
  ReactionCounts,
  Subscription,
  SubscriptionItemType,
  SubscriptionState,
  SubscriptionView,
  CommentReaction,
  CommentSettings,
  CommentsConfig,
  CommentView,
  CommentReportSummary,
  CommentListItem,
  ListCommentsQuery,
} from './schemas/discussion.js';
import type { CommentStatus } from './schemas/discussion.js';

export interface Comment {
  readonly id: string;
  readonly orgId: string;
  readonly activityId: string | null;
  readonly postId: string | null;
  readonly communityId: string | null;
  readonly parentId: string | null;
  readonly orgUserId: string;
  body: string;
  status: CommentStatus;
  removedBy: string | null;
  readonly createdAt: Date;
  updatedAt: Date;
}

export interface CommentAuthor {
  id: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  headline: string | null;
  image: string | null;
  imageAssetId: string | null;
  imageUrl: string | null;
  team: boolean;
  roleName: string | null;
}

export interface CommentReport {
  readonly id: string;
  readonly orgId: string;
  readonly commentId: string;
  readonly orgUserId: string;
  readonly reason: string;
  resolvedAt: Date | null;
  resolution: 'dismissed' | 'removed' | null;
  resolvedBy: string | null;
  readonly createdAt: Date;
  updatedAt: Date;
}
export type { Page } from './shared.js';
