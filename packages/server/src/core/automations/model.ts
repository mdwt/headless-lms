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

/** A trigger in the `automation.*` namespace is rejected at authoring time —
 *  the service itself emits `automation.*` events, so wiring one up as a
 *  trigger would create a self-triggering loop (each run's own event fires
 *  the next run). */
export class InvalidTriggerError extends Error {
  constructor(readonly trigger: string) {
    super(`trigger "${trigger}" is reserved: automations cannot trigger on automation.* events`);
    this.name = 'InvalidTriggerError';
  }
}
