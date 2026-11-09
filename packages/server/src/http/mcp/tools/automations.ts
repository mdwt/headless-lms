import {
  AutomationIdParam,
  AutomationRunParams,
  AutomationRunsQuery,
  AutomationsQuery,
  CreateAutomationBody,
  UpdateAutomationBody,
  UpdateWebhookBody,
} from '../../schemas/index.js';
import { defineTool, noInput, type Tool } from '../tool.js';

export const automationTools: Tool[] = [
  defineTool({
    name: 'list_automation_triggers',
    title: 'List workflow triggers',
    description: 'The events that can start a workflow.',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: noInput,
    call: (_input, { container, caller }) => container.automations.availableTriggers(caller.actor),
  }),
  defineTool({
    name: 'list_automation_actions',
    title: 'List workflow actions',
    description: 'The actions a workflow can run, with the settings each one takes.',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: noInput,
    call: (_input, { container, caller }) => container.automations.availableActions(caller.actor),
  }),
  defineTool({
    name: 'list_automations',
    title: 'List workflows and webhooks',
    description:
      'Workflows and webhooks with their triggers, ordered actions and enabled state. Filter by kind (workflow or webhook).',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: AutomationsQuery,
    call: (input, { container, caller }) => container.automations.list(input, caller.actor),
  }),
  defineTool({
    name: 'list_automation_runs',
    title: 'List workflow and webhook runs',
    description:
      'Runs of one workflow or webhook, newest first, with the trigger event as a webhook would receive it and each action result.',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: AutomationRunsQuery.extend(AutomationIdParam.shape),
    call: ({ id, ...query }, { container, caller }) =>
      container.automations.listRuns(id, query, caller.actor),
  }),
  defineTool({
    name: 'create_automation',
    title: 'Create workflow',
    description:
      'Create a workflow from triggers and ordered actions. Use list_automation_triggers and list_automation_actions for valid values.',
    kind: 'write',
    idempotent: false,
    openWorld: false,
    input: CreateAutomationBody,
    call: (input, { container, caller }) => container.automations.create(input, caller.actor),
  }),
  defineTool({
    name: 'update_automation',
    title: 'Update workflow',
    description:
      'Change a workflow name, description, triggers or actions, or turn it on and off with enabled. Fields left out stay as they are.',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: UpdateAutomationBody.extend(AutomationIdParam.shape),
    call: ({ id, ...patch }, { container, caller }) =>
      container.automations.update(id, patch, caller.actor),
  }),
  defineTool({
    name: 'rerun_automation_run',
    title: 'Re-run workflow or webhook run',
    description:
      "Run a finished workflow or webhook run again with its original trigger event, using the automation's current actions. Emails and webhook deliveries are sent again. The new outcome replaces the run's previous one. A run still in progress can't be re-run.",
    kind: 'write',
    idempotent: false,
    openWorld: true,
    input: AutomationRunParams,
    call: ({ id, runId }, { container, caller }) =>
      container.automations.rerun(id, runId, caller.actor),
  }),
  defineTool({
    name: 'delete_automation',
    title: 'Delete workflow',
    description: 'Permanently delete a workflow.',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: AutomationIdParam,
    call: ({ id }, { container, caller }) => container.automations.delete(id, caller.actor),
  }),
  defineTool({
    name: 'update_webhook',
    title: 'Update webhook',
    description:
      'Change a webhook URL, events or description, or turn it on and off with enabled. Fields left out stay as they are.',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: UpdateWebhookBody.extend(AutomationIdParam.shape),
    call: ({ id, ...patch }, { container, caller }) =>
      container.automations.updateWebhook(id, patch, caller.actor),
  }),
  defineTool({
    name: 'delete_webhook',
    title: 'Delete webhook',
    description:
      'Permanently delete a webhook and its signing secret. Its delivery history is kept.',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: AutomationIdParam,
    call: ({ id }, { container, caller }) => container.automations.deleteWebhook(id, caller.actor),
  }),
];
