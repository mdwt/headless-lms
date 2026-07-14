// credentials — the shared secure credential store. One row per secret,
// org-scoped with the standard composite (org_id, id) key. `ciphertext` is
// base64(iv ‖ auth tag ‖ data), AES-256-GCM with AAD = `${orgId}:${id}`, so a
// row's payload cannot be decrypted if copied to another row or org.
// `key_version` names the encryption key used, enabling rotation later.
import { pgTable, text, integer, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { organizations } from "./organizations.js";

export const credentials = pgTable(
  "credentials",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    ciphertext: text("ciphertext").notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.orgId, t.id] }) }),
);
