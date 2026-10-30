ALTER TABLE "chats" DROP CONSTRAINT "chats_locked_check";--> statement-breakpoint
ALTER TABLE "comments" DROP CONSTRAINT "comments_removed_by_check";--> statement-breakpoint
ALTER TABLE "posts" DROP CONSTRAINT "posts_removed_by_check";--> statement-breakpoint
ALTER TABLE "chats" DROP CONSTRAINT "chats_org_id_created_by_org_users_org_id_id_fk";
--> statement-breakpoint
ALTER TABLE "chats" DROP CONSTRAINT "chats_org_id_locked_by_org_users_org_id_id_fk";
--> statement-breakpoint
ALTER TABLE "comment_flags" DROP CONSTRAINT "comment_flags_org_id_org_user_id_org_users_org_id_id_fk";
--> statement-breakpoint
ALTER TABLE "comment_reactions" DROP CONSTRAINT "comment_reactions_org_id_org_user_id_org_users_org_id_id_fk";
--> statement-breakpoint
ALTER TABLE "comments" DROP CONSTRAINT "comments_org_id_removed_by_org_users_org_id_id_fk";
--> statement-breakpoint
ALTER TABLE "message_flags" DROP CONSTRAINT "message_flags_org_id_org_user_id_org_users_org_id_id_fk";
--> statement-breakpoint
ALTER TABLE "post_flags" DROP CONSTRAINT "post_flags_org_id_org_user_id_org_users_org_id_id_fk";
--> statement-breakpoint
ALTER TABLE "posts" DROP CONSTRAINT "posts_org_id_removed_by_org_users_org_id_id_fk";
--> statement-breakpoint
DROP INDEX "posts_author_idx";--> statement-breakpoint
ALTER TABLE "chats" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_org_id_created_by_org_users_org_id_id_fk" FOREIGN KEY ("org_id","created_by") REFERENCES "public"."org_users"("org_id","id") ON DELETE set null ("created_by") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_org_id_locked_by_org_users_org_id_id_fk" FOREIGN KEY ("org_id","locked_by") REFERENCES "public"."org_users"("org_id","id") ON DELETE set null ("locked_by") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_flags" ADD CONSTRAINT "comment_flags_org_id_org_user_id_org_users_org_id_id_fk" FOREIGN KEY ("org_id","org_user_id") REFERENCES "public"."org_users"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_reactions" ADD CONSTRAINT "comment_reactions_org_id_org_user_id_org_users_org_id_id_fk" FOREIGN KEY ("org_id","org_user_id") REFERENCES "public"."org_users"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_org_id_removed_by_org_users_org_id_id_fk" FOREIGN KEY ("org_id","removed_by") REFERENCES "public"."org_users"("org_id","id") ON DELETE set null ("removed_by") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_flags" ADD CONSTRAINT "message_flags_org_id_org_user_id_org_users_org_id_id_fk" FOREIGN KEY ("org_id","org_user_id") REFERENCES "public"."org_users"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_flags" ADD CONSTRAINT "post_flags_org_id_org_user_id_org_users_org_id_id_fk" FOREIGN KEY ("org_id","org_user_id") REFERENCES "public"."org_users"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_org_id_removed_by_org_users_org_id_id_fk" FOREIGN KEY ("org_id","removed_by") REFERENCES "public"."org_users"("org_id","id") ON DELETE set null ("removed_by") ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_assets_asset_idx" ON "activity_assets" USING btree ("org_id","asset_id");--> statement-breakpoint
CREATE INDEX "bundle_items_content_idx" ON "bundle_items" USING btree ("org_id","content_id");--> statement-breakpoint
CREATE INDEX "communities_thumbnail_idx" ON "communities" USING btree ("org_id","thumbnail_asset_id");--> statement-breakpoint
CREATE INDEX "courses_thumbnail_idx" ON "courses" USING btree ("org_id","thumbnail_asset_id");--> statement-breakpoint
CREATE INDEX "download_assets_asset_idx" ON "download_assets" USING btree ("org_id","asset_id");--> statement-breakpoint
CREATE INDEX "downloads_thumbnail_idx" ON "downloads" USING btree ("org_id","thumbnail_asset_id");--> statement-breakpoint
CREATE INDEX "space_links_content_idx" ON "space_links" USING btree ("org_id","content_id");--> statement-breakpoint
CREATE INDEX "entitlements_content_idx" ON "entitlements" USING btree ("org_id","content_id");--> statement-breakpoint
CREATE INDEX "entitlements_bundle_idx" ON "entitlements" USING btree ("org_id","bundle_id");--> statement-breakpoint
CREATE INDEX "notifications_feed_idx" ON "notifications" USING btree ("org_id","user_id","created_at" desc,"id" desc);--> statement-breakpoint
CREATE INDEX "notifications_community_idx" ON "notifications" USING btree ("org_id","community_id");--> statement-breakpoint
CREATE INDEX "notifications_space_idx" ON "notifications" USING btree ("org_id","space_id");--> statement-breakpoint
CREATE INDEX "notifications_post_idx" ON "notifications" USING btree ("org_id","post_id");--> statement-breakpoint
CREATE INDEX "notifications_comment_idx" ON "notifications" USING btree ("org_id","comment_id");--> statement-breakpoint
CREATE INDEX "notifications_chat_idx" ON "notifications" USING btree ("org_id","chat_id");--> statement-breakpoint
CREATE INDEX "notifications_message_idx" ON "notifications" USING btree ("org_id","message_id");--> statement-breakpoint
CREATE INDEX "user_profiles_image_idx" ON "user_profiles" USING btree ("image_asset_org_id","image_asset_id");--> statement-breakpoint
CREATE INDEX "assets_member_uploads_idx" ON "assets" USING btree ("org_id","created_at") WHERE "assets"."source" = 'member';--> statement-breakpoint
CREATE INDEX "comments_community_idx" ON "comments" USING btree ("org_id","community_id");--> statement-breakpoint
CREATE INDEX "comments_parent_idx" ON "comments" USING btree ("org_id","parent_id","created_at");--> statement-breakpoint
CREATE INDEX "message_attachments_asset_idx" ON "message_attachments" USING btree ("org_id","asset_id");--> statement-breakpoint
CREATE INDEX "messages_reply_idx" ON "messages" USING btree ("org_id","reply_to_id");--> statement-breakpoint
CREATE INDEX "posts_cover_asset_idx" ON "posts" USING btree ("org_id","cover_asset_id");--> statement-breakpoint
CREATE INDEX "posts_author_idx" ON "posts" USING btree ("org_id","org_user_id","created_at");--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_locked_check" CHECK ("chats"."locked_by" is null or "chats"."locked_at" is not null);--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_removed_by_check" CHECK ("comments"."removed_by" is null or "comments"."status" = 'removed');--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_removed_by_check" CHECK ("posts"."removed_by" is null or "posts"."status" = 'removed');