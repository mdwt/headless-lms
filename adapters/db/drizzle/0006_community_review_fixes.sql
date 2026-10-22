CREATE TABLE "entitlement_ending_soon_notices" (
	"org_id" text NOT NULL,
	"entitlement_id" text NOT NULL,
	"community_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"notified_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entitlement_ending_soon_notices_org_id_entitlement_id_community_id_expires_at_pk" PRIMARY KEY("org_id","entitlement_id","community_id","expires_at")
);
--> statement-breakpoint
CREATE TABLE "entitlement_expiry_notices" (
	"org_id" text NOT NULL,
	"entitlement_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"notified_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entitlement_expiry_notices_org_id_entitlement_id_expires_at_pk" PRIMARY KEY("org_id","entitlement_id","expires_at")
);
--> statement-breakpoint
ALTER TABLE "entitlement_ending_soon_notices" ADD CONSTRAINT "entitlement_ending_soon_notices_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_ending_soon_notices" ADD CONSTRAINT "entitlement_ending_soon_notices_org_id_entitlement_id_entitlements_org_id_id_fk" FOREIGN KEY ("org_id","entitlement_id") REFERENCES "public"."entitlements"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_ending_soon_notices" ADD CONSTRAINT "entitlement_ending_soon_notices_org_id_community_id_communities_org_id_id_fk" FOREIGN KEY ("org_id","community_id") REFERENCES "public"."communities"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_expiry_notices" ADD CONSTRAINT "entitlement_expiry_notices_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_expiry_notices" ADD CONSTRAINT "entitlement_expiry_notices_org_id_entitlement_id_entitlements_org_id_id_fk" FOREIGN KEY ("org_id","entitlement_id") REFERENCES "public"."entitlements"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_bookmarks_user_idx" ON "post_bookmarks" USING btree ("org_id","org_user_id","created_at");--> statement-breakpoint
INSERT INTO "entitlement_ending_soon_notices" ("org_id", "entitlement_id", "community_id", "expires_at", "notified_at")
SELECT n."org_id", n."entitlement_id", n."community_id", e."expires_at", n."notified_at"
FROM "entitlement_notices" n
JOIN "entitlements" e ON e."org_id" = n."org_id" AND e."id" = n."entitlement_id"
JOIN "communities" c ON c."org_id" = n."org_id" AND c."id" = n."community_id"
WHERE n."kind" = 'ending_soon'
  AND e."expires_at" IS NOT NULL
  AND e."expires_at" <= n."notified_at" + interval '7 days'
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "entitlement_expiry_notices" ("org_id", "entitlement_id", "expires_at", "notified_at")
SELECT e."org_id", e."id", e."expires_at", now()
FROM "entitlements" e
WHERE e."expires_at" IS NOT NULL AND e."expires_at" <= now()
ON CONFLICT DO NOTHING;--> statement-breakpoint
DROP TABLE "entitlement_notices" CASCADE;--> statement-breakpoint
ALTER TABLE "comment_flags" DROP CONSTRAINT IF EXISTS "comment_flags_resolved_check";--> statement-breakpoint
UPDATE "comment_flags" SET "resolved_by" = NULL WHERE "resolved_by" = 'unknown';--> statement-breakpoint
ALTER TABLE "comment_flags" ADD CONSTRAINT "comment_flags_resolved_check" CHECK (("comment_flags"."resolved_at" is null) = ("comment_flags"."resolution" is null) and ("comment_flags"."resolved_by" is null or "comment_flags"."resolved_at" is not null));--> statement-breakpoint
UPDATE "assets" SET "kind" = CASE
  WHEN lower(btrim("content_type")) LIKE 'image/%' THEN 'image'
  WHEN lower(btrim("content_type")) LIKE 'video/%' THEN 'video'
  WHEN lower(btrim("content_type")) LIKE 'audio/%' THEN 'audio'
  ELSE 'document'
END
WHERE "kind" IS DISTINCT FROM CASE
  WHEN lower(btrim("content_type")) LIKE 'image/%' THEN 'image'
  WHEN lower(btrim("content_type")) LIKE 'video/%' THEN 'video'
  WHEN lower(btrim("content_type")) LIKE 'audio/%' THEN 'audio'
  ELSE 'document'
END;--> statement-breakpoint
ALTER TABLE "space_topics" DROP CONSTRAINT "space_topics_org_id_space_id_name_unique";--> statement-breakpoint
ALTER TABLE "space_topics" ADD CONSTRAINT "space_topics_org_id_space_id_name_unique" UNIQUE("org_id","space_id","name") DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
WITH RECURSIVE "nodes" AS (
  SELECT a."org_id", a."id" AS "activity_id", n."node", ARRAY[n."ord"] AS "path"
  FROM "activities" a
  CROSS JOIN LATERAL jsonb_array_elements(a."settings"->'content'->'config') WITH ORDINALITY AS n("node", "ord")
  WHERE a."settings"->'content'->>'type' = 'plate'
    AND jsonb_typeof(a."settings"->'content'->'config') = 'array'
  UNION ALL
  SELECT p."org_id", p."activity_id", c."node", p."path" || c."ord"
  FROM "nodes" p
  CROSS JOIN LATERAL jsonb_array_elements(p."node"->'children') WITH ORDINALITY AS c("node", "ord")
  WHERE jsonb_typeof(p."node"->'children') = 'array'
),
"found" AS (
  SELECT "org_id", "activity_id", "node"->>'assetId' AS "asset_id", min("path") AS "first_path"
  FROM "nodes"
  WHERE jsonb_typeof("node"->'assetId') = 'string'
  GROUP BY "org_id", "activity_id", "node"->>'assetId'
),
"missing" AS (
  SELECT f."org_id", f."activity_id", f."asset_id", f."first_path"
  FROM "found" f
  JOIN "assets" s ON s."org_id" = f."org_id" AND s."id" = f."asset_id"
  WHERE s."source" = 'library'
    AND s."status" = 'ready'
    AND NOT EXISTS (
      SELECT 1 FROM "activity_assets" x
      WHERE x."org_id" = f."org_id" AND x."activity_id" = f."activity_id" AND x."asset_id" = f."asset_id"
    )
)
INSERT INTO "activity_assets" ("org_id", "id", "activity_id", "asset_id", "seq")
SELECT
  m."org_id",
  'aca_' || replace(gen_random_uuid()::text, '-', ''),
  m."activity_id",
  m."asset_id",
  coalesce(
    (SELECT max(x."seq") + 1 FROM "activity_assets" x WHERE x."org_id" = m."org_id" AND x."activity_id" = m."activity_id"),
    0
  ) + row_number() OVER (PARTITION BY m."org_id", m."activity_id" ORDER BY m."first_path") - 1
FROM "missing" m
ON CONFLICT DO NOTHING;
