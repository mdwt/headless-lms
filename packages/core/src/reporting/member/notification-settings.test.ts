import { describe, expect, it } from 'vitest';
import { MemberReportServiceImpl } from './service.js';
import type { NotificationCategory, StoredSetting } from '../../types/index.js';
import type { ContentServicePort } from '../../content/index.js';
import { createFileUrls } from '../../assets/index.js';
import { actorWith } from '../../organizations/index.js';
import { NotFoundError } from '../../shared/errors.js';

const on = { default: true, locked: false };
const off = { default: false, locked: false };

const COMMUNITY: NotificationCategory[] = [
  {
    key: 'about_you',
    covers: [{ type: 'post.removed', reasons: ['subject'] }],
    channels: { inApp: { default: true, locked: true }, email: on },
  },
  {
    key: 'mentions',
    covers: [{ type: 'mention', reasons: ['mentioned'] }],
    channels: { inApp: on, email: on, push: on },
  },
  {
    key: 'new_posts',
    perSpace: true,
    covers: [{ type: 'post.published', reasons: ['space_member'] }],
    channels: { inApp: off, push: off },
    spaceDefaults: { spc_announcements: { inApp: true, push: true } },
  },
];

const ORG: NotificationCategory[] = [
  {
    key: 'access',
    covers: [{ type: 'access.granted', reasons: ['subject'] }],
    channels: { inApp: on, email: { default: true, locked: true } },
  },
];

const SPACES = [
  { id: 'spc_announcements', name: 'Announcements' },
  { id: 'spc_practice', name: 'Practice' },
  { id: 'spc_staff', name: 'Staff room' },
];

const WEEKLY = { cadence: 'weekly' as const, weekday: 1, hour: 8, timeZone: 'Europe/Madrid' };

function build(options: {
  member?: boolean;
  settings?: StoredSetting[];
  configured?: string[];
  openSpaces?: string[];
  digest?: typeof WEEKLY | null;
}) {
  const asked: unknown[][] = [];
  const svc = new MemberReportServiceImpl({
    repo: {
      directory: async () => ({ rows: [], total: 0, page: 1, pageSize: 20 }),
      spaceMemberCounts: async () => ({}),
      people: async () => [],
    },
    content: {
      listSpaces: async () => SPACES,
      getCommunity: async () => ({ settings: { digest: options.digest ?? null } }),
    } as unknown as ContentServicePort,
    progress: {} as never,
    files: { signFile: async () => null },
    fileUrls: createFileUrls('https://api.test'),
    access: {
      isCommunityMember: async () => options.member ?? true,
      openSpaceIds: async () => options.openSpaces ?? ['spc_announcements', 'spc_practice'],
      spaceStandings: async () => ({}),
      hasAccess: async () => false,
      listAccessibleContent: async () => [],
      openCommunityIds: async () => [],
      opensEverySpace: async () => false,
      everySpaceOpeners: async () => [],
    },
    people: {
      systemActor: (orgId) => actorWith({ id: 'system', orgId, owner: true }),
      holders: async () => [],
      permissionsOfMany: async () => new Map(),
    },
    notifications: {
      list: async () => ({ items: [], total: 0, unreadCount: 0 }),
      get: async () => null,
      unreadCounts: async () => ({ org: 0, communities: [] }),
    },
    titles: {
      discussion: { titlesFor: async () => ({}) },
      content: { titlesFor: async () => ({}) },
    },
    subscriptions: { viewerSubscriptions: async () => ({}) },
    notificationCategories: {
      community: { get: async () => ({ categories: COMMUNITY, source: 'stored' }) },
      org: { get: async () => ({ categories: ORG, source: 'default' }) },
    },
    notificationSettings: {
      get: async (...args) => {
        asked.push(args);
        return options.settings ?? [];
      },
    },
    channels: { list: () => options.configured ?? ['inApp', 'email', 'push'] },
  });
  return { svc, asked };
}

const sarah = { ...actorWith({ id: 'ou_sarah', orgId: 'org_1' }), userId: 'usr_sarah' };

function setting(over: Partial<StoredSetting>): StoredSetting {
  return {
    communityId: 'cmy_1',
    spaceId: null,
    category: 'mentions',
    channel: 'email',
    enabled: false,
    ...over,
  };
}

