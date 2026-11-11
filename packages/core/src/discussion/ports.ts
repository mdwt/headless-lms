// discussion context — ports.
// Inbound: the use cases the service implements.
// Outbound: the persistence contract the repository fulfils.
import type {
  Activity,
  Chat,
  ChatLastMessage,
  ChatLiveEvent,
  ChatUnreadSummary,
  ChatUser,
  DigestRun,
  FlaggedComment,
  FlaggedCommentView,
  JsonValue,
  LiveMessage,
  MentionItemType,
  Message,
  MessageFlag,
  MessageFlagResolution,
  MessageView,
  Post,
  PostFlag,
  PostFlagResolution,
  PostStatus,
  PostView,
  SubjectRef,
  Subscription,
  SubscriptionItemType,
  SubscriptionView,
} from '../types/index.js';
import type { CommunityDigest, DmSettings, SpaceDetail } from '../content/index.js';
import type { OutboxAppender, UnitOfWork } from '../shared/ports.js';
import type { Actor, EffectivePermissions } from '../shared/actor.js';
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
  parentId: string | null;
  body: string;
} & ({ activityId: string; postId?: undefined } | { postId: string; activityId?: undefined });

/** A profile row as the repository loads it, keyed by `org_users.id`. `email`
 *  is stripped before comments are served and kept only for the moderation list. */
export interface AuthorRecord {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  image: string | null;
  displayName: string | null;
  headline: string | null;
  imageAssetOrgId: string | null;
  imageAssetId: string | null;
}

export interface ItemTitle {
  title: string;
  excerpt?: string;
}

export interface ItemTitles {
  titlesFor(refs: SubjectRef[], actor: Actor): Promise<Record<string, ItemTitle>>;
}

export interface AuthorProfileReader {
  authorsOf(orgId: string, orgUserIds: string[]): Promise<Record<string, AuthorRecord>>;
}

/** Where a comment must be for a moderation call: in one community, on a
 *  lesson, or anywhere the actor can reach. */
export type CommentWithin = { communityId: string } | 'lesson' | 'any';

export interface DiscussionService {
  /** Post a root comment or a reply. Lands pending where review is required and
   *  the poster does not skip review. */
  postComment(input: PostCommentInput, actor: Actor): Promise<CommentView>;
  /** Reply to a lesson comment as a moderator of its course; a reply to a reply
   *  attaches to its root. */
  replyToComment(commentId: string, body: string, actor: Actor): Promise<CommentView>;
  /** Author-only. Throws ForbiddenError for anyone else, moderators included. */
  edit(commentId: string, body: string, actor: Actor): Promise<CommentView>;
  /** The author, or a moderator of where the comment is. */
  remove(commentId: string, within: CommentWithin, actor: Actor): Promise<CommentView>;
  /** A moderator of where the comment is. Returns the comment to published. */
  restore(commentId: string, within: CommentWithin, actor: Actor): Promise<CommentView>;
  /** A moderator of where the comment is. Publishes a pending comment. */
  approve(commentId: string, actor: Actor): Promise<Comment>;
  /** Make a comment published, whichever state it is in. A moderator of where
   *  the comment is. */
  publish(commentId: string, within: CommentWithin, actor: Actor): Promise<Comment>;

  /** The activity's comments as this reader may see them. */
  activityComments(activityId: string, actor: Actor): Promise<ActivityComments>;

  /** One page of top-level comments, oldest first, each with its replies. */
  postComments(postId: string, query: PageQuery, actor: Actor): Promise<Page<CommentView>>;

  /** The lesson comments of the courses the actor moderates, filtered. Rows
   *  carry the author's email and a removed comment's body. */
  listComments(query: ListCommentsQuery, actor: Actor): Promise<Page<CommentListItem>>;

  setReaction(
    commentId: string,
    emoji: ReactionEmoji | null,
    actor: Actor,
  ): Promise<CommentReactions>;

  resolveReports(commentId: string, within: CommentWithin, actor: Actor): Promise<void>;

  /** Accepted even on locked comments — a locked activity can still hold
   *  something a moderator needs to see. */
  reportComment(commentId: string, reason: string, actor: Actor): Promise<CommentReport>;

  /** Plain read of one comment — no rules applied. */
  getComment(orgId: string, commentId: string): Promise<Comment | null>;
  commenterIds(
    orgId: string,
    target: { postId: string } | { activityId: string },
  ): Promise<string[]>;
}

export interface ContentAccessReader {
  hasAccess(orgId: string, orgUserId: string, contentId: string): Promise<boolean>;
}

