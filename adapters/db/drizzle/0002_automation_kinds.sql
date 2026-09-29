DROP INDEX "automations_org_trigger_idx";--> statement-breakpoint
ALTER TABLE "automations" ADD COLUMN "kind" text DEFAULT 'workflow' NOT NULL;--> statement-breakpoint
ALTER TABLE "automations" ADD COLUMN "triggers" text[];--> statement-breakpoint
UPDATE "automations" SET "triggers" = ARRAY["trigger"];--> statement-breakpoint
ALTER TABLE "automations" ALTER COLUMN "triggers" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "automations" DROP COLUMN "trigger";--> statement-breakpoint
CREATE INDEX "automations_triggers_idx" ON "automations" USING gin ("triggers");