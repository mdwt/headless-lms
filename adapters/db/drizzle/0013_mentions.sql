CREATE TABLE "mentions" (
	"org_id" text NOT NULL,
	"item_type" text NOT NULL,
	"item_id" text NOT NULL,
	"org_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentions_org_id_item_type_item_id_org_user_id_pk" PRIMARY KEY("org_id","item_type","item_id","org_user_id")
);
--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_org_id_org_user_id_org_users_org_id_id_fk" FOREIGN KEY ("org_id","org_user_id") REFERENCES "public"."org_users"("org_id","id") ON DELETE cascade ON UPDATE no action;