// progress context — DTOs and use-case inputs/outputs.
import type { ProgressTargetType } from "./model.js";

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
