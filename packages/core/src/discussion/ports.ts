// discussion context — ports.
// Inbound: the use cases the service implements.
// Outbound: the persistence contract the repository fulfils.
import type {
  Activity,
  Chat,
  ChatLastMessage,
  ChatUser,
  FlaggedComment,
  JsonValue,
  Message,
  MessageFlag,
  MessageFlagResolution,
  MessageView,
  Post,
  PostFlag,
  PostFlagResolution,
  PostStatus,
  PostView,
} from '../types/index.js';
import type { SpaceDetail } from '../content/index.js';
import type { OutboxAppender, UnitOfWork } from '../shared/ports.js';
import type { Actor } from '../shared/actor.js';
import type { Role } from '../organizations/index.js';
import type { Comment, CommentReport } from './model.js';
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
  parentId: string | null;
  body: string;
} & ({ activityId: string; postId?: undefined } | { postId: string; activityId?: undefined });

/** A profile row as the repository loads it, keyed by `org_users.id`. `email`
 *  is stripped before comments are served and kept only for the staff list. */
export interface AuthorRecord {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  image: string | null;
  role: Role;
  displayName: string | null;
  headline: string | null;
  imageAssetOrgId: string | null;
  imageAssetId: string | null;
}

export interface AuthorProfileReader {
  authorsOf(orgId: string, orgUserIds: string[]): Promise<Record<string, AuthorRecord>>;
}

export interface DiscussionService {
  /** Post a root comment or a reply. Lands pending where review is required and
   *  the poster is not staff. */
  postComment(orgId: string, input: PostCommentInput): Promise<CommentView>;
  /** Author-only. Throws ForbiddenError for anyone else, staff included. */
  edit(orgId: string, commentId: string, actor: Actor, body: string): Promise<CommentView>;
  /** The author, or anyone whose role is staff. */
  remove(orgId: string, commentId: string, actor: Actor, communityId?: string): Promise<Comment>;
  /** Staff only. Returns the comment to published. */
  restore(orgId: string, commentId: string, actor: Actor, communityId?: string): Promise<Comment>;
  /** Staff only. Publishes a pending comment. */
  approve(orgId: string, commentId: string, actor: Actor): Promise<Comment>;
  /** Make a comment published, whichever state it is in. Staff only. */
  publish(orgId: string, commentId: string, actor: Actor): Promise<Comment>;

  /** The activity's comments as this reader may see them. */
  activityComments(orgId: string, activityId: string, actor: Actor): Promise<ActivityComments>;

  postComments(orgId: string, postId: string, actor: Actor): Promise<CommentView[]>;

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

  resolveReports(
    orgId: string,
    commentId: string,
    actor: Actor,
    communityId?: string,
  ): Promise<void>;

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

  sendDigest(orgId: string, now: Date): Promise<void>;
}

export interface CourseAccessReader {
  hasCourseAccess(orgId: string, orgUserId: string, courseId: string): Promise<boolean>;
}

export interface ActivityGetter {
  getActivity(orgId: string, activityId: string): Promise<Activity | null>;
}

export interface DiscussionRepository extends PostCommentReader, AuthorProfileReader {
  insertComment(orgId: string, comment: Comment): Promise<Comment>;
  findComment(orgId: string, id: string): Promise<Comment | null>;
  updateComment(
    orgId: string,
    id: string,
    patch: Partial<Pick<Comment, 'body' | 'status' | 'removedBy' | 'updatedAt'>>,
  ): Promise<Comment | null>;
  /** Every comment on the activity, oldest first, including removed ones. */
  listByActivity(orgId: string, activityId: string): Promise<Comment[]>;
  listByPost(orgId: string, postId: string): Promise<Comment[]>;

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

  listComments(orgId: string, query: ListCommentsQuery): Promise<Page<CommentWithContext>>;
}

/** Writes that emit events run through this scope so the row and the outbox
 *  entry commit in one transaction. */
export interface DiscussionWriteScope {
  discussion: DiscussionRepository;
  outbox: OutboxAppender;
}
export type DiscussionUnitOfWork = UnitOfWork<DiscussionWriteScope>;

export interface AuthorRoleReader {
  roleOf(orgId: string, orgUserId: string): Promise<Role | null>;
  rolesOf(orgId: string, orgUserIds: string[]): Promise<Record<string, Role>>;
}

export type PostMode = 'draft' | 'submit' | 'schedule';

