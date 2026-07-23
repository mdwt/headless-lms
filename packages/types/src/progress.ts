// progress context — domain entities, DTOs, and events.
//
// A ProgressRecord is one row per student per target (an activity, module, or
// course). Lifecycle: startedAt on first report, position (an opaque resume
// payload the player reports) updated as the learner advances, completedAt set
// when the completion rule is satisfied (null = still in progress). The target
// is denormalized (type + id) so a record survives structure edits. Percentage
// and resume state are derived on read — nothing here stores a percentage.

import type { DomainEvent } from "./shared.js";

export type ProgressTargetType = "activity" | "module" | "course";

export interface ProgressRecord {
  readonly id: string;
  readonly orgId: string;
  /** The learner's `students.id` (global, not org-scoped). */
  readonly studentId: string;
  readonly targetType: ProgressTargetType;
  readonly targetId: string;
  startedAt: string;
  /** Opaque typed resume payload; the player/service interprets it per target type. */
  position: unknown | null;
  /** null = in progress. */
  completedAt: string | null;
}

export type ProgressId = string;

/** Identifies a single target a student can make progress against. */
export interface ProgressTarget {
  studentId: string;
  targetType: ProgressTargetType;
  targetId: string;
}

/** Usage parameters the frontend reports — never a decision. `{}` is a bare
 *  touch, `position` a player update, `completed` a claim the service validates. */
export interface ProgressReport {
  position?: unknown;
  completed?: boolean;
}

export interface ReportProgressInput {
  studentId: string;
  courseId: string;
  activityId: string;
  report: ProgressReport;
}

/** Domain events the progress context emits. */
export interface ProgressStarted extends DomainEvent {
  type: "progress.started";
  /** The course whose structure the target belongs to. */
  courseId: string;
  record: ProgressRecord;
}

export interface ProgressCompleted extends DomainEvent {
  type: "progress.completed";
  courseId: string;
  record: ProgressRecord;
}

export type ProgressEvent = ProgressStarted | ProgressCompleted;
