// discussion tables — comments on an activity, their reactions and reports.
// Configuration is not here: the course's comment settings ride on the course's
// `content` settings row, and an activity's override rides on the activity's
// own settings blob.
//
// The author is always an org user, so one column covers both
// learners and staff. Staff-ness is NOT stored — it is read from the author's
// current role. A removed comment keeps its row so replies below it survive;
// only the body stops being served.
//
// No course_id: which course an activity sits in is content's fact and changes
// when a course is restructured. The staff comment list joins to modules to
// scope by course.
import { desc, sql } from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  primaryKey,
  foreignKey,
  unique,
  index,
  check,
} from "drizzle-orm/pg-core";
import type {
  BlockedUser,
  Chat,
  ChatUser,
  Comment,
  CommentReaction,
  CommentReport,
  Message,
  MessageAttachment,
  MessageFlag,
  MessageReaction,
  Post,
  PostBookmark,
  PostFlag,
  PostFollow,
  PostReaction,
} from "@headless-lms/core/schemas";
import { genId } from "@headless-lms/core/shared/id";
import { organizations, orgUsers } from "./organizations.js";
import { activities, communities, spaceTopics, spaces } from "./content.js";
import { assets } from "./assets.js";
import type { Expect, NoDrift } from "./drift.js";

export const posts = pgTable(
  "posts",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id")
      .notNull()
      .$defaultFn(() => genId("post")),
    communityId: text("community_id").notNull(),
    spaceId: text("space_id").notNull(),
    orgUserId: text("org_user_id").notNull(),
    topicId: text("topic_id"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    extra: jsonb("extra").$type<Post["extra"]>().notNull().default({}),
    coverAssetId: text("cover_asset_id"),
    status: text("status", {
      enum: ["draft", "scheduled", "pending", "published", "removed"],
    })
      .notNull()
      .default("draft"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    removedBy: text("removed_by"),
    pinned: boolean("pinned").notNull().default(false),
    commentsClosed: boolean("comments_closed"),
    reactionsEnabled: boolean("reactions_enabled"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    spaceFk: foreignKey({
      columns: [t.orgId, t.spaceId, t.communityId],
      foreignColumns: [spaces.orgId, spaces.id, spaces.communityId],
    }).onDelete("cascade"),
    authorFk: foreignKey({
      columns: [t.orgId, t.orgUserId],
      foreignColumns: [orgUsers.orgId, orgUsers.id],
    }),
    topicFk: foreignKey({
      columns: [t.orgId, t.spaceId, t.topicId],
      foreignColumns: [spaceTopics.orgId, spaceTopics.spaceId, spaceTopics.id],
    }),
    coverAssetFk: foreignKey({
      columns: [t.orgId, t.coverAssetId],
      foreignColumns: [assets.orgId, assets.id],
    }),
    removedByFk: foreignKey({
      columns: [t.orgId, t.removedBy],
      foreignColumns: [orgUsers.orgId, orgUsers.id],
    }),
    removedCk: check(
      "posts_removed_by_check",
      sql`(${t.status} = 'removed') = (${t.removedBy} is not null)`,
    ),
    scheduledCk: check(
      "posts_scheduled_check",
      sql`${t.status} <> 'scheduled' or ${t.scheduledAt} is not null`,
    ),
    feedIdx: index("posts_feed_idx").on(
      t.orgId,
      t.spaceId,
      t.status,
      desc(t.pinned),
      desc(t.publishedAt),
    ),
    dueIdx: index("posts_due_idx").on(t.orgId, t.status, t.scheduledAt),
    authorIdx: index("posts_author_idx").on(t.orgId, t.orgUserId),
  }),
);

export const postReactions = pgTable(
  "post_reactions",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    postId: text("post_id").notNull(),
    orgUserId: text("org_user_id").notNull(),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.postId, t.orgUserId] }),
    postFk: foreignKey({
      columns: [t.orgId, t.postId],
      foreignColumns: [posts.orgId, posts.id],
    }).onDelete("cascade"),
    orgUserFk: foreignKey({
      columns: [t.orgId, t.orgUserId],
      foreignColumns: [orgUsers.orgId, orgUsers.id],
    }).onDelete("cascade"),
  }),
);

export const postFollows = pgTable(
  "post_follows",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    postId: text("post_id").notNull(),
    orgUserId: text("org_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.postId, t.orgUserId] }),
    postFk: foreignKey({
      columns: [t.orgId, t.postId],
      foreignColumns: [posts.orgId, posts.id],
    }).onDelete("cascade"),
    orgUserFk: foreignKey({
      columns: [t.orgId, t.orgUserId],
      foreignColumns: [orgUsers.orgId, orgUsers.id],
    }).onDelete("cascade"),
  }),
);

