// courses tables. Org-scoped: composite (org_id, id) key.
import { pgTable, uuid, text, timestamp, primaryKey, unique } from "drizzle-orm/pg-core";
import { organizations } from "./organizations.js";
import { students } from "./identity.js";

export const courses = pgTable(
  "courses",
  {
    id: uuid("id").notNull().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("draft"), // draft | published
    category: text("category").notNull().default(""),
    // The instructor is an org member, identified by their domain student id.
    instructorId: uuid("instructor_id").references(() => students.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    slugUq: unique().on(t.orgId, t.slug),
  }),
);
