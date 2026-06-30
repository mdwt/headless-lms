// progress context — domain entities & value objects. Framework-free, runtime-free.
//
// A ProgressRecord is one row per student per target (a lesson, assessment,
// module, or course). Lifecycle: startedAt on open, position (an opaque resume
// payload the player reports) updated as the learner advances, completedAt set
// when the completion rule is satisfied (null = still in progress). The target
// is denormalized (type + id) so a record survives structure edits. Percentage
// and resume state are derived on read — nothing here stores a percentage.

export type ProgressTargetType = "lesson" | "assessment" | "module" | "course";

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
