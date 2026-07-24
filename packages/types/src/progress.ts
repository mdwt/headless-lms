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

/** Input to record (or re-affirm) the position of an in-progress target. */
export interface RecordPositionInput extends ProgressTarget {
  position: unknown;
}

/** Input to report progress on a target (position and/or completion claim). */
export interface ReportProgressInput {
  studentId: string;
  courseId: string;
  activityId: string;
  report: { position?: unknown; completed?: boolean };
}

export interface ProgressReport {
  studentId: string;
  courseId: string;
  activityId: string;
  record: ProgressRecord;
}

export type ProgressEvent =
  | ProgressStarted
  | ProgressCompleted;

export interface ProgressStarted extends DomainEvent {
  type: "progress.started";
  studentId: string;
  courseId: string;
}

export interface ProgressCompleted extends DomainEvent {
  type: "progress.completed";
  studentId: string;
  courseId: string;
  record: ProgressRecord;
}