export const postBookmarks = pgTable(
  "post_bookmarks",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    postId: text("post_id").notNull(),
    orgUserId: text("org_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.postId, t.orgUserId] }),
    postFk: foreignKey({
      columns: [t.orgId, t.postId],
      foreignColumns: [posts.orgId, posts.id],
    }).onDelete("cascade"),
    orgUserFk: foreignKey({
      columns: [t.orgId, t.orgUserId],
      foreignColumns: [orgUsers.orgId, orgUsers.id],
    }).onDelete("cascade"),
    userIdx: index("post_bookmarks_user_idx").on(t.orgId, t.orgUserId, t.createdAt),
  }),
);

export const postFlags = pgTable(
  "post_flags",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id")
      .notNull()
      .$defaultFn(() => genId("postFlag")),
    postId: text("post_id").notNull(),
    orgUserId: text("org_user_id").notNull(),
    reason: text("reason").notNull().default(""),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolution: text("resolution", { enum: ["dismissed", "removed"] }),
    resolvedBy: text("resolved_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    reporterUq: unique().on(t.orgId, t.postId, t.orgUserId),
    postFk: foreignKey({
      columns: [t.orgId, t.postId],
      foreignColumns: [posts.orgId, posts.id],
    }).onDelete("cascade"),
    reporterFk: foreignKey({
      columns: [t.orgId, t.orgUserId],
      foreignColumns: [orgUsers.orgId, orgUsers.id],
    }),
    resolvedCk: check(
      "post_flags_resolved_check",
      sql`(${t.resolvedAt} is null) = (${t.resolution} is null) and (${t.resolvedAt} is null) = (${t.resolvedBy} is null)`,
    ),
    openIdx: index("post_flags_open_idx").on(t.orgId, t.postId, t.resolvedAt),
  }),
);

export const comments = pgTable(
  "comments",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id")
      .notNull()
      .$defaultFn(() => genId("comment")),
    activityId: text("activity_id"),
    postId: text("post_id"),
    communityId: text("community_id"),
    parentId: text("parent_id"),
    orgUserId: text("org_user_id").notNull(),
    body: text("body").notNull(),
    status: text("status", { enum: ["pending", "published", "removed"] })
      .notNull()
      .default("published"),
    removedBy: text("removed_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    activityFk: foreignKey({
      columns: [t.orgId, t.activityId],
      foreignColumns: [activities.orgId, activities.id],
    }).onDelete("cascade"),
    postFk: foreignKey({
      columns: [t.orgId, t.postId],
      foreignColumns: [posts.orgId, posts.id],
    }).onDelete("cascade"),
    communityFk: foreignKey({
      columns: [t.orgId, t.communityId],
      foreignColumns: [communities.orgId, communities.id],
    }).onDelete("cascade"),
    authorFk: foreignKey({
      columns: [t.orgId, t.orgUserId],
      foreignColumns: [orgUsers.orgId, orgUsers.id],
    }),
    removedByFk: foreignKey({
      columns: [t.orgId, t.removedBy],
      foreignColumns: [orgUsers.orgId, orgUsers.id],
    }),
    parentFk: foreignKey({
      columns: [t.orgId, t.parentId],
      foreignColumns: [t.orgId, t.id],
    }),
    removedCk: check(
      "comments_removed_by_check",
      sql`(${t.status} = 'removed') = (${t.removedBy} is not null)`,
    ),
    targetCk: check("comments_target_check", sql`num_nonnulls(${t.activityId}, ${t.postId}) = 1`),
    communityCk: check(
      "comments_community_check",
      sql`${t.postId} is null or ${t.communityId} is not null`,
    ),
    activityIdx: index("comments_activity_idx").on(t.orgId, t.activityId, t.status, t.createdAt),
    postIdx: index("comments_post_idx").on(t.orgId, t.postId, t.status, t.createdAt),
    queueIdx: index("comments_queue_idx").on(t.orgId, t.status, t.createdAt),
  }),
);

export const commentReactions = pgTable(
  "comment_reactions",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    commentId: text("comment_id").notNull(),
    orgUserId: text("org_user_id").notNull(),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.commentId, t.orgUserId] }),
    commentFk: foreignKey({
      columns: [t.orgId, t.commentId],
      foreignColumns: [comments.orgId, comments.id],
    }).onDelete("cascade"),
    authorFk: foreignKey({
      columns: [t.orgId, t.orgUserId],
      foreignColumns: [orgUsers.orgId, orgUsers.id],
    }),
  }),
);

