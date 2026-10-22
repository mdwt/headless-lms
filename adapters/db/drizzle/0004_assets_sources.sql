ALTER TABLE "assets" ADD COLUMN "source" text DEFAULT 'library' NOT NULL;--> statement-breakpoint
UPDATE "assets" SET "source" = 'member' WHERE "kind" = 'image';--> statement-breakpoint
UPDATE "assets" SET "kind" = 'image' WHERE "kind" = 'content';--> statement-breakpoint
UPDATE "assets" SET "kind" = 'audio' WHERE "kind" = 'download' AND lower("content_type") LIKE 'audio/%';--> statement-breakpoint
UPDATE "assets" SET "kind" = 'document' WHERE "kind" = 'download';--> statement-breakpoint
UPDATE "assets" a SET "uploaded_by" = ou."id" FROM "org_users" ou WHERE ou."org_id" = a."org_id" AND ou."user_id" = a."uploaded_by";
