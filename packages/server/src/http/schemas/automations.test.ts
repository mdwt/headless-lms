import { describe, expect, it } from 'vitest';
import {
  CreateAutomationBody,
  CreateWebhookBody,
  UpdateAutomationBody,
  UpdateWebhookBody,
} from './automations.js';

const action = { type: 'sendEmail', input: { template: 'accessGranted' } };

describe('automation bodies', () => {
  it('require at least one action and at most 20', () => {
    const base = { name: 'Welcome', triggers: ['entitlement.created'] };
    expect(CreateAutomationBody.safeParse({ ...base, actions: [] }).success).toBe(false);
    expect(CreateAutomationBody.safeParse({ ...base, actions: [action] }).success).toBe(true);
    expect(
      CreateAutomationBody.safeParse({ ...base, actions: new Array(21).fill(action) }).success,
    ).toBe(false);
    expect(UpdateAutomationBody.safeParse({ actions: [] }).success).toBe(false);
  });

  it('take at most 20 triggers', () => {
    const triggers = new Array(21).fill('entitlement.created');
    expect(CreateAutomationBody.safeParse({ name: 'x', triggers, actions: [action] }).success).toBe(
      false,
    );
    expect(UpdateAutomationBody.safeParse({ triggers }).success).toBe(false);
  });
});

describe('webhook bodies', () => {
  it.each([
    'http://localhost:3000/hooks',
    'http://api.localhost/hooks',
    'http://127.0.0.1/hooks',
    'http://2130706433/hooks',
    'http://10.0.0.5/hooks',
    'http://192.168.1.10/hooks',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/hooks',
    'http://[::ffff:127.0.0.1]/hooks',
    'http://[fd00::1]/hooks',
  ])('refuse %s', (url) => {
    const result = CreateWebhookBody.safeParse({ url, events: ['entitlement.created'] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/public address/);
    expect(UpdateWebhookBody.safeParse({ url }).success).toBe(false);
  });

  it.each(['https://hooks.example.com/in', 'http://8.8.8.8/hooks'])('accept %s', (url) => {
    expect(CreateWebhookBody.safeParse({ url, events: ['entitlement.created'] }).success).toBe(
      true,
    );
  });
});
