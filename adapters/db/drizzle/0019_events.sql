CREATE TABLE "event_assets" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"event_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"seq" integer DEFAULT 0 NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_assets_org_id_id_pk" PRIMARY KEY("org_id","id"),
	CONSTRAINT "event_assets_org_id_event_id_asset_id_unique" UNIQUE("org_id","event_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"type" text GENERATED ALWAYS AS ('event') STORED NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"thumbnail_asset_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"time_zone" text NOT NULL,
	"location" jsonb DEFAULT '{"venue":null,"online":null}'::jsonb NOT NULL,
	"recording" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_org_id_id_pk" PRIMARY KEY("org_id","id"),
	CONSTRAINT "events_times_check" CHECK ("events"."ends_at" > "events"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "content_items" DROP CONSTRAINT "content_items_type_check";--> statement-breakpoint
ALTER TABLE "event_assets" ADD CONSTRAINT "event_assets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_assets" ADD CONSTRAINT "event_assets_org_id_event_id_events_org_id_id_fk" FOREIGN KEY ("org_id","event_id") REFERENCES "public"."events"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_assets" ADD CONSTRAINT "event_assets_org_id_asset_id_assets_org_id_id_fk" FOREIGN KEY ("org_id","asset_id") REFERENCES "public"."assets"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_org_id_id_type_content_items_org_id_id_type_fk" FOREIGN KEY ("org_id","id","type") REFERENCES "public"."content_items"("org_id","id","type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_org_id_thumbnail_asset_id_assets_org_id_id_fk" FOREIGN KEY ("org_id","thumbnail_asset_id") REFERENCES "public"."assets"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_assets_asset_idx" ON "event_assets" USING btree ("org_id","asset_id");--> statement-breakpoint
CREATE INDEX "events_thumbnail_idx" ON "events" USING btree ("org_id","thumbnail_asset_id");--> statement-breakpoint
CREATE INDEX "events_status_starts_idx" ON "events" USING btree ("org_id","status","starts_at");--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_type_check" CHECK ("content_items"."type" in ('course', 'download', 'community', 'event'));--> statement-breakpoint
ALTER TABLE "notifications" RENAME COLUMN "actor_org_user_id" TO "actor_id";