export interface CreatePostInput {
  communityId: string;
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

export type PageQuery = Pick<FeedQuery, 'page' | 'pageSize'>;

export interface BookmarkQuery extends PageQuery {
  visibleStatuses: PostStatus[];
}

export interface SpaceModerationQueue {
  pending: PostView[];
  flags: PostFlag[];
  commentFlags: FlaggedComment[];
}

export interface PostCommentReader {
  listOpenFlagsForSpace(orgId: string, spaceId: string): Promise<FlaggedComment[]>;
  publishedCommentCounts(orgId: string, postIds: string[]): Promise<Record<string, number>>;
}

export interface PostService {
  visibleTitles(orgId: string, actor: Actor, postIds: string[]): Promise<Record<string, string>>;
  create(orgId: string, actor: Actor, input: CreatePostInput): Promise<PostView>;
  update(orgId: string, postId: string, actor: Actor, patch: UpdatePostInput): Promise<PostView>;
  submit(orgId: string, postId: string, actor: Actor): Promise<PostView>;
  schedule(orgId: string, postId: string, actor: Actor, scheduledAt: Date): Promise<PostView>;
  approve(orgId: string, postId: string, actor: Actor, communityId?: string): Promise<PostView>;
  remove(orgId: string, postId: string, actor: Actor, communityId?: string): Promise<PostView>;
  restore(orgId: string, postId: string, actor: Actor, communityId?: string): Promise<PostView>;
  pin(orgId: string, postId: string, actor: Actor): Promise<PostView>;
  unpin(orgId: string, postId: string, actor: Actor): Promise<PostView>;
  closeComments(orgId: string, postId: string, actor: Actor): Promise<PostView>;
  openComments(orgId: string, postId: string, actor: Actor): Promise<PostView>;
  setReactions(orgId: string, postId: string, actor: Actor, enabled: boolean): Promise<PostView>;
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
    resolution: Extract<PostFlagResolution, 'dismissed'>,
    communityId?: string,
  ): Promise<void>;
  spaceFeed(
    orgId: string,
    actor: Actor,
    communityId: string,
    spaceId: string,
    query: FeedQuery,
  ): Promise<Page<PostView>>;
  memberFeed(
    orgId: string,
    actor: Actor,
    communityId: string,
    query: Pick<FeedQuery, 'page' | 'pageSize'>,
  ): Promise<Page<PostView>>;
  listOwn(
    orgId: string,
    actor: Actor,
    communityId: string,
    query: PageQuery,
  ): Promise<Page<PostView>>;
  listBookmarked(
    orgId: string,
    actor: Actor,
    communityId: string,
    query: PageQuery,
  ): Promise<Page<PostView>>;
  getPost(orgId: string, actor: Actor, postId: string): Promise<PostView>;
  visible(orgId: string, actor: Actor, postId: string): Promise<{ post: Post; space: SpaceDetail }>;
  find(orgId: string, postId: string): Promise<Post | null>;
  followerIds(orgId: string, postId: string): Promise<string[]>;
  moderationQueue(
    orgId: string,
    actor: Actor,
    communityId: string,
    spaceId: string,
  ): Promise<SpaceModerationQueue>;
  publishDue(orgId: string, now: Date): Promise<void>;
  hasDue(orgId: string, now: Date): Promise<boolean>;
}

