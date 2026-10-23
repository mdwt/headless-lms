CREATE TABLE "entitlement_ending_soon_notices" (
	"org_id" text NOT NULL,
	"entitlement_id" text NOT NULL,
	"community_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"notified_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entitlement_ending_soon_notices_org_id_entitlement_id_community_id_expires_at_pk" PRIMARY KEY("org_id","entitlement_id","community_id","expires_at")
);
--> statement-breakpoint
CREATE TABLE "entitlement_expiry_notices" (
	"org_id" text NOT NULL,
	"entitlement_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"notified_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entitlement_expiry_notices_org_id_entitlement_id_expires_at_pk" PRIMARY KEY("org_id","entitlement_id","expires_at")
);
--> statement-breakpoint
ALTER TABLE "entitlement_ending_soon_notices" ADD CONSTRAINT "entitlement_ending_soon_notices_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_ending_soon_notices" ADD CONSTRAINT "entitlement_ending_soon_notices_org_id_entitlement_id_entitlements_org_id_id_fk" FOREIGN KEY ("org_id","entitlement_id") REFERENCES "public"."entitlements"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_ending_soon_notices" ADD CONSTRAINT "entitlement_ending_soon_notices_org_id_community_id_communities_org_id_id_fk" FOREIGN KEY ("org_id","community_id") REFERENCES "public"."communities"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_expiry_notices" ADD CONSTRAINT "entitlement_expiry_notices_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_expiry_notices" ADD CONSTRAINT "entitlement_expiry_notices_org_id_entitlement_id_entitlements_org_id_id_fk" FOREIGN KEY ("org_id","entitlement_id") REFERENCES "public"."entitlements"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_bookmarks_user_idx" ON "post_bookmarks" USING btree ("org_id","org_user_id","created_at");--> statement-breakpoint
DROP TABLE "entitlement_notices" CASCADE;--> statement-breakpoint
ALTER TABLE "space_topics" DROP CONSTRAINT "space_topics_org_id_space_id_name_unique";--> statement-breakpoint
ALTER TABLE "space_topics" ADD CONSTRAINT "space_topics_org_id_space_id_name_unique" UNIQUE("org_id","space_id","name") DEFERRABLE INITIALLY DEFERRED;
