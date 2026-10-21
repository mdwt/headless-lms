// discussion context — ports.
// Inbound: the use cases the service implements.
// Outbound: the persistence contract the repository fulfils.
import type { Activity, JsonValue, Post, PostFlag, PostFlagResolution } from '../types/index.js';
import type { OutboxAppender, UnitOfWork } from '../shared/ports.js';
import type { Actor } from '../shared/actor.js';
import type { Role } from '../organizations/index.js';
import type { Comment, CommentAuthor, CommentReport } from './model.js';
import type {
  CommentsConfig,
  CommentListItem,
  CommentView,
  ListCommentsQuery,
  Page,
  ReactionCounts,
  ReactionEmoji,
} from './types.js';

/** An activity's comments as this reader may see them, with the config that
 *  decided it. */
export interface ActivityComments {
  config: CommentsConfig;
  comments: CommentView[];
}

export interface CommentReactions {
  reactions: ReactionCounts;
  viewerReaction?: ReactionEmoji;
}

export interface CommentWithContext {
  comment: Comment;
  courseId: string;
  activityTitle: string;
}

export type { Actor } from '../shared/actor.js';
export type PostCommentInput = {
  actor: Actor;
  activityId: string;
  parentId: string | null;
  body: string;
};

/** A profile row as the repository loads it, keyed by `org_users.id`. `email`
 *  is stripped before comments are served and kept only for the staff list. */
export interface AuthorRecord extends CommentAuthor {
  email: string;
}

export interface DiscussionService {
  /** Post a root comment or a reply. Lands pending where review is required and
   *  the poster is not staff. */
  postComment(orgId: string, input: PostCommentInput): Promise<CommentView>;
  /** Author-only. Throws ForbiddenError for anyone else, staff included. */
  edit(orgId: string, commentId: string, actor: Actor, body: string): Promise<CommentView>;
  /** The author, or anyone whose role is staff. */
  remove(orgId: string, commentId: string, actor: Actor): Promise<Comment>;
  /** Staff only. Returns the comment to published. */
  restore(orgId: string, commentId: string, actor: Actor): Promise<Comment>;
  /** Staff only. Publishes a pending comment. */
  approve(orgId: string, commentId: string, actor: Actor): Promise<Comment>;
  /** Make a comment published, whichever state it is in. Staff only. */
  publish(orgId: string, commentId: string, actor: Actor): Promise<Comment>;

  /** The activity's comments as this reader may see them. */
  activityComments(orgId: string, activityId: string, actor: Actor): Promise<ActivityComments>;

  /**
   * The org's comments, filtered. Staff-scoped: rows carry the author's email
   * and a removed comment's body, neither of which a learner may see, so the
   * edge admits only staff.
   *
   * No rule is applied beyond the filters — this is what exists, not what
   * someone is allowed to read.
   */
  listComments(orgId: string, query: ListCommentsQuery): Promise<Page<CommentListItem>>;

  setReaction(
    orgId: string,
    commentId: string,
    actor: Actor,
    emoji: ReactionEmoji | null,
  ): Promise<CommentReactions>;

  resolveReports(orgId: string, commentId: string, actor: Actor): Promise<void>;

  /** Accepted even on locked comments — a locked activity can still hold
   *  something a moderator needs to see. */
  reportComment(
    orgId: string,
    commentId: string,
    actor: Actor,
    reason: string,
  ): Promise<CommentReport>;

  /** Plain read of one comment — no rules applied. */
  getComment(orgId: string, commentId: string): Promise<Comment | null>;
}

export interface CourseAccessReader {
  hasCourseAccess(orgId: string, orgUserId: string, courseId: string): Promise<boolean>;
}

export interface ActivityGetter {
  getActivity(orgId: string, activityId: string): Promise<Activity | null>;
}

export interface DiscussionRepository {
  insertComment(orgId: string, comment: Comment): Promise<Comment>;
  findComment(orgId: string, id: string): Promise<Comment | null>;
  updateComment(
    orgId: string,
    id: string,
    patch: Partial<Pick<Comment, 'body' | 'status' | 'removedBy' | 'updatedAt'>>,
  ): Promise<Comment | null>;
  /** Every comment on the activity, oldest first, including removed ones. */
  listByActivity(orgId: string, activityId: string): Promise<Comment[]>;

  reactionsOf(
    orgId: string,
    commentIds: string[],
    viewerId: string,
  ): Promise<Record<string, CommentReactions>>;
  setReaction(
    orgId: string,
    commentId: string,
    orgUserId: string,
    emoji: ReactionEmoji | null,
  ): Promise<void>;

  /** Returns null when this person has already reported this comment. */
  insertReport(orgId: string, report: CommentReport): Promise<CommentReport | null>;
  /** Every unresolved report against the given comments. */
  listOpenReports(orgId: string, commentIds: string[]): Promise<CommentReport[]>;
  resolveReportsFor(
    orgId: string,
    commentId: string,
    resolved: {
      resolvedAt: Date;
      resolvedBy: string;
      resolution: 'dismissed' | 'removed';
    },
  ): Promise<void>;

  authorsOf(orgId: string, orgUserIds: string[]): Promise<Record<string, AuthorRecord>>;

  listComments(orgId: string, query: ListCommentsQuery): Promise<Page<CommentWithContext>>;
}

/** Writes that emit events run through this scope so the row and the outbox
 *  entry commit in one transaction. */
