import { describe, expect, it } from 'vitest';
import { OWNER, runCase, toolSpecs, type ToolCase } from '../test-support.js';
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
    expected: [OWNER],
  },
  {
    tool: 'list_automation_actions',
    args: {},
    service: 'automations.availableActions',
    expected: [OWNER],
  },
  {
    tool: 'list_automations',
    args: { kind: 'workflow' },
    service: 'automations.list',
    expected: [{ kind: 'workflow' }, OWNER],
    returns: [],
  },
  {
    tool: 'list_automation_runs',
    args: { id: 'aut_1' },
    service: 'automations.listRuns',
    expected: ['aut_1', { page: 1, pageSize: 20 }, OWNER],
  },
  {
    tool: 'create_automation',
    args: workflow,
    service: 'automations.create',
    expected: [workflow, OWNER],
  },
  {
    tool: 'update_automation',
    args: { id: 'aut_1', enabled: false },
    service: 'automations.update',
    expected: ['aut_1', { enabled: false }, OWNER],
  },
  {
    tool: 'rerun_automation_run',
    args: { id: 'aut_1', runId: 'run_1' },
    service: 'automations.rerun',
    expected: ['aut_1', 'run_1', OWNER],
  },
  {
    tool: 'delete_automation',
    args: { id: 'aut_1' },
    service: 'automations.delete',
    expected: ['aut_1', OWNER],
    returns: true,
  },
  {
    tool: 'update_webhook',
    args: { id: 'aut_2', enabled: false },
    service: 'automations.updateWebhook',
    expected: ['aut_2', { enabled: false }, OWNER],
  },
  {
    tool: 'delete_webhook',
    args: { id: 'aut_2' },
    service: 'automations.deleteWebhook',
    expected: ['aut_2', OWNER],
    returns: true,
  },
];

describe('workflow and webhook tools', () => {
  it('declare their operation and hints', () => {
    expect(toolSpecs(automationTools)).toEqual([
      ['list_automation_triggers', 'read', true, false],
      ['list_automation_actions', 'read', true, false],
      ['list_automations', 'read', true, false],
      ['list_automation_runs', 'read', true, false],
      ['create_automation', 'write', false, false],
      ['update_automation', 'write', true, false],
      ['rerun_automation_run', 'write', false, true],
      ['delete_automation', 'destructive', true, false],
      ['update_webhook', 'write', true, false],
      ['delete_webhook', 'destructive', true, false],
    ]);
  });

  it.each(cases)('$tool calls $service once', (c) => runCase(automationTools, c));
});
