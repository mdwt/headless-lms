CREATE TABLE "notification_preferences" (
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"in_app" boolean NOT NULL,
	"email" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_org_id_user_id_kind_pk" PRIMARY KEY("org_id","user_id","kind")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"actor_org_user_id" text,
	"community_id" text,
	"space_id" text,
	"post_id" text,
	"comment_id" text,
	"chat_id" text,
	"message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "notifications_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_org_id_user_id_org_users_org_id_user_id_fk" FOREIGN KEY ("org_id","user_id") REFERENCES "public"."org_users"("org_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_user_id_org_users_org_id_user_id_fk" FOREIGN KEY ("org_id","user_id") REFERENCES "public"."org_users"("org_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_community_id_communities_org_id_id_fk" FOREIGN KEY ("org_id","community_id") REFERENCES "public"."communities"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_space_id_spaces_org_id_id_fk" FOREIGN KEY ("org_id","space_id") REFERENCES "public"."spaces"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_post_id_posts_org_id_id_fk" FOREIGN KEY ("org_id","post_id") REFERENCES "public"."posts"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_comment_id_comments_org_id_id_fk" FOREIGN KEY ("org_id","comment_id") REFERENCES "public"."comments"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_chat_id_chats_org_id_id_fk" FOREIGN KEY ("org_id","chat_id") REFERENCES "public"."chats"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_message_id_messages_org_id_id_fk" FOREIGN KEY ("org_id","message_id") REFERENCES "public"."messages"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_list_idx" ON "notifications" USING btree ("org_id","user_id","read_at","created_at" desc);