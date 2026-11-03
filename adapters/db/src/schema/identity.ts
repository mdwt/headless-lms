// identity tables — the person.
//
// One row per human, global, storing auth ID in `external_id`.
import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  jsonb,
  timestamp,
  boolean,
  foreignKey,
  check,
  index,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { User, UserProfile } from "@headless-lms/core/schemas";
import { genId } from "@headless-lms/core/shared/id";
import { assets } from "./assets.js";
import { orgUsers } from "./organizations.js";
import { communities, spaces } from "./content.js";
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
    imageIdx: index("user_profiles_image_idx").on(t.imageAssetOrgId, t.imageAssetId),
  }),
);

export const notificationSettings = pgTable(
  "notification_settings",
  {
    orgId: text("org_id").notNull(),
    id: text("id")
      .notNull()
      .$defaultFn(() => genId("notificationSetting")),
    userId: text("user_id").notNull(),
    communityId: text("community_id"),
    spaceId: text("space_id"),
    category: text("category").notNull(),
    channel: text("channel").notNull(),
    enabled: boolean("enabled").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    userFk: foreignKey({
      columns: [t.orgId, t.userId],
      foreignColumns: [orgUsers.orgId, orgUsers.userId],
    }).onDelete("cascade"),
    communityFk: foreignKey({
      columns: [t.orgId, t.communityId],
      foreignColumns: [communities.orgId, communities.id],
    }).onDelete("cascade"),
    spaceFk: foreignKey({
      columns: [t.orgId, t.spaceId],
      foreignColumns: [spaces.orgId, spaces.id],
    }).onDelete("cascade"),
    settingIdx: uniqueIndex("notification_settings_setting_idx").on(
      t.orgId,
      t.userId,
      sql`coalesce(${t.communityId}, '')`,
      sql`coalesce(${t.spaceId}, '')`,
      t.category,
      t.channel,
    ),
    switchedOnIdx: index("notification_settings_switched_on_idx")
      .on(t.orgId, sql`coalesce(${t.communityId}, '')`, t.category, sql`coalesce(${t.spaceId}, '')`)
      .where(sql`${t.enabled}`),
  }),
);

export const devices = pgTable(
  "devices",
  {
    orgId: text("org_id").notNull(),
    id: text("id")
      .notNull()
      .$defaultFn(() => genId("device")),
    userId: text("user_id").notNull(),
    provider: text("provider", { enum: ["apns", "fcm", "webpush"] }).notNull(),
    token: text("token").notNull(),
    p256dh: text("p256dh"),
    auth: text("auth"),
    appId: text("app_id"),
    environment: text("environment", { enum: ["production", "sandbox"] }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    userFk: foreignKey({
      columns: [t.orgId, t.userId],
      foreignColumns: [orgUsers.orgId, orgUsers.userId],
    }).onDelete("cascade"),
    tokenIdx: uniqueIndex("devices_token_idx").on(t.orgId, t.provider, t.token),
    userIdx: index("devices_user_idx").on(t.orgId, t.userId, t.lastSeenAt),
  }),
);

type _UsersDrift = Expect<NoDrift<typeof users.$inferSelect, User>>;
type _UserProfilesDrift = Expect<NoDrift<typeof userProfiles.$inferSelect, UserProfile>>;
