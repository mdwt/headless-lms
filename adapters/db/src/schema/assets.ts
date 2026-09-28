// assets table — the org's media library. Org-scoped: composite (org_id, id) PK
// with org_id → organizations.id, mirroring the multi-tenant table shape.
import { pgTable, text, bigint, timestamp, primaryKey } from "drizzle-orm/pg-core";
import type { Asset } from "@headless-lms/core/schemas";
import { genId } from "@headless-lms/core/shared/id";
import { organizations } from "./organizations.js";
import type { Expect, NoDrift } from "./drift.js";

export const assets = pgTable(
  "assets",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id")
      .notNull()
      .$defaultFn(() => genId("asset")),
    key: text("key").notNull(),
    kind: text("kind", { enum: ["video", "download", "content"] }).notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    // Bytes; bigint because media files exceed int4. 0 until upload confirmed.
    size: bigint("size", { mode: "number" }).notNull().default(0),
    status: text("status", { enum: ["pending", "ready"] })
      .notNull()
      .default("pending"),
    uploadedBy: text("uploaded_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({ pk: primaryKey({ columns: [t.orgId, t.id] }) }),
);

type _AssetsDrift = Expect<NoDrift<typeof assets.$inferSelect, Asset>>;
