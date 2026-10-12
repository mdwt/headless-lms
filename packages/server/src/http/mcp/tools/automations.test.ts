import { describe, expect, it } from 'vitest';
import { runCase, toolSpecs, type ToolCase } from '../test-support.js';
import { automationTools } from './automations.js';

const workflow = {
  name: 'Welcome',
  triggers: ['student.invited'],
  actions: [{ type: 'sendEmail', input: { subject: 'Hi' } }],
};

const cases: ToolCase[] = [
  {
    tool: 'list_automation_triggers',
    args: {},
    service: 'automations.availableTriggers',
    expected: [],
  },
  {
    tool: 'list_automation_actions',
    args: {},
    service: 'automations.availableActions',
    expected: [],
  },
  {
    tool: 'list_automations',
    args: { kind: 'workflow' },
    service: 'automations.list',
    expected: ['org_1', { kind: 'workflow' }],
    returns: [],
  },
  {
    tool: 'list_automation_runs',
    args: { id: 'aut_1' },
    service: 'automations.listRuns',
    expected: ['org_1', 'aut_1', { page: 1, pageSize: 20 }],
  },
  {
    tool: 'create_automation',
    args: workflow,
    service: 'automations.create',
    expected: ['org_1', workflow],
  },
  {
    tool: 'update_automation',
    args: { id: 'aut_1', enabled: false },
    service: 'automations.update',
    expected: ['org_1', 'aut_1', { enabled: false }],
  },
  {
    tool: 'rerun_automation_run',
    args: { id: 'aut_1', runId: 'run_1' },
    service: 'automations.rerun',
    expected: ['org_1', 'aut_1', 'run_1'],
  },
  {
    tool: 'delete_automation',
    args: { id: 'aut_1' },
    service: 'automations.delete',
    expected: ['org_1', 'aut_1'],
    returns: true,
  },
  {
    tool: 'update_webhook',
    args: { id: 'aut_2', enabled: false },
    service: 'automations.updateWebhook',
    expected: ['org_1', 'aut_2', { enabled: false }],
  },
  {
    tool: 'delete_webhook',
    args: { id: 'aut_2' },
    service: 'automations.deleteWebhook',
    expected: ['org_1', 'aut_2'],
    returns: true,
  },
];

describe('workflow and webhook tools', () => {
  it('declare their scope and hints', () => {
    expect(toolSpecs(automationTools)).toEqual([
      ['list_automation_triggers', 'automations:read', 'read', true, false],
      ['list_automation_actions', 'automations:read', 'read', true, false],
      ['list_automations', 'automations:read', 'read', true, false],
      ['list_automation_runs', 'automations:read', 'read', true, false],
      ['create_automation', 'automations:write', 'write', false, false],
      ['update_automation', 'automations:write', 'write', true, false],
      ['rerun_automation_run', 'automations:write', 'write', false, true],
      ['delete_automation', 'automations:delete', 'destructive', true, false],
      ['update_webhook', 'automations:write', 'write', true, false],
      ['delete_webhook', 'automations:delete', 'destructive', true, false],
    ]);
  });

  it.each(cases)('$tool calls $service once', (c) => runCase(automationTools, c));
});
