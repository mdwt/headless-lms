// progress tables — one progress record per student per target (activity,
// module, or course). Tracks lifecycle: started_at on open, position
// (typed resume payload) as the player reports it, completed_at when the rule is
// satisfied (null = in progress). Target is denormalized (type + id, no FK) so a
// record survives structure edits. Percentage and resume are derived on read;
// nothing here is a stored percentage.
import { pgTable, text, jsonb, timestamp, primaryKey, unique } from 'drizzle-orm/pg-core';
import { genId } from '../../../core/shared/id.js';
import { organizations } from './organizations.js';

export const progressRecords = pgTable(
  'progress_records',
  {
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    id: text('id')
      .notNull()
      .$defaultFn(() => genId('progress')),
    studentId: text('student_id').notNull(),
    targetType: text('target_type', {
      enum: ['activity', 'module', 'course'],
    }).notNull(),
    targetId: text('target_id').notNull(),
    startedAt: timestamp('started_at').notNull().defaultNow(),
    position: jsonb('position'), // opaque typed payload; service interprets per target type
    completedAt: timestamp('completed_at'), // null = in progress
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    targetUq: unique().on(t.orgId, t.studentId, t.targetType, t.targetId),
  }),
);
