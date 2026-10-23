CREATE TABLE "entitlement_notices" (
	"org_id" text NOT NULL,
	"entitlement_id" text NOT NULL,
	"kind" text NOT NULL,
	"community_id" text DEFAULT '' NOT NULL,
	"notified_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entitlement_notices_org_id_entitlement_id_kind_community_id_pk" PRIMARY KEY("org_id","entitlement_id","kind","community_id")
);
--> statement-breakpoint
ALTER TABLE "entitlement_notices" ADD CONSTRAINT "entitlement_notices_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_notices" ADD CONSTRAINT "entitlement_notices_org_id_entitlement_id_entitlements_org_id_id_fk" FOREIGN KEY ("org_id","entitlement_id") REFERENCES "public"."entitlements"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "automations_system_seed_idx" ON "automations" USING btree ("org_id","name",coalesce("filter"->>'communityId', '')) WHERE "automations"."source" = 'system';