export interface ActivityGetter {
  getActivity(activityId: string, actor: Actor): Promise<Activity | null>;
}

export interface SpaceReader {
  getSpace(spaceId: string, actor: Actor): Promise<SpaceDetail | null>;
  getDmSettings(communityId: string, actor: Actor): Promise<DmSettings | null>;
}

export interface OpenableSpace {
  id: string;
  communityId: string;
  accessRule: SpaceDetail['accessRule'];
}

export interface CommunityAccess {
  isCommunityMember(communityId: string, actor: Actor): Promise<boolean>;
  canOpenSpace(spaceId: string, actor: Actor): Promise<boolean>;
  canOpen(space: OpenableSpace, actor: Actor): Promise<boolean>;
  openSpaceIds(communityId: string, actor: Actor): Promise<string[]>;
  communityMembersAmong(
    orgId: string,
    communityId: string,
    orgUserIds: string[],
  ): Promise<string[]>;
  spaceOpenersAmong(orgId: string, spaceId: string, orgUserIds: string[]): Promise<string[]>;
}

export interface DiscussionRepository extends PostCommentReader, AuthorProfileReader {
  insertComment(orgId: string, comment: Comment): Promise<Comment>;
  findComment(orgId: string, id: string): Promise<Comment | null>;
  commenterIds(
    orgId: string,
    target: { postId: string } | { activityId: string },
  ): Promise<string[]>;
  updateComment(
    orgId: string,
    id: string,
    patch: Partial<Pick<Comment, 'body' | 'status' | 'removedBy' | 'updatedAt'>>,
  ): Promise<Comment | null>;
  /** Every comment on the activity, oldest first, including removed ones. */
  listByActivity(orgId: string, activityId: string): Promise<Comment[]>;
  /** A page of the post's top-level threads the viewer can see, oldest first, with their replies. `total` counts threads. */
  listThreadsByPost(orgId: string, postId: string, query: PostThreadsQuery): Promise<Page<Comment>>;

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
  ): Promise<boolean>;

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

  /** `courseIds` limits the rows to those courses; undefined means every course. */
  listComments(
    orgId: string,
    query: ListCommentsQuery,
    courseIds?: string[],
  ): Promise<Page<CommentWithContext>>;
}

/** Writes that emit events run through this scope so the row and the outbox
 *  entry commit in one transaction. */
export interface DiscussionWriteScope {
  discussion: DiscussionRepository;
  mentions: MentionsRepository;
  outbox: OutboxAppender;
}
export type DiscussionUnitOfWork = UnitOfWork<DiscussionWriteScope>;

