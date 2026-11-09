ALTER TABLE "spaces" ADD COLUMN "cover_asset_id" text;--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "background_asset_id" text;--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "icon_asset_id" text;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_org_id_cover_asset_id_assets_org_id_id_fk" FOREIGN KEY ("org_id","cover_asset_id") REFERENCES "public"."assets"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_org_id_background_asset_id_assets_org_id_id_fk" FOREIGN KEY ("org_id","background_asset_id") REFERENCES "public"."assets"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_org_id_icon_asset_id_assets_org_id_id_fk" FOREIGN KEY ("org_id","icon_asset_id") REFERENCES "public"."assets"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "spaces_cover_idx" ON "spaces" USING btree ("org_id","cover_asset_id");--> statement-breakpoint
CREATE INDEX "spaces_background_idx" ON "spaces" USING btree ("org_id","background_asset_id");--> statement-breakpoint
CREATE INDEX "spaces_icon_idx" ON "spaces" USING btree ("org_id","icon_asset_id");