import { describe, expect, it } from 'vitest';
import { CommunityNotificationCategories } from './notification-categories.js';
import { SettingsService, type SettingsRepository } from '../shared/settings.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../shared/errors.js';
import type { NotificationCategory, NotificationTypeDeclaration } from '../types/index.js';
import { actorWith } from '../organizations/index.js';
import type { Community } from './model.js';

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
    channels: { list: () => configured, get: () => undefined },
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
    await expect(service.get('cmy_1', ADMIN)).resolves.toEqual({
      categories: DEFAULT,
      source: 'default',
    });
    expect(service.defaults(ADMIN)).toEqual(DEFAULT);
  });

  it('stores a whole valid list in the community settings and serves it from then on', async () => {
    const { service, rows } = harness();
    rows.set('org_1:content:cmy_1', { dm: { mode: 'members' } });
    await expect(service.replace('cmy_1', [replies], ADMIN)).resolves.toEqual({
      categories: [replies],
      source: 'stored',
    });
    expect(rows.get('org_1:content:cmy_1')).toEqual({
      dm: { mode: 'members' },
      notificationCategories: [replies],
    });
    await expect(service.get('cmy_1', ADMIN)).resolves.toEqual({
      categories: [replies],
      source: 'stored',
    });
  });

  it('refuses an invalid list with a validation error and stores nothing', async () => {
    const { service, rows } = harness();
    const invalid = { ...replies, channels: { push: { default: true, locked: false } } };
    await expect(service.replace('cmy_1', [invalid], ADMIN)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      service.replace(
        'cmy_1',
        [{ ...replies, covers: [{ type: 'access.granted', reasons: ['subject'] }] }],
        ADMIN,
      ),
    ).rejects.toThrow(/cannot be in the community list/);
    expect(rows.size).toBe(0);
  });

  it('resets by storing null, which reads as the default again', async () => {
    const { service, rows } = harness();
    await service.replace('cmy_1', [replies], ADMIN);
    await service.reset('cmy_1', ADMIN);
    expect(rows.get('org_1:content:cmy_1')).toEqual({ notificationCategories: null });
    await expect(service.get('cmy_1', ADMIN)).resolves.toEqual({
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
    const read = await service.get('cmy_1', ADMIN);
    expect(read).toEqual({
      categories: [{ ...replies, channels: { inApp: on } }],
      source: 'stored',
    });
    await expect(service.replace('cmy_1', read.categories, ADMIN)).resolves.toEqual(read);
  });

  it('stores and serves channels inApp, email, push, then the rest', async () => {
    const { service, rows } = harness(['inApp', 'sms', 'push', 'email']);
    const shuffled: NotificationCategory = {
      ...replies,
      channels: {
        push: { default: true, locked: false },
        sms: { default: false, locked: false },
        email: { default: false, locked: true },
        inApp: { default: true, locked: false },
      },
    };
    const saved = await service.replace('cmy_1', [shuffled], ADMIN);
    expect(Object.keys(saved.categories[0]!.channels)).toEqual(['inApp', 'email', 'push', 'sms']);
    const stored = rows.get('org_1:content:cmy_1')!
      .notificationCategories as NotificationCategory[];
    expect(Object.keys(stored[0]!.channels)).toEqual(['inApp', 'email', 'push', 'sms']);
    rows.set('org_1:content:cmy_1', { notificationCategories: [shuffled] });
    const read = await service.get('cmy_1', ADMIN);
    expect(Object.keys(read.categories[0]!.channels)).toEqual(['inApp', 'email', 'push', 'sms']);
  });

  it('answers not found for a community the org does not have', async () => {
    const { service } = harness();
    await expect(service.get('cmy_x', ADMIN)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.replace('cmy_x', [replies], ADMIN)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.reset('cmy_x', ADMIN)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('community notification categories permissions', () => {
  const editor = actorWith({ orgId: 'org_1', content: { cmy_1: ['communities:write'] } });

  it('lets an editor of one community read, replace, reset and see the defaults', async () => {
    const { service } = harness();
    await expect(service.get('cmy_1', editor)).resolves.toMatchObject({ source: 'default' });
    await service.replace('cmy_1', DEFAULT, editor);
    await service.reset('cmy_1', editor);
    expect(service.defaults(editor)).toEqual(DEFAULT);
  });

  it('refuses another community, and everything to an actor who holds nothing', async () => {
    const { service } = harness();
    const reader = actorWith({ orgId: 'org_1', content: { cmy_1: ['communities:read'] } });
    await expect(service.get('cmy_2', editor)).rejects.toThrow(ForbiddenError);
    await expect(service.replace('cmy_1', DEFAULT, reader)).rejects.toThrow(ForbiddenError);
    const nobody = actorWith({ orgId: 'org_1' });
    await expect(service.get('cmy_1', nobody)).rejects.toThrow(ForbiddenError);
    await expect(service.replace('cmy_1', DEFAULT, nobody)).rejects.toThrow(ForbiddenError);
    await expect(service.reset('cmy_1', nobody)).rejects.toThrow(ForbiddenError);
    expect(() => service.defaults(nobody)).toThrow(ForbiddenError);
  });
});
