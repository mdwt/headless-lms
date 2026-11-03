DROP TABLE "notification_preferences" CASCADE;--> statement-breakpoint
DROP TABLE "notifications" CASCADE;--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"notification_id" text NOT NULL,
	"channel" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "notification_deliveries_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"source_event_id" text,
	"type" text NOT NULL,
	"scope" text NOT NULL,
	"reasons" text[] NOT NULL,
	"matched_reason" text NOT NULL,
	"category" text NOT NULL,
	"community_id" text,
	"space_id" text,
	"actor_org_user_id" text,
	"subject_type" text,
	"subject_id" text,
	"parent_type" text,
	"parent_id" text,
	"display" jsonb NOT NULL,
	"in_app" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "notifications_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_org_id_notification_id_notifications_org_id_id_fk" FOREIGN KEY ("org_id","notification_id") REFERENCES "public"."notifications"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_user_id_org_users_org_id_user_id_fk" FOREIGN KEY ("org_id","user_id") REFERENCES "public"."org_users"("org_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_community_id_communities_org_id_id_fk" FOREIGN KEY ("org_id","community_id") REFERENCES "public"."communities"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_space_id_spaces_org_id_id_fk" FOREIGN KEY ("org_id","space_id") REFERENCES "public"."spaces"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_channel_idx" ON "notification_deliveries" USING btree ("org_id","notification_id","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_source_event_idx" ON "notifications" USING btree ("org_id","source_event_id","user_id",coalesce("community_id", '')) WHERE "notifications"."source_event_id" is not null;--> statement-breakpoint
CREATE INDEX "notifications_list_idx" ON "notifications" USING btree ("org_id","user_id","created_at" desc,"id" desc) WHERE "notifications"."in_app";--> statement-breakpoint
CREATE INDEX "notifications_community_idx" ON "notifications" USING btree ("org_id","user_id","community_id");--> statement-breakpoint
CREATE INDEX "notifications_category_idx" ON "notifications" USING btree ("org_id","user_id","category");--> statement-breakpoint
CREATE INDEX "notifications_reasons_idx" ON "notifications" USING gin ("reasons");