CREATE TABLE "apps" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"domain" text NOT NULL,
	"courses" boolean NOT NULL,
	"community" boolean NOT NULL,
	CONSTRAINT "apps_org_id_id_pk" PRIMARY KEY("org_id","id"),
	CONSTRAINT "apps_org_slug_uq" UNIQUE("org_id","slug"),
	CONSTRAINT "apps_domain_uq" UNIQUE("domain"),
	CONSTRAINT "apps_serves_ck" CHECK ("apps"."courses" or "apps"."community")
);
--> statement-breakpoint
DROP INDEX "settings_courses_host_idx";--> statement-breakpoint
DROP INDEX "settings_community_host_idx";--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "apps_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "apps_courses_uq" ON "apps" USING btree ("org_id") WHERE "apps"."courses";--> statement-breakpoint
CREATE UNIQUE INDEX "apps_community_uq" ON "apps" USING btree ("org_id") WHERE "apps"."community";