export interface DiscussionWriteScope {
  discussion: DiscussionRepository;
  outbox: OutboxAppender;
}
export type DiscussionUnitOfWork = UnitOfWork<DiscussionWriteScope>;

/** The role of a post's author, read when a schedule publishes the post. */
export interface AuthorRoleReader {
  roleOf(orgId: string, orgUserId: string): Promise<Role | null>;
}

export type PostMode = 'draft' | 'submit' | 'schedule';

export interface CreatePostInput {
  spaceId: string;
  title: string;
  body: string;
  topicId: string | null;
  extra: JsonValue;
  coverAssetId: string | null;
  mode: PostMode;
  scheduledAt: Date | null;
}

export interface UpdatePostInput {
  title?: string;
  body?: string;
  topicId?: string | null;
  extra?: JsonValue;
  coverAssetId?: string | null;
}

export type PostPatch = Partial<
  Pick<
    Post,
    | 'title'
    | 'body'
    | 'topicId'
    | 'extra'
    | 'coverAssetId'
    | 'status'
    | 'scheduledAt'
    | 'publishedAt'
    | 'removedBy'
    | 'pinned'
    | 'commentsClosed'
    | 'reactionsEnabled'
  >
>;

export interface FeedQuery {
  page: number;
  pageSize: number;
  topicId?: string;
}

export interface PostReactions {
  reactions: ReactionCounts;
  viewerReaction?: ReactionEmoji;
}

export interface SpaceModerationQueue {
  pending: Post[];
  flags: PostFlag[];
}

export interface PostService {
  create(orgId: string, actor: Actor, input: CreatePostInput): Promise<Post>;
  update(orgId: string, postId: string, actor: Actor, patch: UpdatePostInput): Promise<Post>;
  submit(orgId: string, postId: string, actor: Actor): Promise<Post>;
  schedule(orgId: string, postId: string, actor: Actor, scheduledAt: Date): Promise<Post>;
  approve(orgId: string, postId: string, actor: Actor): Promise<Post>;
  remove(orgId: string, postId: string, actor: Actor): Promise<Post>;
  restore(orgId: string, postId: string, actor: Actor): Promise<Post>;
  pin(orgId: string, postId: string, actor: Actor): Promise<Post>;
  unpin(orgId: string, postId: string, actor: Actor): Promise<Post>;
  closeComments(orgId: string, postId: string, actor: Actor): Promise<Post>;
  openComments(orgId: string, postId: string, actor: Actor): Promise<Post>;
  setReactions(orgId: string, postId: string, actor: Actor, enabled: boolean): Promise<Post>;
  setReaction(
    orgId: string,
    postId: string,
    actor: Actor,
    emoji: ReactionEmoji | null,
  ): Promise<PostReactions>;
  follow(orgId: string, postId: string, actor: Actor): Promise<void>;
  unfollow(orgId: string, postId: string, actor: Actor): Promise<void>;
  bookmark(orgId: string, postId: string, actor: Actor): Promise<void>;
  unbookmark(orgId: string, postId: string, actor: Actor): Promise<void>;
  flag(orgId: string, postId: string, actor: Actor, reason: string): Promise<PostFlag>;
  resolveFlags(
    orgId: string,
    postId: string,
    actor: Actor,
    resolution: PostFlagResolution,
  ): Promise<void>;
  spaceFeed(orgId: string, actor: Actor, spaceId: string, query: FeedQuery): Promise<Page<Post>>;
  memberFeed(
    orgId: string,
    actor: Actor,
    communityId: string,
    query: Pick<FeedQuery, 'page' | 'pageSize'>,
  ): Promise<Page<Post>>;
  getPost(orgId: string, actor: Actor, postId: string): Promise<Post>;
  moderationQueue(orgId: string, actor: Actor, spaceId: string): Promise<SpaceModerationQueue>;
  publishDue(orgId: string, now: Date): Promise<void>;
}

export interface PostRepository {
  insert(orgId: string, post: Post): Promise<Post>;
  update(orgId: string, id: string, patch: PostPatch): Promise<Post | null>;
  find(orgId: string, id: string): Promise<Post | null>;
  listPublished(orgId: string, spaceIds: string[], query: FeedQuery): Promise<Page<Post>>;
  listPending(orgId: string, spaceId: string): Promise<Post[]>;
  listDue(orgId: string, now: Date): Promise<Post[]>;
  reactionsOf(orgId: string, postId: string, viewerId: string): Promise<PostReactions>;
  setReaction(
    orgId: string,
    postId: string,
    orgUserId: string,
    emoji: ReactionEmoji | null,
  ): Promise<void>;
  follow(orgId: string, postId: string, orgUserId: string): Promise<void>;
  unfollow(orgId: string, postId: string, orgUserId: string): Promise<void>;
  bookmark(orgId: string, postId: string, orgUserId: string): Promise<void>;
  unbookmark(orgId: string, postId: string, orgUserId: string): Promise<void>;
  insertFlag(orgId: string, flag: PostFlag): Promise<PostFlag | null>;
  listOpenFlags(orgId: string, spaceId: string): Promise<PostFlag[]>;
  resolveFlags(
    orgId: string,
    postId: string,
    resolved: { resolvedAt: Date; resolvedBy: string; resolution: PostFlagResolution },
  ): Promise<void>;
}

export interface PostWriteScope {
  posts: PostRepository;
  outbox: OutboxAppender;
}
export type PostUnitOfWork = UnitOfWork<PostWriteScope>;
