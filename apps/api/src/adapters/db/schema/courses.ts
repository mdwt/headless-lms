// courses tables. Org-scoped: composite (org_id, id) key. Stub.
import { pgTable, uuid, primaryKey } from "drizzle-orm/pg-core";
import { organizations } from "./organizations.js";

export const courses = pgTable(
  "courses",
  {
    id: uuid("id").notNull().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.orgId, t.id] }) }),
);
