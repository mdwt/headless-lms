// discussion tables — comments on an activity, their reactions and reports.
// Configuration is not here: the course's comment settings ride on the course's
// `content` settings row, and an activity's override rides on the activity's
// own settings blob.
//
// The author is always an org user, so one column covers both
// learners and staff. Staff-ness is NOT stored — it is read from the author's
// current role. A removed comment keeps its row so replies below it survive;
// only the body stops being served.
//
// No course_id: which course an activity sits in is content's fact and changes
// when a course is restructured. The staff comment list joins to modules to
// scope by course.
import {
  pgTable,
  text,
  timestamp,
  primaryKey,
  foreignKey,
  unique,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { Comment, CommentReaction, CommentReport } from "@headless-lms/core/schemas";
import { genId } from "@headless-lms/core/shared/id";
import { organizations, orgUsers } from "./organizations.js";
import { activities } from "./content.js";
import type { Expect, NoDrift } from "./drift.js";

export const comments = pgTable(
  "comments",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id")
      .notNull()
      .$defaultFn(() => genId("comment")),
    activityId: text("activity_id").notNull(),
    parentId: text("parent_id"),
    orgUserId: text("org_user_id").notNull(),
    body: text("body").notNull(),
    status: text("status", { enum: ["pending", "published", "removed"] })
      .notNull()
      .default("published"),
    removedBy: text("removed_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    // Removing an activity removes its discussion (spec, boundary 1).
    activityFk: foreignKey({
      columns: [t.orgId, t.activityId],
      foreignColumns: [activities.orgId, activities.id],
    }).onDelete("cascade"),
    authorFk: foreignKey({
      columns: [t.orgId, t.orgUserId],
      foreignColumns: [orgUsers.orgId, orgUsers.id],
    }),
    removedByFk: foreignKey({
      columns: [t.orgId, t.removedBy],
      foreignColumns: [orgUsers.orgId, orgUsers.id],
    }),
    // No cascade: removing a parent must not delete its replies.
    parentFk: foreignKey({
      columns: [t.orgId, t.parentId],
      foreignColumns: [t.orgId, t.id],
    }),
    // removed_by is set if and only if the comment is removed.
    removedCk: check(
      "comments_removed_by_check",
      sql`(${t.status} = 'removed') = (${t.removedBy} is not null)`,
    ),
    activityIdx: index("comments_activity_idx").on(t.orgId, t.activityId, t.status, t.createdAt),
    // The staff list filters by status org-wide, then narrows by course through
    // the activity join — so the index leads on status, not on a stored course.
    queueIdx: index("comments_queue_idx").on(t.orgId, t.status, t.createdAt),
  }),
);

export const commentReactions = pgTable(
  "comment_reactions",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    commentId: text("comment_id").notNull(),
    orgUserId: text("org_user_id").notNull(),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    // One reaction per person, per comment.
    pk: primaryKey({ columns: [t.orgId, t.commentId, t.orgUserId] }),
    commentFk: foreignKey({
      columns: [t.orgId, t.commentId],
      foreignColumns: [comments.orgId, comments.id],
    }).onDelete("cascade"),
    authorFk: foreignKey({
      columns: [t.orgId, t.orgUserId],
      foreignColumns: [orgUsers.orgId, orgUsers.id],
    }),
  }),
);

export const commentReports = pgTable(
  "comment_reports",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id")
      .notNull()
      .$defaultFn(() => genId("commentReport")),
    commentId: text("comment_id").notNull(),
    orgUserId: text("org_user_id").notNull(),
    reason: text("reason").notNull().default(""),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    // One report per person, per comment.
    reporterUq: unique().on(t.orgId, t.commentId, t.orgUserId),
    commentFk: foreignKey({
      columns: [t.orgId, t.commentId],
      foreignColumns: [comments.orgId, comments.id],
    }).onDelete("cascade"),
    reporterFk: foreignKey({
      columns: [t.orgId, t.orgUserId],
      foreignColumns: [orgUsers.orgId, orgUsers.id],
    }),
    openIdx: index("comment_reports_open_idx").on(t.orgId, t.commentId, t.resolvedAt),
  }),
);

type _CommentsDrift = Expect<NoDrift<typeof comments.$inferSelect, Comment>>;
type _CommentReactionsDrift = Expect<
  NoDrift<typeof commentReactions.$inferSelect, CommentReaction>
>;
type _CommentReportsDrift = Expect<NoDrift<typeof commentReports.$inferSelect, CommentReport>>;
