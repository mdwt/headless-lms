// assets table — the org's media library. Org-scoped: composite (org_id, id) PK
// with org_id → organizations.id, mirroring the multi-tenant table shape.
import { pgTable, uuid, text, bigint, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { organizations } from "./organizations.js";

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").notNull().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    key: text("key").notNull(),
    kind: text("kind").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    // Bytes; bigint because media files exceed int4. 0 until upload confirmed.
    size: bigint("size", { mode: "number" }).notNull().default(0),
    status: text("status").notNull().default("pending"),
    uploadedBy: text("uploaded_by").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.orgId, t.id] }) }),
);
