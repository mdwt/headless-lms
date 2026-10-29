import { sql } from "drizzle-orm";
import { pgTable, text, bigint, timestamp, primaryKey, index } from "drizzle-orm/pg-core";
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
    kind: text("kind", { enum: ["image", "video", "audio", "document"] }).notNull(),
    source: text("source", { enum: ["library", "member"] })
      .notNull()
      .default("library"),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
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
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    memberUploadsIdx: index("assets_member_uploads_idx")
      .on(t.orgId, t.createdAt)
      .where(sql`${t.source} = 'member'`),
  }),
);

type _AssetsDrift = Expect<NoDrift<typeof assets.$inferSelect, Asset>>;
