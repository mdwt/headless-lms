ALTER TABLE "messages" ADD COLUMN "client_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_client_id_uq" ON "messages" USING btree ("org_id","chat_id","org_user_id","client_id");