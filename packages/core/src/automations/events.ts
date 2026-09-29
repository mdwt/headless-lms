import {
  automationActionResultSchema,
  automationRunSchema,
  automationSchema,
} from '../types/schemas/index.js';
import { defineEvent, type EventOf, type EventOfValues } from '../shared/ports.js';

export const automationEvents = {
  automationCreated: defineEvent({
    type: 'automation.created',
    version: 2,
    data: automationSchema,
  }),
  automationUpdated: defineEvent({
    type: 'automation.updated',
    version: 2,
    data: automationSchema,
  }),
  automationDeleted: defineEvent({
    type: 'automation.deleted',
    version: 2,
    data: automationSchema,
  }),
  automationEnabled: defineEvent({
    type: 'automation.enabled',
    version: 2,
    data: automationSchema,
  }),
  automationDisabled: defineEvent({
    type: 'automation.disabled',
    version: 2,
    data: automationSchema,
  }),
  runStarted: defineEvent({
    type: 'automation.run.started',
    version: 1,
    data: automationRunSchema,
  }),
  runCompleted: defineEvent({
    type: 'automation.run.completed',
    version: 1,
    data: automationRunSchema,
  }),
  runFailed: defineEvent({
    type: 'automation.run.failed',
    version: 1,
    data: automationRunSchema,
  }),
  actionFailed: defineEvent({
    type: 'automation.action.failed',
    version: 1,
    data: automationActionResultSchema,
  }),
};

export type AutomationCreated = EventOf<typeof automationEvents.automationCreated>;
export type AutomationUpdated = EventOf<typeof automationEvents.automationUpdated>;
export type AutomationDeleted = EventOf<typeof automationEvents.automationDeleted>;
export type AutomationEnabled = EventOf<typeof automationEvents.automationEnabled>;
export type AutomationDisabled = EventOf<typeof automationEvents.automationDisabled>;
export type AutomationRunStarted = EventOf<typeof automationEvents.runStarted>;
export type AutomationRunCompleted = EventOf<typeof automationEvents.runCompleted>;
export type AutomationRunFailed = EventOf<typeof automationEvents.runFailed>;
export type AutomationActionFailed = EventOf<typeof automationEvents.actionFailed>;
export type AutomationEvent = EventOfValues<typeof automationEvents>;
