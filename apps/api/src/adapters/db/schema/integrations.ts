// integrations tables — an org's connections to external services. One
// connection per integration per org; the secret itself lives in the
// credentials table (secure credential store), referenced by credential_ref.
import {
  pgTable,
  text,
  boolean,
  jsonb,
  timestamp,
  primaryKey,
  foreignKey,
  unique,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations.js";
import { credentials } from "./credentials.js";

export const connections = pgTable(
  "connections",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    integrationId: text("integration_id").notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    active: boolean("active").notNull().default(true),
    credentialRef: text("credential_ref").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    onePerIntegration: unique().on(t.orgId, t.integrationId),
    credentialFk: foreignKey({
      columns: [t.orgId, t.credentialRef],
      foreignColumns: [credentials.orgId, credentials.id],
    }),
  }),
);
