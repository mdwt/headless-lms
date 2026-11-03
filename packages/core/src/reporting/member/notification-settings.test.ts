import { describe, expect, it } from 'vitest';
import { MemberReportServiceImpl } from './service.js';
import type { NotificationCategory, StoredSetting } from '../../types/index.js';
import type { ContentServicePort } from '../../content/index.js';
import { createFileUrls } from '../../assets/index.js';

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

function build(options: {
  member?: boolean;
  settings?: StoredSetting[];
  configured?: string[];
  openSpaces?: string[];
}) {
  const asked: unknown[][] = [];
  const svc = new MemberReportServiceImpl({
    repo: {
      directory: async () => ({ rows: [], total: 0, page: 1, pageSize: 20 }),
      spaceMemberCounts: async () => ({}),
      people: async () => [],
    },
    content: {} as ContentServicePort,
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
    },
    notifications: {
      list: async () => ({ items: [], total: 0, unreadCount: 0 }),
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

const sarah = { id: 'ou_sarah', role: 'student' as const };

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
    const view = await svc.communityNotificationSettings('org_1', sarah, 'usr_sarah', 'cmy_1');
    expect(asked).toEqual([['org_1', 'usr_sarah', { communityId: 'cmy_1' }]]);
    expect(view).toEqual({
      communityId: 'cmy_1',
      categories: [
        {
          key: 'about_you',
          perSpace: false,
          channels: [
            { channel: 'inApp', enabled: true, source: 'locked', locked: true },
            { channel: 'email', enabled: true, source: 'default', locked: false },
          ],
        },
        {
          key: 'mentions',
          perSpace: false,
          channels: [
            { channel: 'inApp', enabled: true, source: 'default', locked: false },
            { channel: 'email', enabled: false, source: 'community', locked: false },
            { channel: 'push', enabled: true, source: 'default', locked: false },
          ],
        },
        {
          key: 'new_posts',
          perSpace: true,
          channels: [
            { channel: 'inApp', enabled: true, source: 'community', locked: false },
            { channel: 'push', enabled: false, source: 'default', locked: false },
          ],
          spaces: [
            {
              spaceId: 'spc_announcements',
              channels: [
                { channel: 'inApp', enabled: true, source: 'community', locked: false },
                { channel: 'push', enabled: true, source: 'spaceDefault', locked: false },
              ],
            },
            {
              spaceId: 'spc_practice',
              channels: [
                { channel: 'inApp', enabled: true, source: 'community', locked: false },
                { channel: 'push', enabled: true, source: 'space', locked: false },
              ],
            },
          ],
        },
      ],
    });
  });

  it('omits a channel the deployment does not have', async () => {
    const { svc } = build({ configured: ['inApp'] });
    const view = await svc.communityNotificationSettings('org_1', sarah, 'usr_sarah', 'cmy_1');
    expect(view?.categories.map((c) => c.channels.map((r) => r.channel))).toEqual([
      ['inApp'],
      ['inApp'],
      ['inApp'],
    ]);
  });

  it('lists no spaces when the member can open none', async () => {
    const { svc } = build({ openSpaces: [] });
    const view = await svc.communityNotificationSettings('org_1', sarah, 'usr_sarah', 'cmy_1');
    expect(view?.categories.find((c) => c.key === 'new_posts')?.spaces).toEqual([]);
  });

  it('answers null for someone who cannot open the community', async () => {
    const { svc, asked } = build({ member: false });
    await expect(
      svc.communityNotificationSettings('org_1', sarah, 'usr_sarah', 'cmy_1'),
    ).resolves.toBeNull();
    expect(asked).toEqual([]);
  });

  it('serves the org categories against the org settings', async () => {
    const { svc, asked } = build({
      settings: [setting({ communityId: null, category: 'access', channel: 'inApp' })],
    });
    await expect(svc.orgNotificationSettings('org_1', 'usr_sarah')).resolves.toEqual({
      categories: [
        {
          key: 'access',
          perSpace: false,
          channels: [
            { channel: 'inApp', enabled: false, source: 'community', locked: false },
            { channel: 'email', enabled: true, source: 'locked', locked: true },
          ],
        },
      ],
    });
    expect(asked).toEqual([['org_1', 'usr_sarah', 'org']]);
  });
});
