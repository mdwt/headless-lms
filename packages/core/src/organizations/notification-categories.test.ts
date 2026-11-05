import { describe, expect, it } from 'vitest';
import { OrgNotificationCategories } from './notification-categories.js';
import { SettingsService, type SettingsRepository } from '../shared/settings.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../shared/errors.js';
import { actorWith } from './testing.js';
import type { NotificationCategory, NotificationTypeDeclaration } from '../types/index.js';

const ADMIN = actorWith({
  orgId: 'org_1',
  org: [
    'notification_categories:read',
    'notification_categories:write',
    'communities:read',
    'communities:write',
  ],
});

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

function harness(configured = ['inApp', 'email']) {
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
    channels: { list: () => configured, get: () => undefined },
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
    await expect(service.get('org_1', ADMIN)).resolves.toEqual({
      categories: DEFAULT,
      source: 'default',
    });
    await service.replace('org_1', [access], ADMIN);
    expect(rows.get('org_1:organizations:org_1')).toEqual({ notificationCategories: [access] });
    await expect(service.get('org_1', ADMIN)).resolves.toEqual({
      categories: [access],
      source: 'stored',
    });
  });

  it('stores an empty list, which sends nothing rather than the default', async () => {
    const { service } = harness();
    await service.replace('org_1', [], ADMIN);
    await expect(service.get('org_1', ADMIN)).resolves.toEqual({
      categories: [],
      source: 'stored',
    });
  });

  it('refuses a type outside the org scope', async () => {
    const { service } = harness();
    await expect(
      service.replace(
        'org_1',
        [{ ...access, key: 'chat', covers: [{ type: 'message.sent', reasons: ['participant'] }] }],
        ADMIN,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('reads a stored list without the channels the deployment no longer configures', async () => {
    const { service, rows } = harness();
    rows.set('org_1:organizations:org_1', {
      notificationCategories: [
        { ...access, channels: { ...access.channels, push: { default: true, locked: false } } },
      ],
    });
    const read = await service.get('org_1', ADMIN);
    expect(read).toEqual({ categories: [access], source: 'stored' });
    await expect(service.replace('org_1', read.categories, ADMIN)).resolves.toEqual(read);
  });

  it('stores and serves channels inApp, email, push, then the rest', async () => {
    const { service, rows } = harness(['inApp', 'sms', 'push', 'email']);
    const shuffled: NotificationCategory = {
      ...access,
      channels: {
        sms: { default: false, locked: false },
        email: { default: true, locked: true },
        push: { default: true, locked: false },
        inApp: { default: true, locked: false },
      },
    };
    const saved = await service.replace('org_1', [shuffled], ADMIN);
    expect(Object.keys(saved.categories[0]!.channels)).toEqual(['inApp', 'email', 'push', 'sms']);
    const stored = rows.get('org_1:organizations:org_1')!
      .notificationCategories as NotificationCategory[];
    expect(Object.keys(stored[0]!.channels)).toEqual(['inApp', 'email', 'push', 'sms']);
    rows.set('org_1:organizations:org_1', { notificationCategories: [shuffled] });
    const read = await service.get('org_1', ADMIN);
    expect(Object.keys(read.categories[0]!.channels)).toEqual(['inApp', 'email', 'push', 'sms']);
  });

  it('resets to the default by storing null', async () => {
    const { service, rows } = harness();
    await service.replace('org_1', [access], ADMIN);
    await service.reset('org_1', ADMIN);
    expect(rows.get('org_1:organizations:org_1')).toEqual({ notificationCategories: null });
    await expect(service.get('org_1', ADMIN)).resolves.toMatchObject({ source: 'default' });
  });
});

describe('org notification categories permissions', () => {
  it('needs notification_categories:read to read and :write to change', async () => {
    const { service } = harness();
    const reader = actorWith({ orgId: 'org_1', org: ['notification_categories:read'] });
    await expect(service.get('org_1', reader)).resolves.toMatchObject({ source: 'default' });
    expect(service.defaults(reader)).toEqual(service.defaults(ADMIN));
    await expect(service.replace('org_1', [], reader)).rejects.toThrow(ForbiddenError);
    await expect(service.reset('org_1', reader)).rejects.toThrow(ForbiddenError);
  });

  it('refuses everything to an actor who holds nothing, and another org as not found', async () => {
    const { service } = harness();
    const nobody = actorWith({ orgId: 'org_1', content: { cmy_1: ['communities:write'] } });
    await expect(service.get('org_1', nobody)).rejects.toThrow(ForbiddenError);
    await expect(service.replace('org_1', [], nobody)).rejects.toThrow(ForbiddenError);
    await expect(service.reset('org_1', nobody)).rejects.toThrow(ForbiddenError);
    expect(() => service.defaults(nobody)).toThrow(ForbiddenError);
    await expect(service.get('org_2', ADMIN)).rejects.toThrow(NotFoundError);
  });
});
