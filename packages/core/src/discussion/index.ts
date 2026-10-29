// discussion context — public surface. Re-export only what other layers may use.
export { DiscussionServiceImpl, DEFAULT_SETTINGS } from './service.js';
export { PostServiceImpl } from './posts.js';
export { ChatServiceImpl } from './chats.js';
export { authorView } from './authors.js';
export { discussionEvents } from './events.js';
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
  FeedQuery,
  PageQuery,
  BookmarkQuery,
  PostReactions,
  MessageReactions,
  SpaceModerationQueue,
  PostCommentReader,
  PostService,
  PostRepository,
  PostWriteScope,
  PostUnitOfWork,
  StartDirectInput,
  StartGroupInput,
  SendMessageInput,
  ChatListItem,
  MessageQueue,
  ChatService,
  ChatRepository,
  ChatWriteScope,
  ChatUnitOfWork,
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
