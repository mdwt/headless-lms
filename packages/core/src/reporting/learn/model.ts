// reporting/learn — read model. Reuses the content domain's Course/Module
// entities (identical wire shape).
export type { Activity, Course, Module, Download, DownloadAsset } from '../../content/index.js';

/** Per-course progress for the student surface. Derived on read against the
 *  current published structure — never stored. */
export interface CourseProgressView {
  /** Keyed by activity id; absent key = not started. */
  activities: Record<string, 'in-progress' | 'completed'>;
  /** Integer 0–100: completed ÷ current published activities, rounded. */
  percent: number;
  /** The course target's own record says so. */
  completed: boolean;
  /** Per-activity reported state (the record's position map); absent key = none reported. */
  positions: Record<string, unknown>;
}
