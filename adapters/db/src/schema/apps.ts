// apps — the frontends an organization runs, one row per app, each on a
// domain no other app has. Cross-cutting like settings: every context reads
// it through the apps utility, and no context owns it.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  pgTable,
  primaryKey,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { App } from "@headless-lms/core/schemas";
import { genId } from "@headless-lms/core/shared/id";
import { organizations } from "./organizations.js";
import type { Expect, NoDrift } from "./drift.js";

export const apps = pgTable(
  "apps",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    id: text("id")
      .notNull()
      .$defaultFn(() => genId("app")),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    domain: text("domain").notNull(),
    courses: boolean("courses").notNull(),
    community: boolean("community").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    slugUq: unique("apps_org_slug_uq").on(t.orgId, t.slug),
    domainUq: unique("apps_domain_uq").on(t.domain),
    coursesUq: uniqueIndex("apps_courses_uq")
      .on(t.orgId)
      .where(sql`${t.courses}`),
    communityUq: uniqueIndex("apps_community_uq")
      .on(t.orgId)
      .where(sql`${t.community}`),
    serves: check("apps_serves_ck", sql`${t.courses} or ${t.community}`),
  }),
);

type _AppsDrift = Expect<NoDrift<typeof apps.$inferSelect, App>>;
