CREATE TABLE "ba_apikey" (
	"id" text PRIMARY KEY NOT NULL,
	"config_id" text DEFAULT 'default' NOT NULL,
	"name" text,
	"start" text,
	"reference_id" text NOT NULL,
	"prefix" text,
	"key" text NOT NULL,
	"refill_interval" integer,
	"refill_amount" integer,
	"last_refill_at" timestamp with time zone,
	"enabled" boolean DEFAULT true,
	"rate_limit_enabled" boolean DEFAULT true,
	"rate_limit_time_window" integer DEFAULT 86400000,
	"rate_limit_max" integer DEFAULT 10,
	"request_count" integer DEFAULT 0,
	"remaining" integer,
	"last_request" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"permissions" text,
	"metadata" text
);
--> statement-breakpoint
CREATE TABLE "ba_oauth_client_assertion" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ba_oauth_client_resource" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"resource_id" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ba_oauth_resource" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"name" text NOT NULL,
	"access_token_ttl" integer,
	"refresh_token_ttl" integer,
	"signing_algorithm" text,
	"signing_key_id" text,
	"allowed_scopes" text[],
	"custom_claims" jsonb,
	"dpop_bound_access_tokens_required" boolean DEFAULT false,
	"disabled" boolean DEFAULT false,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"policy_version" integer DEFAULT 1,
	"metadata" jsonb,
	CONSTRAINT "ba_oauth_resource_identifier_unique" UNIQUE("identifier")
);
--> statement-breakpoint
ALTER TABLE "ba_oauth_access_token" DROP CONSTRAINT "ba_oauth_access_token_client_id_ba_oauth_client_client_id_fk";
--> statement-breakpoint
ALTER TABLE "ba_oauth_access_token" DROP CONSTRAINT "ba_oauth_access_token_refresh_id_ba_oauth_refresh_token_id_fk";
--> statement-breakpoint
ALTER TABLE "ba_oauth_consent" DROP CONSTRAINT "ba_oauth_consent_client_id_ba_oauth_client_client_id_fk";
--> statement-breakpoint
ALTER TABLE "ba_oauth_refresh_token" DROP CONSTRAINT "ba_oauth_refresh_token_client_id_ba_oauth_client_client_id_fk";
--> statement-breakpoint
ALTER TABLE "ba_oauth_access_token" ALTER COLUMN "token" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ba_oauth_access_token" ALTER COLUMN "expires_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ba_oauth_access_token" ALTER COLUMN "created_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ba_oauth_client" ALTER COLUMN "metadata" SET DATA TYPE jsonb USING "metadata"::jsonb;--> statement-breakpoint
ALTER TABLE "ba_oauth_consent" ALTER COLUMN "created_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ba_oauth_consent" ALTER COLUMN "updated_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ba_oauth_refresh_token" ALTER COLUMN "expires_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ba_oauth_refresh_token" ALTER COLUMN "created_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ba_jwks" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ba_jwks" ADD COLUMN "alg" text;--> statement-breakpoint
ALTER TABLE "ba_jwks" ADD COLUMN "crv" text;--> statement-breakpoint
ALTER TABLE "ba_oauth_access_token" ADD COLUMN "authorization_code_id" text;--> statement-breakpoint
ALTER TABLE "ba_oauth_access_token" ADD COLUMN "resources" text[];--> statement-breakpoint
ALTER TABLE "ba_oauth_access_token" ADD COLUMN "requested_user_info_claims" text[];--> statement-breakpoint
ALTER TABLE "ba_oauth_access_token" ADD COLUMN "revoked" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ba_oauth_access_token" ADD COLUMN "confirmation" jsonb;--> statement-breakpoint
ALTER TABLE "ba_oauth_client" ADD COLUMN "client_discovery_id" text;--> statement-breakpoint
ALTER TABLE "ba_oauth_client" ADD COLUMN "client_credentials_scopes" text[] DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "ba_oauth_client" ADD COLUMN "backchannel_logout_uri" text;--> statement-breakpoint
ALTER TABLE "ba_oauth_client" ADD COLUMN "backchannel_logout_session_required" boolean;--> statement-breakpoint
ALTER TABLE "ba_oauth_client" ADD COLUMN "application_type" text;--> statement-breakpoint
ALTER TABLE "ba_oauth_client" ADD COLUMN "jwks" text;--> statement-breakpoint
ALTER TABLE "ba_oauth_client" ADD COLUMN "jwks_uri" text;--> statement-breakpoint
ALTER TABLE "ba_oauth_client" ADD COLUMN "dpop_bound_access_tokens" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "ba_oauth_consent" ADD COLUMN "resources" text[];--> statement-breakpoint
ALTER TABLE "ba_oauth_consent" ADD COLUMN "requested_user_info_claims" text[];--> statement-breakpoint
ALTER TABLE "ba_oauth_refresh_token" ADD COLUMN "authorization_code_id" text;--> statement-breakpoint
ALTER TABLE "ba_oauth_refresh_token" ADD COLUMN "resources" text[];--> statement-breakpoint
ALTER TABLE "ba_oauth_refresh_token" ADD COLUMN "requested_user_info_claims" text[];--> statement-breakpoint
ALTER TABLE "ba_oauth_refresh_token" ADD COLUMN "rotated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ba_oauth_refresh_token" ADD COLUMN "rotation_replay_response" text;--> statement-breakpoint
ALTER TABLE "ba_oauth_refresh_token" ADD COLUMN "rotation_replay_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ba_oauth_refresh_token" ADD COLUMN "confirmation" jsonb;--> statement-breakpoint
ALTER TABLE "ba_oauth_client_resource" ADD CONSTRAINT "ba_oauth_client_resource_client_id_ba_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."ba_oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ba_oauth_client_resource" ADD CONSTRAINT "ba_oauth_client_resource_resource_id_ba_oauth_resource_identifier_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."ba_oauth_resource"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ba_apikey_config_id_idx" ON "ba_apikey" USING btree ("config_id");--> statement-breakpoint
CREATE INDEX "ba_apikey_reference_id_idx" ON "ba_apikey" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "ba_apikey_key_idx" ON "ba_apikey" USING btree ("key");--> statement-breakpoint
CREATE INDEX "ba_oauth_client_resource_client_id_idx" ON "ba_oauth_client_resource" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "ba_oauth_client_resource_resource_id_idx" ON "ba_oauth_client_resource" USING btree ("resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ba_oauth_client_resource_client_resource_uidx" ON "ba_oauth_client_resource" USING btree ("client_id","resource_id");--> statement-breakpoint
ALTER TABLE "ba_oauth_access_token" ADD CONSTRAINT "ba_oauth_access_token_client_id_ba_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."ba_oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ba_oauth_access_token" ADD CONSTRAINT "ba_oauth_access_token_refresh_id_ba_oauth_refresh_token_id_fk" FOREIGN KEY ("refresh_id") REFERENCES "public"."ba_oauth_refresh_token"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ba_oauth_consent" ADD CONSTRAINT "ba_oauth_consent_client_id_ba_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."ba_oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ba_oauth_refresh_token" ADD CONSTRAINT "ba_oauth_refresh_token_client_id_ba_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."ba_oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ba_oauth_access_token_authorization_code_id_idx" ON "ba_oauth_access_token" USING btree ("authorization_code_id");--> statement-breakpoint
CREATE INDEX "ba_oauth_refresh_token_authorization_code_id_idx" ON "ba_oauth_refresh_token" USING btree ("authorization_code_id");--> statement-breakpoint
ALTER TABLE "ba_oauth_client" DROP COLUMN "public";--> statement-breakpoint
ALTER TABLE "ba_oauth_client" DROP COLUMN "type";