// entitlements table. Org-scoped: composite (org_id, id) key.
// The student↔content access grant — generic over content types via the
// content_items registry FK (real integrity, no polymorphic column). For a
// Student (the learner identity), not a staff User. `status` is stored as
// active | revoked; "expired" is DERIVED at read time from `expiresAt` (no cron
// to flip rows). Completion is NOT held here — it belongs to progress and is
// composed at access-resolution time.
import { pgTable, text, timestamp, primaryKey, foreignKey, unique } from 'drizzle-orm/pg-core';
import { genId } from '../../../core/shared/id.js';
import { organizations } from './organizations.js';
import { students } from './identity.js';
import { contentItems } from './content.js';

export const entitlements = pgTable(
  'entitlements',
  {
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    id: text('id')
      .notNull()
      .$defaultFn(() => genId('entitlement')),
    studentId: text('student_id').notNull(),
    contentId: text('content_id').notNull(),
    status: text('status', { enum: ['active', 'revoked'] })
      .notNull()
      .default('active'),
    // Free text: 'manual', 'import', integration ids, …
    source: text('source').notNull().default('manual'),
    grantedAt: timestamp('granted_at').notNull().defaultNow(),
    expiresAt: timestamp('expires_at'), // null = lifetime
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    // Grants die with their content: deleting the registry row cascades here.
    contentFk: foreignKey({
      columns: [t.orgId, t.contentId],
      foreignColumns: [contentItems.orgId, contentItems.id],
    }).onDelete('cascade'),
    // students is org-scoped (composite PK) — the FK must match both columns.
    // Grants die with their student: deleting the student row cascades here.
    studentFk: foreignKey({
      columns: [t.orgId, t.studentId],
      foreignColumns: [students.orgId, students.id],
    }).onDelete('cascade'),
    // One grant per (org, student, content).
    studentContentUq: unique().on(t.orgId, t.studentId, t.contentId),
  }),
);
