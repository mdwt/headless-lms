// discussion context — public surface. Re-export only what other layers may use.
export { DiscussionServiceImpl, DEFAULT_SETTINGS } from './service.js';
export { PostServiceImpl } from './posts.js';
export { DigestServiceImpl, latestDueAt } from './digests.js';
export { ChatServiceImpl } from './chats.js';
export { SubscriptionServiceImpl, activeSubscription } from './subscriptions.js';
export { authorView } from './authors.js';
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
  ContentAccessReader,
  PostCommentInput,
  AuthorRoleReader,
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
  ChatInboxRow,
  ChatUnread,
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
