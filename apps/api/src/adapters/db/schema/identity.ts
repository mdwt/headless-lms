// identity tables.
// `authUserId` mirrors the auth adapter's user id but is intentionally NOT a
// drizzle .references() FK: the identity tables and the auth tables are owned by
// separate adapters. The link is enforced in the application layer.
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const students = pgTable("students", {
  id: uuid("id").primaryKey().defaultRandom(),
  authUserId: text("auth_user_id").notNull().unique(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
