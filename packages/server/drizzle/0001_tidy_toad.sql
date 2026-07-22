CREATE TABLE "invite" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"max_uses" integer NOT NULL,
	"infinity_max_uses" boolean NOT NULL,
	"created_by_user_id" text,
	"redirect_to_after_upgrade" text,
	"share_inviter_name" boolean NOT NULL,
	"email" text,
	"emails" text,
	"role" text NOT NULL,
	"new_account" boolean,
	"status" text NOT NULL,
	CONSTRAINT "invite_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "invite_use" (
	"id" text PRIMARY KEY NOT NULL,
	"invite_id" text NOT NULL,
	"used_at" timestamp NOT NULL,
	"used_by_user_id" text
);
--> statement-breakpoint
ALTER TABLE "students" ALTER COLUMN "external_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "invite_id" text;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_use" ADD CONSTRAINT "invite_use_invite_id_invite_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."invite"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_use" ADD CONSTRAINT "invite_use_used_by_user_id_user_id_fk" FOREIGN KEY ("used_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;