export interface PostRepository {
  insert(orgId: string, post: Post): Promise<Post>;
  update(orgId: string, id: string, patch: PostPatch): Promise<Post | null>;
  find(orgId: string, id: string): Promise<Post | null>;
  findMany(orgId: string, ids: string[]): Promise<Post[]>;
  listPublished(orgId: string, spaceIds: string[], query: FeedQuery): Promise<Page<Post>>;
  listByAuthor(
    orgId: string,
    orgUserId: string,
    spaceIds: string[],
    query: PageQuery,
  ): Promise<Page<Post>>;
  listBookmarked(
    orgId: string,
    orgUserId: string,
    spaceIds: string[],
    query: BookmarkQuery,
  ): Promise<Page<Post>>;
  listPending(orgId: string, spaceId: string): Promise<Post[]>;
  listDue(orgId: string, now: Date): Promise<Post[]>;
  hasDue(orgId: string, now: Date): Promise<boolean>;
  reactionsOf(
    orgId: string,
    postIds: string[],
    viewerId: string,
  ): Promise<Record<string, PostReactions>>;
  setReaction(
    orgId: string,
    postId: string,
    orgUserId: string,
    emoji: ReactionEmoji | null,
  ): Promise<void>;
  follow(orgId: string, postId: string, orgUserId: string): Promise<void>;
  unfollow(orgId: string, postId: string, orgUserId: string): Promise<void>;
  followerIds(orgId: string, postId: string): Promise<string[]>;
  followedAmong(orgId: string, postIds: string[], orgUserId: string): Promise<string[]>;
  bookmark(orgId: string, postId: string, orgUserId: string): Promise<void>;
  unbookmark(orgId: string, postId: string, orgUserId: string): Promise<void>;
  bookmarkedAmong(orgId: string, postIds: string[], orgUserId: string): Promise<string[]>;
  insertFlag(orgId: string, flag: PostFlag): Promise<PostFlag | null>;
  findFlag(orgId: string, postId: string, orgUserId: string): Promise<PostFlag | null>;
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

export interface StartDirectInput {
  communityId: string;
  orgUserId: string;
  body: string | null;
  assetIds: string[];
}

export interface StartGroupInput {
  communityId: string;
  orgUserIds: string[];
}

export interface SendMessageInput {
  body: string;
  replyToId: string | null;
  assetIds: string[];
}

export interface ChatListItem {
  chat: Chat;
  participantIds: string[];
  lastReadMessageId: string | null;
  muted: boolean;
  mutedUntil: Date | null;
  unread: number;
  lastMessage: ChatLastMessage | null;
}

export interface MessageReactions {
  reactions: ReactionCounts;
  viewerReaction?: ReactionEmoji;
}

export interface ChatSummary {
  chat: Chat;
  participantIds: string[];
}

export interface MessageQueueEntry {
  message: MessageView;
  flags: MessageFlag[];
  chat: Chat;
  participantIds: string[];
}

export interface MessageQueue {
  entries: MessageQueueEntry[];
}

export interface ChatService {
  startDirect(orgId: string, actor: Actor, input: StartDirectInput): Promise<Chat>;
  startGroup(orgId: string, actor: Actor, input: StartGroupInput): Promise<Chat>;
  addParticipant(orgId: string, actor: Actor, chatId: string, orgUserId: string): Promise<Chat>;
  leave(orgId: string, actor: Actor, chatId: string): Promise<Chat>;
  accept(orgId: string, actor: Actor, chatId: string): Promise<Chat>;
  send(orgId: string, actor: Actor, chatId: string, input: SendMessageInput): Promise<MessageView>;
  editMessage(orgId: string, actor: Actor, messageId: string, body: string): Promise<MessageView>;
  deleteMessage(orgId: string, actor: Actor, messageId: string): Promise<MessageView>;
  setReaction(
    orgId: string,
    actor: Actor,
    messageId: string,
    emoji: ReactionEmoji | null,
  ): Promise<void>;
  markRead(orgId: string, actor: Actor, chatId: string, messageId: string): Promise<void>;
  mute(orgId: string, actor: Actor, chatId: string, until?: Date): Promise<void>;
  unmute(orgId: string, actor: Actor, chatId: string): Promise<void>;
  block(orgId: string, actor: Actor, communityId: string, orgUserId: string): Promise<void>;
  unblock(orgId: string, actor: Actor, communityId: string, orgUserId: string): Promise<void>;
  flagMessage(orgId: string, actor: Actor, messageId: string, reason: string): Promise<MessageFlag>;
  resolveMessageFlags(
    orgId: string,
    actor: Actor,
    messageId: string,
    resolution: Extract<MessageFlagResolution, 'dismissed'>,
    communityId?: string,
  ): Promise<void>;
  lock(orgId: string, actor: Actor, chatId: string, communityId?: string): Promise<Chat>;
  unlock(orgId: string, actor: Actor, chatId: string, communityId?: string): Promise<Chat>;
  listChats(orgId: string, actor: Actor, communityId: string): Promise<ChatListItem[]>;
  chatSummary(
    orgId: string,
    chatId: string,
  ): Promise<{ chat: Chat; participants: ChatUser[] } | null>;
  latestMessageBody(orgId: string, chatId: string): Promise<string | null>;
  isBlocked(orgId: string, communityId: string, a: string, b: string): Promise<boolean>;
  titlesFor(orgId: string, actor: Actor, chatIds: string[]): Promise<Record<string, string>>;
  messages(
    orgId: string,
    actor: Actor,
    chatId: string,
    query: Pick<FeedQuery, 'page' | 'pageSize'>,
  ): Promise<Page<MessageView>>;
  messageQueue(orgId: string, actor: Actor, communityId: string): Promise<MessageQueue>;
}

export interface ChatRepository {
  lockDirectPair(
    orgId: string,
    communityId: string,
    orgUserId: string,
    otherOrgUserId: string,
  ): Promise<void>;
  findDirect(
    orgId: string,
    communityId: string,
    orgUserId: string,
    otherOrgUserId: string,
  ): Promise<Chat | null>;
  insertChat(orgId: string, chat: Chat): Promise<Chat>;
  updateChat(
    orgId: string,
    id: string,
    patch: Partial<Pick<Chat, 'status' | 'lockedAt' | 'lockedBy'>>,
  ): Promise<Chat | null>;
  findChat(orgId: string, id: string): Promise<Chat | null>;
  listForUser(orgId: string, communityId: string, orgUserId: string): Promise<ChatListItem[]>;
  participants(orgId: string, chatId: string): Promise<ChatUser[]>;
  join(orgId: string, user: ChatUser): Promise<void>;
  markLeft(orgId: string, chatId: string, orgUserId: string, leftAt: Date): Promise<void>;
  setRead(orgId: string, chatId: string, orgUserId: string, messageId: string): Promise<void>;
  setMuted(
    orgId: string,
    chatId: string,
    orgUserId: string,
    muted: boolean,
    mutedUntil: Date | null,
  ): Promise<void>;
  insertMessage(orgId: string, message: Message): Promise<Message>;
  updateMessage(
    orgId: string,
    id: string,
    patch: Partial<Pick<Message, 'body' | 'editedAt' | 'deletedAt'>>,
  ): Promise<Message | null>;
  findMessage(orgId: string, id: string): Promise<Message | null>;
  listMessages(
    orgId: string,
    chatId: string,
    query: Pick<FeedQuery, 'page' | 'pageSize'>,
  ): Promise<Page<Message>>;
  attach(orgId: string, communityId: string, messageId: string, assetIds: string[]): Promise<void>;
  attachmentsOf(orgId: string, messageIds: string[]): Promise<Record<string, string[]>>;
  blockedWith(
    orgId: string,
    communityId: string,
    orgUserId: string,
    otherIds: string[],
  ): Promise<string[]>;
  setReaction(
    orgId: string,
    communityId: string,
    messageId: string,
    orgUserId: string,
    emoji: ReactionEmoji | null,
  ): Promise<void>;
  reactionsOf(
    orgId: string,
    messageIds: string[],
    viewerId: string,
  ): Promise<Record<string, MessageReactions>>;
  block(
    orgId: string,
    communityId: string,
    blockerOrgUserId: string,
    blockedOrgUserId: string,
  ): Promise<void>;
  unblock(
    orgId: string,
    communityId: string,
    blockerOrgUserId: string,
    blockedOrgUserId: string,
  ): Promise<void>;
  isBlocked(orgId: string, communityId: string, a: string, b: string): Promise<boolean>;
  anyBlockedAmong(orgId: string, communityId: string, orgUserIds: string[]): Promise<boolean>;
  insertFlag(orgId: string, flag: MessageFlag): Promise<MessageFlag | null>;
  findFlag(orgId: string, messageId: string, orgUserId: string): Promise<MessageFlag | null>;
  listOpenFlags(orgId: string, communityId: string): Promise<MessageFlag[]>;
  messagesByIds(orgId: string, ids: string[]): Promise<Message[]>;
  chatSummaries(orgId: string, chatIds: string[]): Promise<ChatSummary[]>;
  resolveFlags(
    orgId: string,
    messageId: string,
    resolved: { resolvedAt: Date; resolvedBy: string; resolution: MessageFlagResolution },
  ): Promise<void>;
  resolveOpenFlagsForChat(
    orgId: string,
    chatId: string,
    resolved: { resolvedAt: Date; resolvedBy: string; resolution: MessageFlagResolution },
  ): Promise<void>;
}

export interface ChatWriteScope {
  chats: ChatRepository;
  outbox: OutboxAppender;
}
export type ChatUnitOfWork = UnitOfWork<ChatWriteScope>;
