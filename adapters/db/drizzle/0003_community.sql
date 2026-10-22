ALTER TABLE "comment_reports" RENAME TO "comment_flags";--> statement-breakpoint
ALTER TABLE "comment_flags" RENAME CONSTRAINT "comment_reports_org_id_id_pk" TO "comment_flags_org_id_id_pk";--> statement-breakpoint
ALTER TABLE "comment_flags" RENAME CONSTRAINT "comment_reports_org_id_comment_id_org_user_id_unique" TO "comment_flags_org_id_comment_id_org_user_id_unique";--> statement-breakpoint
ALTER TABLE "comment_flags" RENAME CONSTRAINT "comment_reports_org_id_organizations_id_fk" TO "comment_flags_org_id_organizations_id_fk";--> statement-breakpoint
ALTER TABLE "comment_flags" RENAME CONSTRAINT "comment_reports_org_id_comment_id_comments_org_id_id_fk" TO "comment_flags_org_id_comment_id_comments_org_id_id_fk";--> statement-breakpoint
ALTER TABLE "comment_flags" RENAME CONSTRAINT "comment_reports_org_id_org_user_id_org_users_org_id_id_fk" TO "comment_flags_org_id_org_user_id_org_users_org_id_id_fk";--> statement-breakpoint
ALTER INDEX "comment_reports_open_idx" RENAME TO "comment_flags_open_idx";--> statement-breakpoint
ALTER TABLE "comment_flags" ADD COLUMN "resolution" text;--> statement-breakpoint
ALTER TABLE "comment_flags" ADD COLUMN "resolved_by" text;--> statement-breakpoint
UPDATE "comment_flags" SET "resolution" = 'dismissed' WHERE "resolved_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "comment_flags" ADD CONSTRAINT "comment_flags_resolved_check" CHECK (("comment_flags"."resolved_at" is null) = ("comment_flags"."resolution" is null) and ("comment_flags"."resolved_by" is null or "comment_flags"."resolved_at" is not null));--> statement-breakpoint
ALTER TABLE "comments" ALTER COLUMN "activity_id" DROP NOT NULL;--> statement-breakpoint
CREATE TABLE "communities" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"type" text GENERATED ALWAYS AS ('community') STORED NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"thumbnail_asset_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "communities_org_id_id_pk" PRIMARY KEY("org_id","id"),
	CONSTRAINT "communities_org_id_slug_unique" UNIQUE("org_id","slug")
);
--> statement-breakpoint
CREATE TABLE "space_links" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"space_id" text NOT NULL,
	"content_id" text NOT NULL,
	"seq" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_links_org_id_id_pk" PRIMARY KEY("org_id","id"),
	CONSTRAINT "space_links_org_id_space_id_content_id_unique" UNIQUE("org_id","space_id","content_id")
);
--> statement-breakpoint
CREATE TABLE "space_topics" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"space_id" text NOT NULL,
	"name" text NOT NULL,
	"seq" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_topics_org_id_id_pk" PRIMARY KEY("org_id","id"),
	CONSTRAINT "space_topics_org_id_space_id_name_unique" UNIQUE("org_id","space_id","name"),
	CONSTRAINT "space_topics_org_id_space_id_id_unique" UNIQUE("org_id","space_id","id")
);
--> statement-breakpoint
CREATE TABLE "spaces" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"community_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"seq" integer NOT NULL,
	"access_rule" text DEFAULT 'all_members' NOT NULL,
	"capacity" integer,
	"settings" jsonb DEFAULT '{"comments":true,"reactions":true,"requireReview":false}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spaces_org_id_id_pk" PRIMARY KEY("org_id","id"),
	CONSTRAINT "spaces_org_id_id_community_id_unique" UNIQUE("org_id","id","community_id"),
	CONSTRAINT "spaces_capacity_check" CHECK ("spaces"."capacity" is null or "spaces"."access_rule" <> 'all_members')
);
--> statement-breakpoint
CREATE TABLE "space_members" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"community_id" text NOT NULL,
	"space_id" text NOT NULL,
	"org_user_id" text NOT NULL,
	"status" text NOT NULL,
	"source" text DEFAULT 'request' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_members_org_id_id_pk" PRIMARY KEY("org_id","id"),
	CONSTRAINT "space_members_org_id_space_id_org_user_id_unique" UNIQUE("org_id","space_id","org_user_id")
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"display_name" text,
	"headline" text,
	"bio" text,
	"image_asset_org_id" text,
	"image_asset_id" text,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_image_check" CHECK (("user_profiles"."image_asset_org_id" is null) = ("user_profiles"."image_asset_id" is null))
);
--> statement-breakpoint
CREATE TABLE "blocked_users" (
	"org_id" text NOT NULL,
	"community_id" text NOT NULL,
	"blocker_org_user_id" text NOT NULL,
	"blocked_org_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocked_users_org_id_community_id_blocker_org_user_id_blocked_org_user_id_pk" PRIMARY KEY("org_id","community_id","blocker_org_user_id","blocked_org_user_id")
);
--> statement-breakpoint
CREATE TABLE "chat_users" (
	"org_id" text NOT NULL,
	"community_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"org_user_id" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"last_read_message_id" text,
	"muted_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_users_org_id_chat_id_org_user_id_pk" PRIMARY KEY("org_id","chat_id","org_user_id")
);
--> statement-breakpoint
CREATE TABLE "chats" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"community_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by" text NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chats_org_id_id_pk" PRIMARY KEY("org_id","id"),
	CONSTRAINT "chats_org_id_id_community_id_unique" UNIQUE("org_id","id","community_id"),
	CONSTRAINT "chats_locked_check" CHECK (("chats"."locked_at" is null) = ("chats"."locked_by" is null))
);
--> statement-breakpoint
CREATE TABLE "message_attachments" (
	"org_id" text NOT NULL,
	"community_id" text NOT NULL,
	"message_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"seq" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_attachments_org_id_message_id_asset_id_pk" PRIMARY KEY("org_id","message_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "message_flags" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"community_id" text NOT NULL,
	"message_id" text NOT NULL,
	"org_user_id" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolution" text,
	"resolved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_flags_org_id_id_pk" PRIMARY KEY("org_id","id"),
	CONSTRAINT "message_flags_org_id_message_id_org_user_id_unique" UNIQUE("org_id","message_id","org_user_id"),
	CONSTRAINT "message_flags_resolved_check" CHECK (("message_flags"."resolved_at" is null) = ("message_flags"."resolution" is null) and ("message_flags"."resolved_at" is null) = ("message_flags"."resolved_by" is null))
);
--> statement-breakpoint
CREATE TABLE "message_reactions" (
	"org_id" text NOT NULL,
	"community_id" text NOT NULL,
	"message_id" text NOT NULL,
	"org_user_id" text NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_reactions_org_id_message_id_org_user_id_pk" PRIMARY KEY("org_id","message_id","org_user_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"community_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"org_user_id" text NOT NULL,
	"body" text NOT NULL,
	"reply_to_id" text,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_org_id_id_pk" PRIMARY KEY("org_id","id"),
	CONSTRAINT "messages_org_id_id_community_id_unique" UNIQUE("org_id","id","community_id")
);
--> statement-breakpoint
CREATE TABLE "post_bookmarks" (
	"org_id" text NOT NULL,
	"post_id" text NOT NULL,
	"org_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_bookmarks_org_id_post_id_org_user_id_pk" PRIMARY KEY("org_id","post_id","org_user_id")
);
--> statement-breakpoint
CREATE TABLE "post_flags" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"post_id" text NOT NULL,
	"org_user_id" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolution" text,
	"resolved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_flags_org_id_id_pk" PRIMARY KEY("org_id","id"),
	CONSTRAINT "post_flags_org_id_post_id_org_user_id_unique" UNIQUE("org_id","post_id","org_user_id"),
	CONSTRAINT "post_flags_resolved_check" CHECK (("post_flags"."resolved_at" is null) = ("post_flags"."resolution" is null) and ("post_flags"."resolved_at" is null) = ("post_flags"."resolved_by" is null))
);
--> statement-breakpoint
CREATE TABLE "post_follows" (
	"org_id" text NOT NULL,
	"post_id" text NOT NULL,
	"org_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_follows_org_id_post_id_org_user_id_pk" PRIMARY KEY("org_id","post_id","org_user_id")
);
--> statement-breakpoint
CREATE TABLE "post_reactions" (
	"org_id" text NOT NULL,
	"post_id" text NOT NULL,
	"org_user_id" text NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_reactions_org_id_post_id_org_user_id_pk" PRIMARY KEY("org_id","post_id","org_user_id")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"community_id" text NOT NULL,
	"space_id" text NOT NULL,
	"org_user_id" text NOT NULL,
	"topic_id" text,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cover_asset_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"removed_by" text,
	"pinned" boolean DEFAULT false NOT NULL,
	"comments_closed" boolean,
	"reactions_enabled" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "posts_org_id_id_pk" PRIMARY KEY("org_id","id"),
	CONSTRAINT "posts_removed_by_check" CHECK (("posts"."status" = 'removed') = ("posts"."removed_by" is not null)),
	CONSTRAINT "posts_scheduled_check" CHECK ("posts"."status" <> 'scheduled' or "posts"."scheduled_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "content_items" DROP CONSTRAINT "content_items_type_check";--> statement-breakpoint
ALTER TABLE "automations" ADD COLUMN "filter" jsonb;--> statement-breakpoint
ALTER TABLE "automations" ADD COLUMN "source" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "post_id" text;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "community_id" text;--> statement-breakpoint
ALTER TABLE "communities" ADD CONSTRAINT "communities_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communities" ADD CONSTRAINT "communities_org_id_id_type_content_items_org_id_id_type_fk" FOREIGN KEY ("org_id","id","type") REFERENCES "public"."content_items"("org_id","id","type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communities" ADD CONSTRAINT "communities_org_id_thumbnail_asset_id_assets_org_id_id_fk" FOREIGN KEY ("org_id","thumbnail_asset_id") REFERENCES "public"."assets"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_links" ADD CONSTRAINT "space_links_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_links" ADD CONSTRAINT "space_links_org_id_space_id_spaces_org_id_id_fk" FOREIGN KEY ("org_id","space_id") REFERENCES "public"."spaces"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_links" ADD CONSTRAINT "space_links_org_id_content_id_content_items_org_id_id_fk" FOREIGN KEY ("org_id","content_id") REFERENCES "public"."content_items"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_topics" ADD CONSTRAINT "space_topics_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_topics" ADD CONSTRAINT "space_topics_org_id_space_id_spaces_org_id_id_fk" FOREIGN KEY ("org_id","space_id") REFERENCES "public"."spaces"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_org_id_community_id_communities_org_id_id_fk" FOREIGN KEY ("org_id","community_id") REFERENCES "public"."communities"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_org_id_community_id_communities_org_id_id_fk" FOREIGN KEY ("org_id","community_id") REFERENCES "public"."communities"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_org_id_space_id_community_id_spaces_org_id_id_community_id_fk" FOREIGN KEY ("org_id","space_id","community_id") REFERENCES "public"."spaces"("org_id","id","community_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_org_id_org_user_id_org_users_org_id_id_fk" FOREIGN KEY ("org_id","org_user_id") REFERENCES "public"."org_users"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_image_asset_org_id_image_asset_id_assets_org_id_id_fk" FOREIGN KEY ("image_asset_org_id","image_asset_id") REFERENCES "public"."assets"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocked_users" ADD CONSTRAINT "blocked_users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocked_users" ADD CONSTRAINT "blocked_users_org_id_community_id_communities_org_id_id_fk" FOREIGN KEY ("org_id","community_id") REFERENCES "public"."communities"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocked_users" ADD CONSTRAINT "blocked_users_org_id_blocker_org_user_id_org_users_org_id_id_fk" FOREIGN KEY ("org_id","blocker_org_user_id") REFERENCES "public"."org_users"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocked_users" ADD CONSTRAINT "blocked_users_org_id_blocked_org_user_id_org_users_org_id_id_fk" FOREIGN KEY ("org_id","blocked_org_user_id") REFERENCES "public"."org_users"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_users" ADD CONSTRAINT "chat_users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_users" ADD CONSTRAINT "chat_users_org_id_chat_id_community_id_chats_org_id_id_community_id_fk" FOREIGN KEY ("org_id","chat_id","community_id") REFERENCES "public"."chats"("org_id","id","community_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_users" ADD CONSTRAINT "chat_users_org_id_org_user_id_org_users_org_id_id_fk" FOREIGN KEY ("org_id","org_user_id") REFERENCES "public"."org_users"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_org_id_community_id_communities_org_id_id_fk" FOREIGN KEY ("org_id","community_id") REFERENCES "public"."communities"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_org_id_created_by_org_users_org_id_id_fk" FOREIGN KEY ("org_id","created_by") REFERENCES "public"."org_users"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_org_id_locked_by_org_users_org_id_id_fk" FOREIGN KEY ("org_id","locked_by") REFERENCES "public"."org_users"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_org_id_message_id_community_id_messages_org_id_id_community_id_fk" FOREIGN KEY ("org_id","message_id","community_id") REFERENCES "public"."messages"("org_id","id","community_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_org_id_asset_id_assets_org_id_id_fk" FOREIGN KEY ("org_id","asset_id") REFERENCES "public"."assets"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_flags" ADD CONSTRAINT "message_flags_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_flags" ADD CONSTRAINT "message_flags_org_id_message_id_community_id_messages_org_id_id_community_id_fk" FOREIGN KEY ("org_id","message_id","community_id") REFERENCES "public"."messages"("org_id","id","community_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_flags" ADD CONSTRAINT "message_flags_org_id_org_user_id_org_users_org_id_id_fk" FOREIGN KEY ("org_id","org_user_id") REFERENCES "public"."org_users"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_org_id_message_id_community_id_messages_org_id_id_community_id_fk" FOREIGN KEY ("org_id","message_id","community_id") REFERENCES "public"."messages"("org_id","id","community_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_org_id_org_user_id_org_users_org_id_id_fk" FOREIGN KEY ("org_id","org_user_id") REFERENCES "public"."org_users"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_org_id_chat_id_community_id_chats_org_id_id_community_id_fk" FOREIGN KEY ("org_id","chat_id","community_id") REFERENCES "public"."chats"("org_id","id","community_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_org_id_org_user_id_org_users_org_id_id_fk" FOREIGN KEY ("org_id","org_user_id") REFERENCES "public"."org_users"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_org_id_reply_to_id_messages_org_id_id_fk" FOREIGN KEY ("org_id","reply_to_id") REFERENCES "public"."messages"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_bookmarks" ADD CONSTRAINT "post_bookmarks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_bookmarks" ADD CONSTRAINT "post_bookmarks_org_id_post_id_posts_org_id_id_fk" FOREIGN KEY ("org_id","post_id") REFERENCES "public"."posts"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_bookmarks" ADD CONSTRAINT "post_bookmarks_org_id_org_user_id_org_users_org_id_id_fk" FOREIGN KEY ("org_id","org_user_id") REFERENCES "public"."org_users"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_flags" ADD CONSTRAINT "post_flags_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_flags" ADD CONSTRAINT "post_flags_org_id_post_id_posts_org_id_id_fk" FOREIGN KEY ("org_id","post_id") REFERENCES "public"."posts"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_flags" ADD CONSTRAINT "post_flags_org_id_org_user_id_org_users_org_id_id_fk" FOREIGN KEY ("org_id","org_user_id") REFERENCES "public"."org_users"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_follows" ADD CONSTRAINT "post_follows_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_follows" ADD CONSTRAINT "post_follows_org_id_post_id_posts_org_id_id_fk" FOREIGN KEY ("org_id","post_id") REFERENCES "public"."posts"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_follows" ADD CONSTRAINT "post_follows_org_id_org_user_id_org_users_org_id_id_fk" FOREIGN KEY ("org_id","org_user_id") REFERENCES "public"."org_users"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_reactions" ADD CONSTRAINT "post_reactions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_reactions" ADD CONSTRAINT "post_reactions_org_id_post_id_posts_org_id_id_fk" FOREIGN KEY ("org_id","post_id") REFERENCES "public"."posts"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_reactions" ADD CONSTRAINT "post_reactions_org_id_org_user_id_org_users_org_id_id_fk" FOREIGN KEY ("org_id","org_user_id") REFERENCES "public"."org_users"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_org_id_space_id_community_id_spaces_org_id_id_community_id_fk" FOREIGN KEY ("org_id","space_id","community_id") REFERENCES "public"."spaces"("org_id","id","community_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_org_id_org_user_id_org_users_org_id_id_fk" FOREIGN KEY ("org_id","org_user_id") REFERENCES "public"."org_users"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_org_id_space_id_topic_id_space_topics_org_id_space_id_id_fk" FOREIGN KEY ("org_id","space_id","topic_id") REFERENCES "public"."space_topics"("org_id","space_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_org_id_cover_asset_id_assets_org_id_id_fk" FOREIGN KEY ("org_id","cover_asset_id") REFERENCES "public"."assets"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_org_id_removed_by_org_users_org_id_id_fk" FOREIGN KEY ("org_id","removed_by") REFERENCES "public"."org_users"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "spaces_order_idx" ON "spaces" USING btree ("org_id","community_id","seq");--> statement-breakpoint
CREATE INDEX "space_members_space_idx" ON "space_members" USING btree ("org_id","space_id","status");--> statement-breakpoint
CREATE INDEX "space_members_community_idx" ON "space_members" USING btree ("org_id","community_id");--> statement-breakpoint
CREATE INDEX "blocked_users_blocked_idx" ON "blocked_users" USING btree ("org_id","community_id","blocked_org_user_id");--> statement-breakpoint
CREATE INDEX "chat_users_user_idx" ON "chat_users" USING btree ("org_id","community_id","org_user_id");--> statement-breakpoint
CREATE INDEX "message_flags_open_idx" ON "message_flags" USING btree ("org_id","community_id","message_id","resolved_at");--> statement-breakpoint
CREATE INDEX "messages_chat_idx" ON "messages" USING btree ("org_id","chat_id","created_at");--> statement-breakpoint
CREATE INDEX "post_flags_open_idx" ON "post_flags" USING btree ("org_id","post_id","resolved_at");--> statement-breakpoint
CREATE INDEX "posts_feed_idx" ON "posts" USING btree ("org_id","space_id","status","pinned" desc,"published_at" desc);--> statement-breakpoint
CREATE INDEX "posts_due_idx" ON "posts" USING btree ("org_id","status","scheduled_at");--> statement-breakpoint
CREATE INDEX "posts_author_idx" ON "posts" USING btree ("org_id","org_user_id");--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_org_id_post_id_posts_org_id_id_fk" FOREIGN KEY ("org_id","post_id") REFERENCES "public"."posts"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_org_id_community_id_communities_org_id_id_fk" FOREIGN KEY ("org_id","community_id") REFERENCES "public"."communities"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_post_idx" ON "comments" USING btree ("org_id","post_id","status","created_at");--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_type_check" CHECK ("content_items"."type" in ('course', 'download', 'community'));--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_target_check" CHECK (num_nonnulls("comments"."activity_id", "comments"."post_id") = 1);--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_community_check" CHECK ("comments"."post_id" is null or "comments"."community_id" is not null);