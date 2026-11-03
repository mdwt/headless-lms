import { describe, expect, it } from 'vitest';
import { CommunityNotificationCategories } from './notification-categories.js';
import { SettingsService, type SettingsRepository } from '../shared/settings.js';
import { NotFoundError, ValidationError } from '../shared/errors.js';
import type { NotificationCategory, NotificationTypeDeclaration } from '../types/index.js';
import type { Community } from './model.js';

const DECLARATIONS: NotificationTypeDeclaration[] = [
  {
    type: 'comment.created',
    scopes: ['space', 'org'],
    reasons: ['post_author', 'comment_author'],
    display: { space: ['postTitle'] },
  },
  { type: 'access.granted', scopes: ['org'], reasons: ['subject'], display: { org: ['x'] } },
];

const DEFAULT: NotificationCategory[] = [
  {
    key: 'comments_on_my_posts',
    covers: [{ type: 'comment.created', reasons: ['post_author'] }],
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
  const service = new CommunityNotificationCategories({
    communities: {
      findCommunityById: async (_orgId, id) =>
        id === 'cmy_1' ? ({ id: 'cmy_1' } as Community) : null,
    },
    settings: new SettingsService(repo),
    types: {
      list: () => DECLARATIONS,
      get: (type) => DECLARATIONS.find((declaration) => declaration.type === type),
      defaults: (scope) => (scope === 'community' ? DEFAULT : []),
    },
    channels: { list: () => ['inApp', 'email'], get: () => undefined },
  });
  return { service, rows };
}

const replies: NotificationCategory = {
  key: 'replies',
  covers: [{ type: 'comment.created', reasons: ['comment_author'] }],
  channels: { inApp: { default: true, locked: false }, email: { default: false, locked: true } },
};

describe('community notification categories', () => {
  it('serves the default list while the community stores none', async () => {
    const { service } = harness();
    await expect(service.get('org_1', 'cmy_1')).resolves.toEqual({
      categories: DEFAULT,
      source: 'default',
    });
    expect(service.defaults()).toEqual(DEFAULT);
  });

  it('stores a whole valid list in the community settings and serves it from then on', async () => {
    const { service, rows } = harness();
    rows.set('org_1:content:cmy_1', { dm: { mode: 'members' } });
    await expect(service.replace('org_1', 'cmy_1', [replies])).resolves.toEqual({
      categories: [replies],
      source: 'stored',
    });
    expect(rows.get('org_1:content:cmy_1')).toEqual({
      dm: { mode: 'members' },
      notificationCategories: [replies],
    });
    await expect(service.get('org_1', 'cmy_1')).resolves.toEqual({
      categories: [replies],
      source: 'stored',
    });
  });

  it('refuses an invalid list with a validation error and stores nothing', async () => {
    const { service, rows } = harness();
    const invalid = { ...replies, channels: { push: { default: true, locked: false } } };
    await expect(service.replace('org_1', 'cmy_1', [invalid])).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      service.replace('org_1', 'cmy_1', [
        { ...replies, covers: [{ type: 'access.granted', reasons: ['subject'] }] },
      ]),
    ).rejects.toThrow(/cannot be in the community list/);
    expect(rows.size).toBe(0);
  });

  it('resets by storing null, which reads as the default again', async () => {
    const { service, rows } = harness();
    await service.replace('org_1', 'cmy_1', [replies]);
    await service.reset('org_1', 'cmy_1');
    expect(rows.get('org_1:content:cmy_1')).toEqual({ notificationCategories: null });
    await expect(service.get('org_1', 'cmy_1')).resolves.toEqual({
      categories: DEFAULT,
      source: 'default',
    });
  });

  it('reads a stored list without the channels the deployment no longer configures, so it writes back', async () => {
    const { service, rows } = harness();
    const on = { default: true, locked: false };
    rows.set('org_1:content:cmy_1', {
      notificationCategories: [
        { ...replies, channels: { inApp: on, push: on } },
        {
          key: 'pushed',
          covers: [{ type: 'comment.created', reasons: ['post_author'] }],
          channels: { push: on },
        },
      ],
    });
    const read = await service.get('org_1', 'cmy_1');
    expect(read).toEqual({
      categories: [{ ...replies, channels: { inApp: on } }],
      source: 'stored',
    });
    await expect(service.replace('org_1', 'cmy_1', read.categories)).resolves.toEqual(read);
  });

  it('answers not found for a community the org does not have', async () => {
    const { service } = harness();
    await expect(service.get('org_1', 'cmy_x')).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.replace('org_1', 'cmy_x', [replies])).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(service.reset('org_1', 'cmy_x')).rejects.toBeInstanceOf(NotFoundError);
  });
});
