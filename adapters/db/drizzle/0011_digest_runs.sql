CREATE TABLE "digest_runs" (
	"org_id" text NOT NULL,
	"community_id" text NOT NULL,
	"last_due_at" timestamp with time zone NOT NULL,
	CONSTRAINT "digest_runs_org_id_community_id_pk" PRIMARY KEY("org_id","community_id")
);
--> statement-breakpoint
ALTER TABLE "digest_runs" ADD CONSTRAINT "digest_runs_org_id_community_id_communities_org_id_id_fk" FOREIGN KEY ("org_id","community_id") REFERENCES "public"."communities"("org_id","id") ON DELETE cascade ON UPDATE no action;