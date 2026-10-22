ALTER TABLE "assets" ADD COLUMN "source" text DEFAULT 'library' NOT NULL;--> statement-breakpoint
UPDATE "assets" SET "source" = 'member' WHERE "kind" = 'image';--> statement-breakpoint
UPDATE "assets" SET "kind" = CASE
  WHEN lower(btrim("content_type")) LIKE 'image/%' THEN 'image'
  WHEN lower(btrim("content_type")) LIKE 'video/%' THEN 'video'
  WHEN lower(btrim("content_type")) LIKE 'audio/%' THEN 'audio'
  ELSE 'document'
END;--> statement-breakpoint
UPDATE "assets" a SET "uploaded_by" = ou."id" FROM "org_users" ou WHERE ou."org_id" = a."org_id" AND ou."user_id" = a."uploaded_by";
