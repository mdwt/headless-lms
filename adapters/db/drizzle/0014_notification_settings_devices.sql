CREATE TABLE "devices" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"token" text NOT NULL,
	"p256dh" text,
	"auth" text,
	"app_id" text,
	"environment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devices_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"community_id" text,
	"space_id" text,
	"category" text NOT NULL,
	"channel" text NOT NULL,
	"enabled" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_settings_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_org_id_user_id_org_users_org_id_user_id_fk" FOREIGN KEY ("org_id","user_id") REFERENCES "public"."org_users"("org_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_org_id_user_id_org_users_org_id_user_id_fk" FOREIGN KEY ("org_id","user_id") REFERENCES "public"."org_users"("org_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_org_id_community_id_communities_org_id_id_fk" FOREIGN KEY ("org_id","community_id") REFERENCES "public"."communities"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_org_id_space_id_spaces_org_id_id_fk" FOREIGN KEY ("org_id","space_id") REFERENCES "public"."spaces"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "devices_token_idx" ON "devices" USING btree ("org_id","provider","token");--> statement-breakpoint
CREATE INDEX "devices_user_idx" ON "devices" USING btree ("org_id","user_id","last_seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_settings_setting_idx" ON "notification_settings" USING btree ("org_id","user_id",coalesce("community_id", ''),coalesce("space_id", ''),"category","channel");--> statement-breakpoint
CREATE INDEX "notification_settings_switched_on_idx" ON "notification_settings" USING btree ("org_id",coalesce("community_id", ''),"category",coalesce("space_id", '')) WHERE "notification_settings"."enabled";