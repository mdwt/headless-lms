export type {
  ActivityCommentsRule,
  CommentStatus,
  ReactionEmoji,
  ReactionCounts,
  CommentReaction,
  CommentSettings,
  CommentsConfig,
  CommentView,
  CommentReportSummary,
  CommentListItem,
  ListCommentsQuery,
} from './schemas/discussion.js';
import type { Role } from './organizations.js';
import type { CommentStatus } from './schemas/discussion.js';

export interface Comment {
  readonly id: string;
  readonly orgId: string;
  readonly activityId: string;
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
  image: string | null;
  role: Role;
}

export interface CommentReport {
  readonly id: string;
  readonly orgId: string;
  readonly commentId: string;
  readonly orgUserId: string;
  readonly reason: string;
  resolvedAt: Date | null;
  readonly createdAt: Date;
  updatedAt: Date;
}
export type { Page } from './shared.js';
