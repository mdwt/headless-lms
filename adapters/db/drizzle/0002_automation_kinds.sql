DROP INDEX "automations_org_trigger_idx";--> statement-breakpoint
DROP INDEX "automation_runs_org_automation_event_idx";--> statement-breakpoint
ALTER TABLE "automation_runs" ADD COLUMN "rerun_of" text;--> statement-breakpoint
ALTER TABLE "automations" ADD COLUMN "kind" text DEFAULT 'workflow' NOT NULL;--> statement-breakpoint
ALTER TABLE "automations" ADD COLUMN "triggers" text[];--> statement-breakpoint
UPDATE "automations" SET "triggers" = ARRAY["trigger"];--> statement-breakpoint
ALTER TABLE "automations" ALTER COLUMN "triggers" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "automations" DROP COLUMN "trigger";--> statement-breakpoint
CREATE INDEX "automations_triggers_idx" ON "automations" USING gin ("triggers");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_runs_org_automation_event_idx" ON "automation_runs" USING btree ("org_id","automation_id","event_id") WHERE "automation_runs"."rerun_of" is null;