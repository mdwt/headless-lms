import { pgTable, text, timestamp, primaryKey, unique } from "drizzle-orm/pg-core";
import { genId } from "../../../core/shared/id.js";
import { organizations } from "./organizations.js";

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

// Org-scoped: a student belongs to exactly one org. Composite (org_id, id) PK,
// mirroring every other tenant table. Login is one global better-auth account
// (external_id); the portal boundary supplies the org, so (org_id, external_id)
// resolves the right student row. Email/external_id are unique PER ORG.
export const students = pgTable(
  "students",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id")
      .notNull()
      .$defaultFn(() => genId("student")),
    externalId: text("external_id").notNull(),
    email: text("email").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    emailUq: unique().on(t.orgId, t.email),
    externalUq: unique().on(t.orgId, t.externalId),
  }),
);
