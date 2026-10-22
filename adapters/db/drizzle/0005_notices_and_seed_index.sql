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
INSERT INTO "entitlement_notices" ("org_id", "entitlement_id", "kind", "community_id", "notified_at")
SELECT o."org_id", o."payload"->'data'->>'id', 'expired', '', o."created_at"
FROM "event_outbox" o
WHERE o."type" = 'entitlement.expired'
  AND EXISTS (SELECT 1 FROM "entitlements" e WHERE e."org_id" = o."org_id" AND e."id" = o."payload"->'data'->>'id')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "entitlement_notices" ("org_id", "entitlement_id", "kind", "community_id", "notified_at")
SELECT o."org_id", o."payload"->'data'->>'id', 'ending_soon', coalesce(o."payload"->'data'->>'communityId', o."payload"->'data'->>'contentId', ''), o."created_at"
FROM "event_outbox" o
WHERE o."type" = 'entitlement.ending_soon'
  AND EXISTS (SELECT 1 FROM "entitlements" e WHERE e."org_id" = o."org_id" AND e."id" = o."payload"->'data'->>'id')
ON CONFLICT DO NOTHING;--> statement-breakpoint
DELETE FROM "automations" a
USING "automations" b
WHERE a."source" = 'system'
  AND b."source" = 'system'
  AND a."org_id" = b."org_id"
  AND a."name" = b."name"
  AND coalesce(a."filter"->>'communityId', '') = coalesce(b."filter"->>'communityId', '')
  AND a."created_at" > b."created_at";--> statement-breakpoint
DELETE FROM "automations"
WHERE "source" = 'system'
  AND "name" IN ('Welcome to the community', 'Membership ended')
  AND "filter" IS NULL
  AND "actions"::text LIKE '%"communityId"%';--> statement-breakpoint
CREATE UNIQUE INDEX "automations_system_seed_idx" ON "automations" USING btree ("org_id","name",coalesce("filter"->>'communityId', '')) WHERE "automations"."source" = 'system';--> statement-breakpoint
INSERT INTO "automations" ("org_id", "id", "name", "kind", "description", "triggers", "actions", "enabled", "filter", "source")
SELECT
  o."id",
  'atm_' || replace(gen_random_uuid()::text, '-', ''),
  s.name,
  'workflow',
  s.description,
  s.triggers,
  s.actions,
  true,
  NULL,
  'system'
FROM "organizations" o
CROSS JOIN (
  VALUES
    (
      'Access granted',
      'Email the person when they are granted a content item.',
      ARRAY['entitlement.created']::text[],
      '[{"type":"sendEmail","input":{"template":"accessGranted"}}]'::jsonb
    ),
    (
      'Access revoked',
      'Email the person when a content grant is deleted.',
      ARRAY['entitlement.deleted']::text[],
      '[{"type":"sendEmail","input":{"template":"accessRevoked"}}]'::jsonb
    ),
    (
      'You are now a moderator',
      'Email the person when they are given the moderator role.',
      ARRAY['organization.user.updated']::text[],
      '[{"type":"sendEmail","input":{"template":"youAreNowAModerator"}}]'::jsonb
    ),
    (
      'Publish due posts',
      'Submit scheduled posts whose time has passed.',
      ARRAY['schedule:* * * * *']::text[],
      '[{"type":"publishDuePosts","input":{}}]'::jsonb
    ),
    (
      'Expire due grants',
      'Expire grants whose time has passed and remind those ending within a week.',
      ARRAY['schedule:0 * * * *']::text[],
      '[{"type":"expireDueGrants","input":{}}]'::jsonb
    ),
    (
      'Digest',
      'Open the daily digest for every community.',
      ARRAY['schedule:0 7 * * *']::text[],
      '[{"type":"sendDigest","input":{}}]'::jsonb
    ),
    (
      'Remove unattached uploads',
      'Remove member uploads older than an hour that nothing references.',
      ARRAY['schedule:0 * * * *']::text[],
      '[{"type":"removeUnattachedUploads","input":{}}]'::jsonb
    ),
    (
      'Welcome to the community',
      'Email a person when a grant opens a community.',
      ARRAY['entitlement.created']::text[],
      '[{"type":"sendEmail","input":{"template":"welcomeToCommunity"}}]'::jsonb
    ),
    (
      'Membership ended',
      'Email a person when a grant that opened a community ends.',
      ARRAY['entitlement.expired','entitlement.deleted']::text[],
      '[{"type":"sendEmail","input":{"template":"membershipEnded"}}]'::jsonb
    )
) AS s(name, description, triggers, actions)
ON CONFLICT ("org_id", "name", (coalesce("filter"->>'communityId', ''))) WHERE "source" = 'system' DO NOTHING;
