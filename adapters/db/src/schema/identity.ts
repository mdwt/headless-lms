// identity tables — the person.
//
// One row per human, global, storing auth ID in `external_id`.
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { User } from "@headless-lms/core/schemas";
import { genId } from "@headless-lms/core/shared/id";
import type { Expect, NoDrift } from "./drift.js";

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => genId("user")),
  // auth engine's ID - e.g. better-auth.
  externalId: text("external_id").unique(),
  email: text("email").notNull().unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

type _UsersDrift = Expect<NoDrift<typeof users.$inferSelect, User>>;