describe('member notification settings view', () => {
  it('resolves each offered channel with its source, and lists every open space of a per-space category', async () => {
    const { svc, asked } = build({
      settings: [
        setting({}),
        setting({ category: 'new_posts', spaceId: 'spc_practice', channel: 'push', enabled: true }),
        setting({ category: 'new_posts', channel: 'inApp', enabled: true }),
      ],
    });
    const view = await svc.communityNotificationSettings('cmy_1', sarah);
    expect(asked).toEqual([['org_1', 'usr_sarah', { communityId: 'cmy_1' }]]);
    expect(view).toEqual({
      communityId: 'cmy_1',
      digest: null,
      categories: [
        {
          key: 'about_you',
          perSpace: false,
          channels: [
            { channel: 'inApp', enabled: true, source: 'locked', locked: true, default: true },
            { channel: 'email', enabled: true, source: 'default', locked: false, default: true },
          ],
        },
        {
          key: 'mentions',
          perSpace: false,
          channels: [
            { channel: 'inApp', enabled: true, source: 'default', locked: false, default: true },
            { channel: 'email', enabled: false, source: 'community', locked: false, default: true },
            { channel: 'push', enabled: true, source: 'default', locked: false, default: true },
          ],
        },
        {
          key: 'new_posts',
          perSpace: true,
          channels: [
            { channel: 'inApp', enabled: true, source: 'community', locked: false, default: false },
            { channel: 'push', enabled: false, source: 'default', locked: false, default: false },
          ],
          spaces: [
            {
              spaceId: 'spc_announcements',
              name: 'Announcements',
              channels: [
                {
                  channel: 'inApp',
                  enabled: true,
                  source: 'community',
                  locked: false,
                  default: true,
                },
                {
                  channel: 'push',
                  enabled: true,
                  source: 'spaceDefault',
                  locked: false,
                  default: true,
                },
              ],
            },
            {
              spaceId: 'spc_practice',
              name: 'Practice',
              channels: [
                {
                  channel: 'inApp',
                  enabled: true,
                  source: 'community',
                  locked: false,
                  default: true,
                },
                { channel: 'push', enabled: true, source: 'space', locked: false, default: false },
              ],
            },
          ],
        },
      ],
    });
  });

  it('gives a space setting the value the community setting or space default would give without it', async () => {
    const { svc } = build({
      settings: [
        setting({ category: 'new_posts', channel: 'push', enabled: false }),
        setting({
          category: 'new_posts',
          spaceId: 'spc_announcements',
          channel: 'push',
          enabled: false,
        }),
        setting({ category: 'new_posts', spaceId: 'spc_practice', channel: 'push', enabled: true }),
      ],
      openSpaces: ['spc_announcements', 'spc_practice'],
    });
    const view = await svc.communityNotificationSettings('cmy_1', sarah);
    const push = (spaceId: string) =>
      view?.categories
        .find((c) => c.key === 'new_posts')
        ?.spaces?.find((space) => space.spaceId === spaceId)
        ?.channels.find((c) => c.channel === 'push');
    expect(push('spc_announcements')).toMatchObject({ enabled: false, default: false });
    expect(push('spc_practice')).toMatchObject({ enabled: true, default: false });
  });

  it('carries the digest schedule of the community, and lists only open spaces with their names', async () => {
    const { svc } = build({ digest: WEEKLY, openSpaces: ['spc_practice'] });
    const view = await svc.communityNotificationSettings('cmy_1', sarah);
    expect(view?.digest).toEqual(WEEKLY);
    expect(
      view?.categories
        .find((c) => c.key === 'new_posts')
        ?.spaces?.map(({ spaceId, name }) => ({ spaceId, name })),
    ).toEqual([{ spaceId: 'spc_practice', name: 'Practice' }]);
  });

  it('omits a channel the deployment does not have', async () => {
    const { svc } = build({ configured: ['inApp'] });
    const view = await svc.communityNotificationSettings('cmy_1', sarah);
    expect(view?.categories.map((c) => c.channels.map((r) => r.channel))).toEqual([
      ['inApp'],
      ['inApp'],
      ['inApp'],
    ]);
  });

  it('lists channels inApp, email, push, then the rest, whatever the registry order', async () => {
    const { svc } = build({ configured: ['inApp', 'sms', 'push', 'email'] });
    const view = await svc.communityNotificationSettings('cmy_1', sarah);
    expect(view?.categories.map((c) => c.channels.map((r) => r.channel))).toEqual([
      ['inApp', 'email'],
      ['inApp', 'email', 'push'],
      ['inApp', 'push'],
    ]);
    expect(view?.categories[2]?.spaces?.[0]?.channels.map((r) => r.channel)).toEqual([
      'inApp',
      'push',
    ]);
  });

  it('lists no spaces when the member can open none', async () => {
    const { svc } = build({ openSpaces: [] });
    const view = await svc.communityNotificationSettings('cmy_1', sarah);
    expect(view?.categories.find((c) => c.key === 'new_posts')?.spaces).toEqual([]);
  });

  it('throws NotFoundError for someone who cannot open the community', async () => {
    const { svc, asked } = build({ member: false });
    await expect(svc.communityNotificationSettings('cmy_1', sarah)).rejects.toThrow(NotFoundError);
    expect(asked).toEqual([]);
  });

  it('serves the org categories against the org settings', async () => {
    const { svc, asked } = build({
      settings: [setting({ communityId: null, category: 'access', channel: 'inApp' })],
    });
    await expect(svc.orgNotificationSettings(sarah)).resolves.toEqual({
      categories: [
        {
          key: 'access',
          perSpace: false,
          channels: [
            { channel: 'inApp', enabled: false, source: 'community', locked: false, default: true },
            { channel: 'email', enabled: true, source: 'locked', locked: true, default: true },
          ],
        },
      ],
    });
    expect(asked).toEqual([['org_1', 'usr_sarah', 'org']]);
  });
});
