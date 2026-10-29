// discussion context — public surface. Re-export only what other layers may use.
export { DiscussionServiceImpl, DEFAULT_SETTINGS } from './service.js';
export { discussionEvents } from './events.js';
export type {
  DiscussionService,
  DiscussionRepository,
  DiscussionUnitOfWork,
  DiscussionWriteScope,
  ActivityComments,
  Actor,
  AuthorRecord,
  CommentReactions,
  CommentWithContext,
  ContentAccessReader,
  PostCommentInput,
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
export type { CommentEvent } from './events.js';
