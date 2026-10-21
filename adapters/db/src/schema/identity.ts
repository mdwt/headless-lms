// identity tables — the person.
//
// One row per human, global, storing auth ID in `external_id`.
import { sql } from "drizzle-orm";
import { pgTable, text, jsonb, timestamp, foreignKey, check } from "drizzle-orm/pg-core";
import type { User, UserProfile } from "@headless-lms/core/schemas";
import { genId } from "@headless-lms/core/shared/id";
import { assets } from "./assets.js";
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

export const userProfiles = pgTable(
  "user_profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: text("display_name"),
    headline: text("headline"),
    bio: text("bio"),
    imageAssetOrgId: text("image_asset_org_id"),
    imageAssetId: text("image_asset_id"),
    extra: jsonb("extra").$type<UserProfile["extra"]>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    imageFk: foreignKey({
      columns: [t.imageAssetOrgId, t.imageAssetId],
      foreignColumns: [assets.orgId, assets.id],
    }),
    imageCk: check(
      "user_profiles_image_check",
      sql`(${t.imageAssetOrgId} is null) = (${t.imageAssetId} is null)`,
    ),
  }),
);

type _UsersDrift = Expect<NoDrift<typeof users.$inferSelect, User>>;
type _UserProfilesDrift = Expect<NoDrift<typeof userProfiles.$inferSelect, UserProfile>>;
