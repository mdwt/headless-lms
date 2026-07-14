CREATE TABLE "connections" (
	"org_id" text NOT NULL,
	"id" text NOT NULL,
	"service" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"credential_ref" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "connections_org_id_id_pk" PRIMARY KEY("org_id","id"),
	CONSTRAINT "connections_org_id_service_unique" UNIQUE("org_id","service")
);
--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_org_id_credential_ref_credentials_org_id_id_fk" FOREIGN KEY ("org_id","credential_ref") REFERENCES "public"."credentials"("org_id","id") ON DELETE no action ON UPDATE no action;