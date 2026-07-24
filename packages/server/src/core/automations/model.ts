// automations context — domain entities, owned by @headless-lms/types; the
// domain error below is runtime code and stays in core.
export type {
  AutomationTrigger,
  AutomationAction,
  Automation,
  AutomationRunStatus,
  AutomationActionResult,
  AutomationRun,
  Page,
} from '@headless-lms/types';

/** Rejected at authoring time: automation.* is reserved to avoid a self-triggering loop. */
export class InvalidTriggerError extends Error {
  constructor(readonly trigger: string) {
    super(`trigger "${trigger}" is reserved: automations cannot trigger on automation.* events`);
    this.name = 'InvalidTriggerError';
  }
}