export const commentFlags = pgTable(
  "comment_flags",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id")
      .notNull()
      .$defaultFn(() => genId("commentReport")),
    commentId: text("comment_id").notNull(),
    orgUserId: text("org_user_id").notNull(),
    reason: text("reason").notNull().default(""),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolution: text("resolution", { enum: ["dismissed", "removed"] }),
    resolvedBy: text("resolved_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    reporterUq: unique().on(t.orgId, t.commentId, t.orgUserId),
    commentFk: foreignKey({
      columns: [t.orgId, t.commentId],
      foreignColumns: [comments.orgId, comments.id],
    }).onDelete("cascade"),
    reporterFk: foreignKey({
      columns: [t.orgId, t.orgUserId],
      foreignColumns: [orgUsers.orgId, orgUsers.id],
    }),
    resolvedCk: check(
      "comment_flags_resolved_check",
      sql`(${t.resolvedAt} is null) = (${t.resolution} is null) and (${t.resolvedBy} is null or ${t.resolvedAt} is not null)`,
    ),
    openIdx: index("comment_flags_open_idx").on(t.orgId, t.commentId, t.resolvedAt),
  }),
);

export const chats = pgTable(
  "chats",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id")
      .notNull()
      .$defaultFn(() => genId("chat")),
    communityId: text("community_id").notNull(),
    kind: text("kind", { enum: ["direct", "group"] }).notNull(),
    status: text("status", { enum: ["pending", "open", "closed"] })
      .notNull()
      .default("open"),
    createdBy: text("created_by").notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    communityUq: unique().on(t.orgId, t.id, t.communityId),
    communityFk: foreignKey({
      columns: [t.orgId, t.communityId],
      foreignColumns: [communities.orgId, communities.id],
    }).onDelete("cascade"),
    createdByFk: foreignKey({
      columns: [t.orgId, t.createdBy],
      foreignColumns: [orgUsers.orgId, orgUsers.id],
    }),
    lockedByFk: foreignKey({
      columns: [t.orgId, t.lockedBy],
      foreignColumns: [orgUsers.orgId, orgUsers.id],
    }),
    lockedCk: check("chats_locked_check", sql`(${t.lockedAt} is null) = (${t.lockedBy} is null)`),
  }),
);

export const chatUsers = pgTable(
  "chat_users",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    communityId: text("community_id").notNull(),
    chatId: text("chat_id").notNull(),
    orgUserId: text("org_user_id").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true }),
    lastReadMessageId: text("last_read_message_id"),
    mutedUntil: timestamp("muted_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.chatId, t.orgUserId] }),
    chatFk: foreignKey({
      columns: [t.orgId, t.chatId, t.communityId],
      foreignColumns: [chats.orgId, chats.id, chats.communityId],
    }).onDelete("cascade"),
    orgUserFk: foreignKey({
      columns: [t.orgId, t.orgUserId],
      foreignColumns: [orgUsers.orgId, orgUsers.id],
    }).onDelete("cascade"),
    userIdx: index("chat_users_user_idx").on(t.orgId, t.communityId, t.orgUserId),
  }),
);

export const messages = pgTable(
  "messages",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id")
      .notNull()
      .$defaultFn(() => genId("message")),
    communityId: text("community_id").notNull(),
    chatId: text("chat_id").notNull(),
    orgUserId: text("org_user_id").notNull(),
    body: text("body").notNull(),
    replyToId: text("reply_to_id"),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    communityUq: unique().on(t.orgId, t.id, t.communityId),
    chatFk: foreignKey({
      columns: [t.orgId, t.chatId, t.communityId],
      foreignColumns: [chats.orgId, chats.id, chats.communityId],
    }).onDelete("cascade"),
    authorFk: foreignKey({
      columns: [t.orgId, t.orgUserId],
      foreignColumns: [orgUsers.orgId, orgUsers.id],
    }),
    replyFk: foreignKey({
      columns: [t.orgId, t.replyToId],
      foreignColumns: [t.orgId, t.id],
    }),
    chatIdx: index("messages_chat_idx").on(t.orgId, t.chatId, t.createdAt),
  }),
);

export const messageAttachments = pgTable(
  "message_attachments",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    communityId: text("community_id").notNull(),
    messageId: text("message_id").notNull(),
    assetId: text("asset_id").notNull(),
    seq: integer("seq").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.messageId, t.assetId] }),
    messageFk: foreignKey({
      columns: [t.orgId, t.messageId, t.communityId],
      foreignColumns: [messages.orgId, messages.id, messages.communityId],
    }).onDelete("cascade"),
    assetFk: foreignKey({
      columns: [t.orgId, t.assetId],
      foreignColumns: [assets.orgId, assets.id],
    }),
  }),
);

