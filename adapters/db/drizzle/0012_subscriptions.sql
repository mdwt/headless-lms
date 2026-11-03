CREATE TABLE "subscriptions" (
	"org_id" text NOT NULL,
	"org_user_id" text NOT NULL,
	"item_type" text NOT NULL,
	"item_id" text NOT NULL,
	"state" text NOT NULL,
	"muted_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_org_id_org_user_id_item_type_item_id_pk" PRIMARY KEY("org_id","org_user_id","item_type","item_id")
);
--> statement-breakpoint
DROP TABLE "post_follows" CASCADE;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_org_id_org_user_id_org_users_org_id_id_fk" FOREIGN KEY ("org_id","org_user_id") REFERENCES "public"."org_users"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscriptions_item_idx" ON "subscriptions" USING btree ("org_id","item_type","item_id","state");--> statement-breakpoint
ALTER TABLE "chat_users" DROP COLUMN "muted";--> statement-breakpoint
ALTER TABLE "chat_users" DROP COLUMN "muted_until";