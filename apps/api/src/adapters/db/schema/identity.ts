import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { genId } from "../../../core/shared/id.js";

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => genId("user")),
  // auth engine's ID - e.g. better-auth
  externalId: text("external_id").notNull().unique(),

  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const students = pgTable("students", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => genId("student")),
  externalId: text("external_id").notNull().unique(),
  email: text("email").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
