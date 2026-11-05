// discussion context — public surface. Re-export only what other layers may use.
export { DiscussionServiceImpl, DEFAULT_SETTINGS } from './service.js';
export { PostServiceImpl } from './posts.js';
export { DigestServiceImpl, latestDueAt } from './digests.js';
export { ChatServiceImpl } from './chats.js';
export { CHAT_CHANNEL, ChatHub, ChatLiveForwarder } from './live.js';
export type {
  ChatChange,
  ChatHubOptions,
  ChatHubParams,
  ChatLiveForwarderParams,
  LiveRegistration,
} from './live.js';
export { SubscriptionServiceImpl, activeSubscription } from './subscriptions.js';
export { authorName, authorView } from './authors.js';
export { isTeam, skipsReview, teamBadge, NO_BADGE } from './rules.js';
export type { ReviewedItem, TeamBadge } from './rules.js';
export {
  chatsDeclarations,
  digestsDeclarations,
  discussionDeclarations,
  postsDeclarations,
  subscriptionsDeclarations,
} from './declarations.js';
export { nameMentions } from './mentions.js';
export { DiscussionItemTitles } from './titles.js';
export { discussionEvents } from './events.js';
export {
  DIGEST_OPEN_JOB,
  POST_PUBLISH_JOB,
  discussionJobs,
  discussionRecurringJobs,
} from './jobs.js';
export type {
  DiscussionService,
  DiscussionRepository,
  DiscussionUnitOfWork,
  DiscussionWriteScope,
  ActivityComments,
  Actor,
  AuthorRecord,
  AuthorProfileReader,
  CommentReactions,
  CommentWithContext,
  CommentWithin,
  ContentAccessReader,
  PostCommentInput,
  AuthorPermissionReader,
  CommunityAccess,
  SpaceReader,
  OpenableSpace,
  ActivityGetter,
  CreatePostInput,
  UpdatePostInput,
  PostPatch,
  PostGuard,
  FeedQuery,
  ItemTitle,
  ItemTitles,
  PageQuery,
  PostThreadsQuery,
  BookmarkQuery,
  PostReactions,
  MessageReactions,
  SpaceModerationQueue,
  PostCommentReader,
  PostService,
  PublishedPost,
  PostRepository,
  PostWriteScope,
  PostUnitOfWork,
  StartDirectInput,
  StartGroupInput,
  SendMessageInput,
  ChatListItem,
  ChatListQuery,
  ChatInboxRow,
  ChatLiveReads,
  ChatMemberState,
  ChatMemberStates,
  ChatUnread,
  LiveChat,
  ReactionChange,
  MessageQueue,
  ChatService,
  ChatRepository,
  ChatWriteScope,
  ChatUnitOfWork,
  DigestRunRepository,
  DigestScheduleReader,
  DigestService,
  DigestUnitOfWork,
  DigestWriteScope,
  MentionsRepository,
  MuteInput,
  SubscriptionInput,
  SubscriptionService,
  SubscriptionsRepository,
  SubscriptionUnitOfWork,
  SubscriptionWriteScope,
} from './ports.js';
export type {
  Comment,
  CommentAuthor,
  CommentStatus,
  CommentReaction,
  CommentReport,
  CommentSettings,
} from './model.js';
export type {
  CommentsConfig,
  CommentView,
  CommentReportSummary,
  CommentListItem,
  ListCommentsQuery,
  ReactionCounts,
  ReactionEmoji,
} from './types.js';
export type { DiscussionEvent } from './events.js';
export type { ChatLiveEvent, ChatUnreadSummary, LiveMessage } from '../types/index.js';