export interface AuthorPermissionReader {
  permissionsOfMany(
    orgId: string,
    orgUserIds: string[],
  ): Promise<Map<string, EffectivePermissions>>;
  actorFor(orgId: string, orgUserId: string): Promise<Actor | null>;
  systemActor(orgId: string): Actor;
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

export interface PostThreadsQuery extends PageQuery {
  viewerId: string;
  seesHeld: boolean;
}

export interface BookmarkQuery extends PageQuery {
  visibleStatuses: PostStatus[];
}

export const MODERATION_QUEUE_LIMIT = 100;

export interface SpaceModerationQueue {
  pending: PostView[];
  flags: PostFlag[];
  commentFlags: FlaggedCommentView[];
}

export interface PostCommentReader {
  listOpenFlagsForSpace(orgId: string, spaceId: string, limit: number): Promise<FlaggedComment[]>;
  publishedCommentCounts(orgId: string, postIds: string[]): Promise<Record<string, number>>;
}

export interface PublishedPost {
  postId: string;
  spaceId: string;
  title: string;
  orgUserId: string;
  commentCount: number;
}

export interface PostService {
  visibleTitles(postIds: string[], actor: Actor): Promise<Record<string, string>>;
  publishedBetween(
    orgId: string,
    communityId: string,
    from: Date,
    to: Date,
  ): Promise<PublishedPost[]>;
  create(input: CreatePostInput, actor: Actor): Promise<PostView>;
  update(postId: string, patch: UpdatePostInput, actor: Actor): Promise<PostView>;
  submit(postId: string, actor: Actor): Promise<PostView>;
  schedule(postId: string, scheduledAt: Date, actor: Actor): Promise<PostView>;
  unschedule(postId: string, actor: Actor): Promise<PostView>;
  publishScheduled(orgId: string, postId: string, now: Date): Promise<void>;
  approve(postId: string, communityId: string | null, actor: Actor): Promise<PostView>;
  remove(postId: string, communityId: string | null, actor: Actor): Promise<PostView>;
  restore(postId: string, communityId: string | null, actor: Actor): Promise<PostView>;
  pin(postId: string, actor: Actor): Promise<PostView>;
  unpin(postId: string, actor: Actor): Promise<PostView>;
  closeComments(postId: string, actor: Actor): Promise<PostView>;
  openComments(postId: string, actor: Actor): Promise<PostView>;
  setReactions(postId: string, enabled: boolean, actor: Actor): Promise<PostView>;
  setReaction(postId: string, emoji: ReactionEmoji | null, actor: Actor): Promise<PostReactions>;
  bookmark(postId: string, actor: Actor): Promise<void>;
  unbookmark(postId: string, actor: Actor): Promise<void>;
  flag(postId: string, reason: string, actor: Actor): Promise<PostFlag>;
  resolveFlags(
    postId: string,
    resolution: Extract<PostFlagResolution, 'dismissed'>,
    communityId: string | null,
    actor: Actor,
  ): Promise<void>;
  spaceFeed(
    communityId: string,
    spaceId: string,
    query: FeedQuery,
    actor: Actor,
  ): Promise<Page<PostView>>;
  memberFeed(
    communityId: string,
    query: Pick<FeedQuery, 'page' | 'pageSize'>,
    actor: Actor,
  ): Promise<Page<PostView>>;
  listOwn(communityId: string, query: PageQuery, actor: Actor): Promise<Page<PostView>>;
  listBookmarked(communityId: string, query: PageQuery, actor: Actor): Promise<Page<PostView>>;
  /** Signed URL of the post's cover, for whoever can read the post. */
  getPost(postId: string, actor: Actor): Promise<PostView>;
  visible(postId: string, actor: Actor): Promise<{ post: Post; space: SpaceDetail }>;
  find(orgId: string, postId: string): Promise<Post | null>;
  moderationQueue(
    communityId: string,
    spaceId: string,
    actor: Actor,
  ): Promise<SpaceModerationQueue>;
}

export interface PostGuard {
  status: PostStatus;
  scheduledAt?: Date;
  dueBy?: Date;
}

export interface PostRepository {
  insert(orgId: string, post: Post): Promise<Post>;
  update(orgId: string, id: string, patch: PostPatch): Promise<Post | null>;
  updateIf(orgId: string, id: string, guard: PostGuard, patch: PostPatch): Promise<Post | null>;
  find(orgId: string, id: string): Promise<Post | null>;
  findMany(orgId: string, ids: string[]): Promise<Post[]>;
  publishedBetween(
    orgId: string,
    communityId: string,
    from: Date,
    to: Date,
  ): Promise<PublishedPost[]>;
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
  listPending(orgId: string, spaceId: string, limit: number): Promise<Post[]>;
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
  ): Promise<boolean>;
  bookmark(orgId: string, postId: string, orgUserId: string): Promise<void>;
  unbookmark(orgId: string, postId: string, orgUserId: string): Promise<void>;
  bookmarkedAmong(orgId: string, postIds: string[], orgUserId: string): Promise<string[]>;
  insertFlag(orgId: string, flag: PostFlag): Promise<PostFlag | null>;
  findFlag(orgId: string, postId: string, orgUserId: string): Promise<PostFlag | null>;
  listOpenFlags(orgId: string, spaceId: string, limit: number): Promise<PostFlag[]>;
  resolveFlags(
    orgId: string,
    postId: string,
    resolved: { resolvedAt: Date; resolvedBy: string; resolution: PostFlagResolution },
  ): Promise<void>;
}

export interface PostWriteScope {
  posts: PostRepository;
  mentions: MentionsRepository;
  outbox: OutboxAppender;
}
export type PostUnitOfWork = UnitOfWork<PostWriteScope>;

export interface DigestScheduleReader {
  communitiesWithDigest(): Promise<CommunityDigest[]>;
}

export interface DigestRunRepository {
  listRuns(): Promise<DigestRun[]>;
  advance(orgId: string, communityId: string, dueAt: Date): Promise<boolean>;
}

export interface DigestWriteScope {
  digests: DigestRunRepository;
  outbox: OutboxAppender;
}
export type DigestUnitOfWork = UnitOfWork<DigestWriteScope>;

export interface DigestService {
  openDue(now: Date): Promise<void>;
}

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
  clientId?: string;
}

export interface ChatListItem {
  chat: Chat;
  participantIds: string[];
  participants: CommentAuthor[];
  lastReadMessageId: string | null;
  subscription: SubscriptionView | null;
  unread: number;
  lastMessage: ChatLastMessage | null;
}

