import { describe, expect, it } from 'vitest';
import type { NotificationCategory, StoredSetting } from '../types/index.js';
import { resolveChannels } from './notification-settings.js';

const ALL = ['inApp', 'email', 'push'];

function setting(
  channel: string,
  enabled: boolean,
  spaceId: string | null = null,
  category = 'comments_on_my_posts',
): StoredSetting {
  return { communityId: 'cmy_1', spaceId, category, channel, enabled };
}

const comments: NotificationCategory = {
  key: 'comments_on_my_posts',
  covers: [{ type: 'comment.created', reasons: ['post_author'] }],
  channels: {
    inApp: { default: true, locked: false },
    email: { default: true, locked: false },
    push: { default: false, locked: false },
  },
};

const newPosts: NotificationCategory = {
  key: 'new_posts',
  perSpace: true,
  covers: [{ type: 'post.published', reasons: ['space_member'] }],
  channels: {
    inApp: { default: false, locked: false },
    push: { default: false, locked: false },
  },
  spaceDefaults: { spc_announcements: { inApp: true, push: true } },
};

function newPostsSetting(channel: string, enabled: boolean, spaceId: string | null = null) {
  return setting(channel, enabled, spaceId, 'new_posts');
}

describe('resolveChannels', () => {
  it('returns the category default for every offered channel when nothing is stored', () => {
    expect(resolveChannels(comments, [], null, ALL)).toEqual([
      { channel: 'inApp', enabled: true, source: 'default', locked: false },
      { channel: 'email', enabled: true, source: 'default', locked: false },
      { channel: 'push', enabled: false, source: 'default', locked: false },
    ]);
  });

  it('uses the stored community setting over the default', () => {
    const resolved = resolveChannels(
      comments,
      [setting('email', false), setting('push', true)],
      null,
      ALL,
    );
    expect(resolved).toEqual([
      { channel: 'inApp', enabled: true, source: 'default', locked: false },
      { channel: 'email', enabled: false, source: 'community', locked: false },
      { channel: 'push', enabled: true, source: 'community', locked: false },
    ]);
  });

  it('applies the default to a locked channel and ignores a stored setting for it', () => {
    const aboutYou: NotificationCategory = {
      ...comments,
      key: 'about_you',
      channels: { ...comments.channels, inApp: { default: true, locked: true } },
    };
    const resolved = resolveChannels(
      aboutYou,
      [setting('inApp', false, null, 'about_you')],
      null,
      ALL,
    );
    expect(resolved[0]).toEqual({
      channel: 'inApp',
      enabled: true,
      source: 'locked',
      locked: true,
    });
  });

  it('keeps a locked channel off when its default is off', () => {
    const lockedOff: NotificationCategory = {
      ...comments,
      channels: { email: { default: false, locked: true } },
    };
    expect(resolveChannels(lockedOff, [setting('email', true)], null, ALL)).toEqual([
      { channel: 'email', enabled: false, source: 'locked', locked: true },
    ]);
  });

  it('omits a channel the category offers that is not configured', () => {
    expect(resolveChannels(comments, [setting('push', true)], null, ['inApp', 'email'])).toEqual([
      { channel: 'inApp', enabled: true, source: 'default', locked: false },
      { channel: 'email', enabled: true, source: 'default', locked: false },
    ]);
  });

  it('omits a configured channel the category does not offer, and ignores its settings', () => {
    const inAppOnly: NotificationCategory = {
      ...comments,
      channels: { inApp: { default: true, locked: false } },
    };
    expect(resolveChannels(inAppOnly, [setting('email', true)], null, ALL)).toEqual([
      { channel: 'inApp', enabled: true, source: 'default', locked: false },
    ]);
  });

  it('ignores settings of other categories', () => {
    expect(
      resolveChannels(comments, [setting('email', false, null, 'mentions')], null, ALL)[1],
    ).toEqual({ channel: 'email', enabled: true, source: 'default', locked: false });
  });

  it('ignores space settings and the space for a category that is not per space', () => {
    const resolved = resolveChannels(
      comments,
      [setting('email', false, 'spc_practice')],
      'spc_practice',
      ALL,
    );
    expect(resolved[1]).toEqual({
      channel: 'email',
      enabled: true,
      source: 'default',
      locked: false,
    });
  });

  it('ignores spaceDefaults on a category that is not per space', () => {
    const withDefaults: NotificationCategory = {
      ...comments,
      spaceDefaults: { spc_practice: { push: true } },
    };
    expect(resolveChannels(withDefaults, [], 'spc_practice', ALL)[2]).toEqual({
      channel: 'push',
      enabled: false,
      source: 'default',
      locked: false,
    });
  });

  it('uses the community setting for a category that is not per space, in a space', () => {
    expect(resolveChannels(comments, [setting('push', true)], 'spc_practice', ALL)[2]).toEqual({
      channel: 'push',
      enabled: true,
      source: 'community',
      locked: false,
    });
  });

  describe('per space', () => {
    it('uses the setting for the space over the all-spaces setting', () => {
      const resolved = resolveChannels(
        newPosts,
        [newPostsSetting('push', false), newPostsSetting('push', true, 'spc_practice')],
        'spc_practice',
        ALL,
      );
      expect(resolved).toEqual([
        { channel: 'inApp', enabled: false, source: 'default', locked: false },
        { channel: 'push', enabled: true, source: 'space', locked: false },
      ]);
    });

    it('uses the setting for the space over spaceDefaults', () => {
      const resolved = resolveChannels(
        newPosts,
        [newPostsSetting('push', false, 'spc_announcements')],
        'spc_announcements',
        ALL,
      );
      expect(resolved).toEqual([
        { channel: 'inApp', enabled: true, source: 'spaceDefault', locked: false },
        { channel: 'push', enabled: false, source: 'space', locked: false },
      ]);
    });

    it('uses the all-spaces setting when the space has none', () => {
      const resolved = resolveChannels(
        newPosts,
        [newPostsSetting('inApp', true), newPostsSetting('push', true, 'spc_speaking')],
        'spc_practice',
        ALL,
      );
      expect(resolved).toEqual([
        { channel: 'inApp', enabled: true, source: 'community', locked: false },
        { channel: 'push', enabled: false, source: 'default', locked: false },
      ]);
    });

    it('uses the all-spaces setting over spaceDefaults', () => {
      const resolved = resolveChannels(
        newPosts,
        [newPostsSetting('push', false)],
        'spc_announcements',
        ALL,
      );
      expect(resolved).toEqual([
        { channel: 'inApp', enabled: true, source: 'spaceDefault', locked: false },
        { channel: 'push', enabled: false, source: 'community', locked: false },
      ]);
    });

    it('uses spaceDefaults for the space when nothing is stored', () => {
      expect(resolveChannels(newPosts, [], 'spc_announcements', ALL)).toEqual([
        { channel: 'inApp', enabled: true, source: 'spaceDefault', locked: false },
        { channel: 'push', enabled: true, source: 'spaceDefault', locked: false },
      ]);
    });

    it('uses spaceDefaults only for the channels it names', () => {
      const partial: NotificationCategory = {
        ...newPosts,
        spaceDefaults: { spc_announcements: { push: true } },
      };
      expect(resolveChannels(partial, [], 'spc_announcements', ALL)).toEqual([
        { channel: 'inApp', enabled: false, source: 'default', locked: false },
        { channel: 'push', enabled: true, source: 'spaceDefault', locked: false },
      ]);
    });

    it('uses spaceDefaults that switch a channel off', () => {
      const onByDefault: NotificationCategory = {
        ...newPosts,
        channels: { inApp: { default: true, locked: false } },
        spaceDefaults: { spc_practice: { inApp: false } },
      };
      expect(resolveChannels(onByDefault, [], 'spc_practice', ALL)).toEqual([
        { channel: 'inApp', enabled: false, source: 'spaceDefault', locked: false },
      ]);
    });

    it('uses the default for a space with no spaceDefaults entry', () => {
      expect(resolveChannels(newPosts, [], 'spc_practice', ALL)).toEqual([
        { channel: 'inApp', enabled: false, source: 'default', locked: false },
        { channel: 'push', enabled: false, source: 'default', locked: false },
      ]);
    });

    it('resolves the all-spaces level when no space is given, ignoring space settings and spaceDefaults', () => {
      const resolved = resolveChannels(
        newPosts,
        [newPostsSetting('push', true, 'spc_announcements'), newPostsSetting('inApp', true)],
        null,
        ALL,
      );
      expect(resolved).toEqual([
        { channel: 'inApp', enabled: true, source: 'community', locked: false },
        { channel: 'push', enabled: false, source: 'default', locked: false },
      ]);
    });

    it('applies a lock before the space setting and spaceDefaults', () => {
      const locked: NotificationCategory = {
        ...newPosts,
        channels: { ...newPosts.channels, push: { default: false, locked: true } },
      };
      const resolved = resolveChannels(
        locked,
        [newPostsSetting('push', true, 'spc_announcements')],
        'spc_announcements',
        ALL,
      );
      expect(resolved[1]).toEqual({
        channel: 'push',
        enabled: false,
        source: 'locked',
        locked: true,
      });
    });
  });

  it('returns nothing when no offered channel is configured', () => {
    expect(resolveChannels(comments, [setting('email', true)], null, [])).toEqual([]);
  });
});