export const messageReactions = pgTable(
  "message_reactions",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    communityId: text("community_id").notNull(),
    messageId: text("message_id").notNull(),
    orgUserId: text("org_user_id").notNull(),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.messageId, t.orgUserId] }),
    messageFk: foreignKey({
      columns: [t.orgId, t.messageId, t.communityId],
      foreignColumns: [messages.orgId, messages.id, messages.communityId],
    }).onDelete("cascade"),
    orgUserFk: foreignKey({
      columns: [t.orgId, t.orgUserId],
      foreignColumns: [orgUsers.orgId, orgUsers.id],
    }).onDelete("cascade"),
  }),
);

export const messageFlags = pgTable(
  "message_flags",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id")
      .notNull()
      .$defaultFn(() => genId("messageFlag")),
    communityId: text("community_id").notNull(),
    messageId: text("message_id").notNull(),
    orgUserId: text("org_user_id").notNull(),
    reason: text("reason").notNull().default(""),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolution: text("resolution", { enum: ["dismissed", "deleted", "locked"] }),
    resolvedBy: text("resolved_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    reporterUq: unique().on(t.orgId, t.messageId, t.orgUserId),
    messageFk: foreignKey({
      columns: [t.orgId, t.messageId, t.communityId],
      foreignColumns: [messages.orgId, messages.id, messages.communityId],
    }).onDelete("cascade"),
    reporterFk: foreignKey({
      columns: [t.orgId, t.orgUserId],
      foreignColumns: [orgUsers.orgId, orgUsers.id],
    }),
    resolvedCk: check(
      "message_flags_resolved_check",
      sql`(${t.resolvedAt} is null) = (${t.resolution} is null) and (${t.resolvedAt} is null) = (${t.resolvedBy} is null)`,
    ),
    openIdx: index("message_flags_open_idx").on(t.orgId, t.communityId, t.messageId, t.resolvedAt),
  }),
);

export const blockedUsers = pgTable(
  "blocked_users",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    communityId: text("community_id").notNull(),
    blockerOrgUserId: text("blocker_org_user_id").notNull(),
    blockedOrgUserId: text("blocked_org_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({
      columns: [t.orgId, t.communityId, t.blockerOrgUserId, t.blockedOrgUserId],
    }),
    communityFk: foreignKey({
      columns: [t.orgId, t.communityId],
      foreignColumns: [communities.orgId, communities.id],
    }).onDelete("cascade"),
    blockerFk: foreignKey({
      columns: [t.orgId, t.blockerOrgUserId],
      foreignColumns: [orgUsers.orgId, orgUsers.id],
    }).onDelete("cascade"),
    blockedFk: foreignKey({
      columns: [t.orgId, t.blockedOrgUserId],
      foreignColumns: [orgUsers.orgId, orgUsers.id],
    }).onDelete("cascade"),
    blockedIdx: index("blocked_users_blocked_idx").on(t.orgId, t.communityId, t.blockedOrgUserId),
  }),
);

type _PostsDrift = Expect<NoDrift<typeof posts.$inferSelect, Post>>;
type _PostReactionsDrift = Expect<NoDrift<typeof postReactions.$inferSelect, PostReaction>>;
type _PostFollowsDrift = Expect<NoDrift<typeof postFollows.$inferSelect, PostFollow>>;
type _PostBookmarksDrift = Expect<NoDrift<typeof postBookmarks.$inferSelect, PostBookmark>>;
type _PostFlagsDrift = Expect<NoDrift<typeof postFlags.$inferSelect, PostFlag>>;
type _CommentsDrift = Expect<NoDrift<typeof comments.$inferSelect, Comment>>;
type _CommentReactionsDrift = Expect<
  NoDrift<typeof commentReactions.$inferSelect, CommentReaction>
>;
type _CommentFlagsDrift = Expect<NoDrift<typeof commentFlags.$inferSelect, CommentReport>>;
type _ChatsDrift = Expect<NoDrift<typeof chats.$inferSelect, Chat>>;
type _ChatUsersDrift = Expect<
  NoDrift<Omit<typeof chatUsers.$inferSelect, "mutedUntil">, Omit<ChatUser, "mute">>
>;
type _MessagesDrift = Expect<NoDrift<typeof messages.$inferSelect, Message>>;
type _MessageAttachmentsDrift = Expect<
  NoDrift<typeof messageAttachments.$inferSelect, MessageAttachment>
>;
type _MessageReactionsDrift = Expect<
  NoDrift<typeof messageReactions.$inferSelect, MessageReaction>
>;
type _MessageFlagsDrift = Expect<NoDrift<typeof messageFlags.$inferSelect, MessageFlag>>;
type _BlockedUsersDrift = Expect<NoDrift<typeof blockedUsers.$inferSelect, BlockedUser>>;
