// automations context — domain entities, owned by @headless-lms/core/types; the
// domain errors below are runtime code and stay in core.
import type { AutomationKind } from '../types/index.js';

export type {
  AutomationTrigger,
  AutomationAction,
  AutomationKind,
  Automation,
  AutomationRunStatus,
  AutomationActionResult,
  AutomationRun,
  Webhook,
  CreatedWebhook,
  WebhookSecret,
  DeliverWebhookInput,
  Page,
} from '../types/index.js';

/** Rejected at authoring time: automation.* is reserved to avoid a self-triggering loop. */
export class InvalidTriggerError extends Error {
  constructor(
    readonly trigger: string,
    readonly reason: 'reserved' | 'unknown' | 'schedule' = 'reserved',
  ) {
    const message =
      reason === 'reserved'
        ? `trigger "${trigger}" is reserved: automations cannot trigger on automation.* events`
        : reason === 'unknown'
          ? `trigger "${trigger}" is not an event the system emits`
          : `trigger "${trigger}" uses a schedule this system cannot match`;
    super(message);
    this.name = 'InvalidTriggerError';
  }
}

export const ACTION_FAILED = 'The action failed';

/** An action failure whose message is safe to record on the run. */
export class ActionFailedError extends Error {
  constructor(message: string = ACTION_FAILED) {
    super(message);
    this.name = 'ActionFailedError';
  }
}

/** The message a run records for an action that threw `err`. */
export function actionFailureMessage(err: unknown): string {
  return err instanceof ActionFailedError ? err.message : ACTION_FAILED;
}

export class ReservedActionError extends Error {
  constructor(readonly actionType: string) {
    super(`action "${actionType}" is reserved to webhooks`);
    this.name = 'ReservedActionError';
  }
}

export class AutomationKindMismatchError extends Error {
  constructor(
    readonly automationId: string,
    readonly kind: AutomationKind,
  ) {
    super(`automation "${automationId}" is a ${kind} and can't be changed through this operation`);
    this.name = 'AutomationKindMismatchError';
  }
}