export type ChatInboxRow = Omit<ChatListItem, 'subscription' | 'participants'>;

/** `requests`: true for only the pending requests to the member, false for
 *  everything else, omitted for every chat. */
export interface ChatListQuery extends PageQuery {
  requests?: boolean;
}

export interface ReactionChange {
  inserted: boolean;
  changed: boolean;
}

export interface ChatMemberState {
  chatId: string;
  unread: number;
  lastReadMessageId: string | null;
  subscription: SubscriptionView | null;
}

/** A member's state in each chat they are in in one community, with their
 *  unread total there. */
export interface ChatMemberStates {
  orgUserId: string;
  unread: ChatUnreadSummary;
  chats: ChatMemberState[];
}

export interface LiveChat {
  chat: Chat;
  participantIds: string[];
  participants: CommentAuthor[];
}

/** What the chat hub reads for each change, as current state. */
export interface ChatLiveReads {
  activeParticipants(orgId: string, chatId: string): Promise<string[]>;
  messageViews(orgId: string, messageIds: string[]): Promise<LiveMessage[]>;
  messageReactions(orgId: string, messageId: string): Promise<ReactionCounts>;
  /** The chat with its active participants and their profiles. */
  liveChat(orgId: string, chatId: string): Promise<LiveChat | null>;
  memberStates(
    orgId: string,
    communityId: string,
    orgUserIds: string[],
  ): Promise<ChatMemberStates[]>;
}

export interface ChatUnread {
  count: number;
  latest: { messageId: string; senderOrgUserId: string; body: string } | null;
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

export interface ChatService extends ChatLiveReads {
  startDirect(input: StartDirectInput, actor: Actor): Promise<Chat>;
  startGroup(input: StartGroupInput, actor: Actor): Promise<Chat>;
  addParticipant(chatId: string, orgUserId: string, actor: Actor): Promise<Chat>;
  leave(chatId: string, actor: Actor): Promise<Chat>;
  accept(chatId: string, actor: Actor): Promise<Chat>;
  send(chatId: string, input: SendMessageInput, actor: Actor): Promise<MessageView>;
  editMessage(messageId: string, body: string, actor: Actor): Promise<MessageView>;
  deleteMessage(messageId: string, actor: Actor): Promise<MessageView>;
  setReaction(
    messageId: string,
    emoji: ReactionEmoji | null,
    actor: Actor,
  ): Promise<MessageReactions>;
  markRead(chatId: string, messageId: string, actor: Actor): Promise<void>;
  block(communityId: string, orgUserId: string, actor: Actor): Promise<void>;
  unblock(communityId: string, orgUserId: string, actor: Actor): Promise<void>;
  flagMessage(messageId: string, reason: string, actor: Actor): Promise<MessageFlag>;
  resolveMessageFlags(
    messageId: string,
    resolution: Extract<MessageFlagResolution, 'dismissed'>,
    communityId: string | null,
    actor: Actor,
  ): Promise<void>;
  lock(chatId: string, communityId: string | null, actor: Actor): Promise<Chat>;
  unlock(chatId: string, communityId: string | null, actor: Actor): Promise<Chat>;
  listChats(communityId: string, query: ChatListQuery, actor: Actor): Promise<Page<ChatListItem>>;
  /** One live stream of the member's chat events in the community. */
  watch(communityId: string, actor: Actor): Promise<AsyncIterable<ChatLiveEvent>>;
  chat(chatId: string, actor: Actor): Promise<ChatListItem>;
  directChat(communityId: string, orgUserId: string, actor: Actor): Promise<ChatListItem>;
  unreadSummary(communityId: string, actor: Actor): Promise<ChatUnreadSummary>;
  typing(chatId: string, actor: Actor): Promise<void>;
  /** The messages as every participant sees them: a deleted message without
   *  its body, attachments or mentions, and no viewer reaction. */
  messageViews(orgId: string, messageIds: string[]): Promise<LiveMessage[]>;
  chatSummary(
    orgId: string,
    chatId: string,
  ): Promise<{ chat: Chat; participants: ChatUser[] } | null>;
  latestMessageBody(orgId: string, chatId: string): Promise<string | null>;
  unreadInChat(orgId: string, chatId: string, orgUserId: string): Promise<ChatUnread>;
  findMessage(orgId: string, messageId: string): Promise<Message | null>;
  isBlocked(orgId: string, communityId: string, a: string, b: string): Promise<boolean>;
  titlesFor(chatIds: string[], actor: Actor): Promise<Record<string, string>>;
  messages(
    chatId: string,
    query: Pick<FeedQuery, 'page' | 'pageSize'>,
    actor: Actor,
  ): Promise<Page<MessageView>>;
  messageQueue(communityId: string, actor: Actor): Promise<MessageQueue>;
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
  listForUser(
    orgId: string,
    communityId: string,
    orgUserId: string,
    query: ChatListQuery,
  ): Promise<Page<ChatInboxRow>>;
  /** The member's inbox row for one chat they are in, or null. */
  inboxRow(orgId: string, chatId: string, orgUserId: string): Promise<ChatInboxRow | null>;
  participants(orgId: string, chatId: string): Promise<ChatUser[]>;
  activeParticipants(orgId: string, chatId: string): Promise<string[]>;
  join(orgId: string, user: ChatUser): Promise<void>;
  markLeft(orgId: string, chatId: string, orgUserId: string, leftAt: Date): Promise<void>;
  /** Moves the read mark to the message only when it is newer (by created
   *  time, then id) than the current one. True when it moved. */
  setRead(orgId: string, chatId: string, orgUserId: string, messageId: string): Promise<boolean>;
  unreadFor(orgId: string, chatId: string, orgUserId: string): Promise<ChatUnread>;
  /** Unread messages across the member's chats in the community that are
   *  neither muted at `at` nor pending requests to them, plus those requests. */
  unreadSummary(
    orgId: string,
    communityId: string,
    orgUserId: string,
    at: Date,
  ): Promise<ChatUnreadSummary>;
  memberStates(
    orgId: string,
    communityId: string,
    orgUserIds: string[],
    at: Date,
  ): Promise<ChatMemberStates[]>;
  findByClientId(
    orgId: string,
    chatId: string,
    orgUserId: string,
    clientId: string,
  ): Promise<Message | null>;
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
  ): Promise<ReactionChange>;
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
  listOpenFlags(orgId: string, communityId: string, limit?: number): Promise<MessageFlag[]>;
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
  mentions: MentionsRepository;
  outbox: OutboxAppender;
}
export type ChatUnitOfWork = UnitOfWork<ChatWriteScope>;

