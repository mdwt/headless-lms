// progress context — public surface. Re-export only what other contexts may use.
export { ProgressServiceImpl } from './service.js';
export { progressEvents } from './events.js';
export { progressDeclarations } from './declarations.js';
export type {
  ProgressService,
  ProgressRepository,
  ProgressUnitOfWork,
  ContentAccessReader,
  CourseReader,
  SystemActors,
} from './ports.js';
export type { ProgressRecord, ProgressTargetType } from './model.js';
export type {
  ProgressId,
  ProgressTarget,
  ProgressReportItem,
  ReportProgressInput,
} from './types.js';
export type { ProgressEvent, ProgressStarted, ProgressCompleted } from './events.js';
