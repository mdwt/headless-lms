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
    scope: 'automations:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: noInput,
    call: (_input, { container }) => container.automations.availableTriggers(),
  }),
  defineTool({
    name: 'list_automation_actions',
    title: 'List workflow actions',
    description: 'The actions a workflow can run, with the settings each one takes.',
    scope: 'automations:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: noInput,
    call: (_input, { container }) => container.automations.availableActions(),
  }),
  defineTool({
    name: 'list_automations',
    title: 'List workflows and webhooks',
    description:
      'Workflows and webhooks with their triggers, ordered actions and enabled state. Filter by kind (workflow or webhook). Webhook signing secrets are only shown in the admin app.',
    scope: 'automations:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: AutomationsQuery,
    call: (input, { container, scope }) => container.automations.list(scope.orgId, input),
  }),
  defineTool({
    name: 'list_automation_runs',
    title: 'List workflow and webhook runs',
    description:
      'Runs of one workflow or webhook, newest first, with the trigger event and each action result.',
    scope: 'automations:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: AutomationRunsQuery.extend(AutomationIdParam.shape),
    call: ({ id, ...query }, { container, scope }) =>
      container.automations.listRuns(scope.orgId, id, query),
  }),
  defineTool({
    name: 'create_automation',
    title: 'Create workflow',
    description:
      'Create a workflow from triggers and ordered actions. Use list_automation_triggers and list_automation_actions for valid values.',
    scope: 'automations:write',
    kind: 'write',
    idempotent: false,
    openWorld: false,
    input: CreateAutomationBody,
    call: (input, { container, scope }) => container.automations.create(scope.orgId, input),
  }),
  defineTool({
    name: 'update_automation',
    title: 'Update workflow',
    description:
      'Change a workflow name, description, triggers or actions, or turn it on and off with enabled. Fields left out stay as they are.',
    scope: 'automations:write',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: UpdateAutomationBody.extend(AutomationIdParam.shape),
    call: ({ id, ...patch }, { container, scope }) =>
      container.automations.update(scope.orgId, id, patch),
  }),
  defineTool({
    name: 'rerun_automation_run',
    title: 'Re-run workflow run',
    description:
      'Run a past workflow run again with the same trigger event. Its actions run again, emails and webhooks included.',
    scope: 'automations:write',
    kind: 'write',
    idempotent: false,
    openWorld: true,
    input: AutomationRunParams,
    call: ({ id, runId }, { container, scope }) =>
      container.automations.rerun(scope.orgId, id, runId),
  }),
  defineTool({
    name: 'delete_automation',
    title: 'Delete workflow',
    description: 'Permanently delete a workflow.',
    scope: 'automations:delete',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: AutomationIdParam,
    call: ({ id }, { container, scope }) => container.automations.delete(scope.orgId, id),
  }),
  defineTool({
    name: 'update_webhook',
    title: 'Update webhook',
    description:
      'Change a webhook URL, events or description, or turn it on and off with enabled. Fields left out stay as they are.',
    scope: 'automations:write',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: UpdateWebhookBody.extend(AutomationIdParam.shape),
    call: ({ id, ...patch }, { container, scope }) =>
      container.automations.updateWebhook(scope.orgId, id, patch),
  }),
  defineTool({
    name: 'delete_webhook',
    title: 'Delete webhook',
    description:
      'Permanently delete a webhook and its signing secret. Its delivery history is kept.',
    scope: 'automations:delete',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: AutomationIdParam,
    call: ({ id }, { container, scope }) => container.automations.deleteWebhook(scope.orgId, id),
  }),
];
