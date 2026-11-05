CREATE TABLE "org_roles" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"key" text NOT NULL,
	"name" text,
	"description" text,
	"base" text NOT NULL,
	"levels" text[],
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"team" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_roles_org_id_id_pk" PRIMARY KEY("org_id","id"),
	CONSTRAINT "org_roles_key_uq" UNIQUE("org_id","key")
);
--> statement-breakpoint
CREATE TABLE "role_assignments" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"org_user_id" text NOT NULL,
	"role_key" text NOT NULL,
	"content_id" text,
	"content_type" text,
	"assigned_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_assignments_org_id_id_pk" PRIMARY KEY("org_id","id"),
	CONSTRAINT "role_assignments_scope_uq" UNIQUE NULLS NOT DISTINCT("org_id","org_user_id","content_id")
);
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "content_id" text;--> statement-breakpoint
ALTER TABLE "org_roles" ADD CONSTRAINT "org_roles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_org_user_fk" FOREIGN KEY ("org_id","org_user_id") REFERENCES "public"."org_users"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_content_fk" FOREIGN KEY ("org_id","content_id","content_type") REFERENCES "public"."content_items"("org_id","id","type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "org_roles_name_uq" ON "org_roles" USING btree ("org_id",lower("name")) WHERE "org_roles"."name" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "role_assignments_owner_uq" ON "role_assignments" USING btree ("org_id") WHERE "role_assignments"."role_key" = 'owner';--> statement-breakpoint
CREATE INDEX "role_assignments_content_idx" ON "role_assignments" USING btree ("org_id","content_id");