export type SubscriptionInput =
  { state: 'following' } | { state: 'muted'; mutedUntil?: Date | null } | { state: 'none' };

export type MuteInput = Exclude<SubscriptionInput, { state: 'following' }>;

export interface SubscriptionWriteScope {
  subscriptions: SubscriptionsRepository;
  outbox: OutboxAppender;
}
export type SubscriptionUnitOfWork = UnitOfWork<SubscriptionWriteScope>;

export interface SubscriptionService {
  setPost(postId: string, input: SubscriptionInput, actor: Actor): Promise<void>;
  setSpace(spaceId: string, input: MuteInput, actor: Actor): Promise<void>;
  setChat(chatId: string, input: MuteInput, actor: Actor): Promise<void>;
  viewerSubscriptions(
    orgId: string,
    orgUserId: string,
    itemType: SubscriptionItemType,
    itemIds: string[],
    at: Date,
  ): Promise<Record<string, SubscriptionView>>;
  followerIds(orgId: string, postId: string): Promise<string[]>;
  mutedAmong(orgId: string, item: SubjectRef, orgUserIds: string[], at: Date): Promise<string[]>;
  itemSubscriptions(orgId: string, item: SubjectRef): Promise<Subscription[]>;
}

export interface SubscriptionsRepository {
  upsert(orgId: string, subscription: Subscription): Promise<void>;
  remove(
    orgId: string,
    orgUserId: string,
    itemType: SubscriptionItemType,
    itemId: string,
  ): Promise<void>;
  forViewer(
    orgId: string,
    orgUserId: string,
    itemType: SubscriptionItemType,
    itemIds: string[],
  ): Promise<Subscription[]>;
  ofItem(orgId: string, itemType: SubscriptionItemType, itemId: string): Promise<Subscription[]>;
  followerIds(orgId: string, postId: string): Promise<string[]>;
  mutedAmong(
    orgId: string,
    itemType: SubscriptionItemType,
    itemId: string,
    orgUserIds: string[],
    at: Date,
  ): Promise<string[]>;
}

export interface MentionsRepository {
  ofItem(orgId: string, itemType: MentionItemType, itemId: string): Promise<string[]>;
  forItems(
    orgId: string,
    itemType: MentionItemType,
    itemIds: string[],
  ): Promise<Record<string, string[]>>;
  sync(
    orgId: string,
    itemType: MentionItemType,
    itemId: string,
    orgUserIds: string[],
    at: Date,
  ): Promise<string[]>;
  removeItem(orgId: string, itemType: MentionItemType, itemId: string): Promise<void>;
}
