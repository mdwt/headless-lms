import { describe, expect, it } from 'vitest';
import { OrgNotificationCategories } from './notification-categories.js';
import { SettingsService, type SettingsRepository } from '../shared/settings.js';
import { ValidationError } from '../shared/errors.js';
import type { NotificationCategory, NotificationTypeDeclaration } from '../types/index.js';

const DECLARATIONS: NotificationTypeDeclaration[] = [
  { type: 'access.granted', scopes: ['org'], reasons: ['subject'], display: { org: ['x'] } },
  { type: 'message.sent', scopes: ['chat'], reasons: ['participant'], display: { chat: ['x'] } },
];

const DEFAULT: NotificationCategory[] = [
  {
    key: 'access',
    covers: [{ type: 'access.granted', reasons: ['subject'] }],
    channels: { inApp: { default: true, locked: false } },
  },
];

function harness() {
  const rows = new Map<string, Record<string, unknown>>();
  const repo: SettingsRepository = {
    find: async (orgId, scopeId, namespace) => {
      const value = rows.get(`${orgId}:${namespace}:${scopeId}`);
      return value ? [{ namespace: namespace ?? '', scopeId, value }] : [];
    },
    patch: async (orgId, namespace, scopeId, patch) => {
      const key = `${orgId}:${namespace}:${scopeId}`;
      const value = { ...(rows.get(key) ?? {}), ...(patch as Record<string, unknown>) };
      rows.set(key, value);
      return { namespace, scopeId, value };
    },
  };
  const service = new OrgNotificationCategories({
    settings: new SettingsService(repo),
    types: {
      list: () => DECLARATIONS,
      get: (type) => DECLARATIONS.find((declaration) => declaration.type === type),
      defaults: (scope) => (scope === 'org' ? DEFAULT : []),
    },
    channels: { list: () => ['inApp', 'email'], get: () => undefined },
  });
  return { service, rows };
}

const access: NotificationCategory = {
  key: 'access',
  covers: [{ type: 'access.granted', reasons: ['subject'] }],
  channels: { email: { default: true, locked: true } },
};

describe('org notification categories', () => {
  it('serves the default org list until one is stored in the organizations namespace', async () => {
    const { service, rows } = harness();
    await expect(service.get('org_1', 'org_1')).resolves.toEqual({
      categories: DEFAULT,
      source: 'default',
    });
    await service.replace('org_1', 'org_1', [access]);
    expect(rows.get('org_1:organizations:org_1')).toEqual({ notificationCategories: [access] });
    await expect(service.get('org_1', 'org_1')).resolves.toEqual({
      categories: [access],
      source: 'stored',
    });
  });

  it('stores an empty list, which sends nothing rather than the default', async () => {
    const { service } = harness();
    await service.replace('org_1', 'org_1', []);
    await expect(service.get('org_1', 'org_1')).resolves.toEqual({
      categories: [],
      source: 'stored',
    });
  });

  it('refuses a type outside the org scope', async () => {
    const { service } = harness();
    await expect(
      service.replace('org_1', 'org_1', [
        { ...access, key: 'chat', covers: [{ type: 'message.sent', reasons: ['participant'] }] },
      ]),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('resets to the default by storing null', async () => {
    const { service, rows } = harness();
    await service.replace('org_1', 'org_1', [access]);
    await service.reset('org_1', 'org_1');
    expect(rows.get('org_1:organizations:org_1')).toEqual({ notificationCategories: null });
    await expect(service.get('org_1', 'org_1')).resolves.toMatchObject({ source: 'default' });
  });
});
