// identity tables — the person.
//
// One row per human, global, storing auth ID in `external_id`.
import { desc, sql } from "drizzle-orm";
import {
  pgTable,
  text,
  jsonb,
  timestamp,
  boolean,
  foreignKey,
  check,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import type { Notification, User, UserProfile } from "@headless-lms/core/schemas";
import { genId } from "@headless-lms/core/shared/id";
import { assets } from "./assets.js";
import { orgUsers } from "./organizations.js";
import { communities, spaces } from "./content.js";
import { chats, comments, messages, posts } from "./discussion.js";
import type { Expect, NoDrift } from "./drift.js";

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => genId("user")),
  // auth engine's ID - e.g. better-auth.
  externalId: text("external_id").unique(),
  email: text("email").notNull().unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const userProfiles = pgTable(
  "user_profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: text("display_name"),
    headline: text("headline"),
    bio: text("bio"),
    imageAssetOrgId: text("image_asset_org_id"),
    imageAssetId: text("image_asset_id"),
    extra: jsonb("extra").$type<UserProfile["extra"]>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    imageFk: foreignKey({
      columns: [t.imageAssetOrgId, t.imageAssetId],
      foreignColumns: [assets.orgId, assets.id],
    }),
    imageCk: check(
      "user_profiles_image_check",
      sql`(${t.imageAssetOrgId} is null) = (${t.imageAssetId} is null)`,
    ),
    imageIdx: index("user_profiles_image_idx").on(t.imageAssetOrgId, t.imageAssetId),
  }),
);

const NOTIFICATION_KINDS = [
  "newPostInSpace",
  "newCommentOnPost",
  "replyToYourComment",
  "yourPostWasPublished",
  "yourPostWasRemoved",
  "yourCommentWasRemoved",
  "requestApproved",
  "requestDeclined",
  "invitedToSpace",
  "newMessage",
  "messageRequest",
  "addedToGroupChat",
  "youAreNowAModerator",
  "membershipEndingSoon",
  "welcomeToCommunity",
  "postAwaitingReview",
  "joinRequest",
  "somethingWasFlagged",
  "messageWasFlagged",
] as const;

export const notifications = pgTable(
  "notifications",
  {
    orgId: text("org_id").notNull(),
    id: text("id")
      .notNull()
      .$defaultFn(() => genId("notification")),
    userId: text("user_id").notNull(),
    kind: text("kind", { enum: NOTIFICATION_KINDS }).notNull(),
    actorOrgUserId: text("actor_org_user_id"),
    communityId: text("community_id"),
    spaceId: text("space_id"),
    postId: text("post_id"),
    commentId: text("comment_id"),
    chatId: text("chat_id"),
    messageId: text("message_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    userFk: foreignKey({
      columns: [t.orgId, t.userId],
      foreignColumns: [orgUsers.orgId, orgUsers.userId],
    }).onDelete("cascade"),
    communityFk: foreignKey({
      columns: [t.orgId, t.communityId],
      foreignColumns: [communities.orgId, communities.id],
    }).onDelete("cascade"),
    spaceFk: foreignKey({
      columns: [t.orgId, t.spaceId],
      foreignColumns: [spaces.orgId, spaces.id],
    }).onDelete("cascade"),
    postFk: foreignKey({
      columns: [t.orgId, t.postId],
      foreignColumns: [posts.orgId, posts.id],
    }).onDelete("cascade"),
    commentFk: foreignKey({
      columns: [t.orgId, t.commentId],
      foreignColumns: [comments.orgId, comments.id],
    }).onDelete("cascade"),
    chatFk: foreignKey({
      columns: [t.orgId, t.chatId],
      foreignColumns: [chats.orgId, chats.id],
    }).onDelete("cascade"),
    messageFk: foreignKey({
      columns: [t.orgId, t.messageId],
      foreignColumns: [messages.orgId, messages.id],
    }).onDelete("cascade"),
    listIdx: index("notifications_list_idx").on(t.orgId, t.userId, t.readAt, desc(t.createdAt)),
    feedIdx: index("notifications_feed_idx").on(t.orgId, t.userId, desc(t.createdAt), desc(t.id)),
    communityIdx: index("notifications_community_idx").on(t.orgId, t.communityId),
    spaceIdx: index("notifications_space_idx").on(t.orgId, t.spaceId),
    postIdx: index("notifications_post_idx").on(t.orgId, t.postId),
    commentIdx: index("notifications_comment_idx").on(t.orgId, t.commentId),
    chatIdx: index("notifications_chat_idx").on(t.orgId, t.chatId),
    messageIdx: index("notifications_message_idx").on(t.orgId, t.messageId),
  }),
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    orgId: text("org_id").notNull(),
    userId: text("user_id").notNull(),
    kind: text("kind", { enum: NOTIFICATION_KINDS }).notNull(),
    inApp: boolean("in_app").notNull(),
    email: boolean("email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.userId, t.kind] }),
    userFk: foreignKey({
      columns: [t.orgId, t.userId],
      foreignColumns: [orgUsers.orgId, orgUsers.userId],
    }).onDelete("cascade"),
  }),
);

type _UsersDrift = Expect<NoDrift<typeof users.$inferSelect, User>>;
type _UserProfilesDrift = Expect<NoDrift<typeof userProfiles.$inferSelect, UserProfile>>;
type _NotificationsDrift = Expect<NoDrift<typeof notifications.$inferSelect, Notification>>;
