import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_COMMUNITY_CATEGORIES,
  DEFAULT_ORG_CATEGORIES,
  NOTIFICATION_TYPES,
} from '@headless-lms/core/automations';
import { categoryListProblems } from '@headless-lms/core/shared/notification-categories';
import type {
  NotificationChannel,
  PushDevice,
  StoredNotification,
} from '@headless-lms/core/shared/ports';
import {
  buildChannelRegistry,
  buildNotificationRegistries,
  buildNotificationTypeRegistry,
  configuredPushSender,
  emailParams,
  renderPushText,
} from './notification-channels.js';

const defaults = { community: DEFAULT_COMMUNITY_CATEGORIES, org: DEFAULT_ORG_CATEGORIES };

function channel(key: string): NotificationChannel {
  return { key, recipient: async () => null, deliver: async () => ({ deadDeviceIds: [] }) };
}

function notification(over: Partial<StoredNotification> = {}): StoredNotification {
  return {
    id: 'ntf_1',
    orgId: 'org_1',
    userId: 'usr_sarah',
    type: 'comment.created',
    scope: 'space',
    reasons: ['comment_author'],
    matchedReason: 'comment_author',
    category: 'replies_to_my_comments',
    communityId: 'cmy_1',
    spaceId: 'spc_2',
    actorOrgUserId: 'ou_james',
    subject: { type: 'comment', id: 'cmt_1' },
    parent: { type: 'post', id: 'pst_1' },
    display: { postTitle: 'My first recording', commenterName: 'James', excerpt: 'Nice' },
    createdAt: new Date('2026-11-01T09:00:00Z'),
    ...over,
  };
}

describe('notification type registry', () => {
  it('refuses to start when two declarations share a type key', () => {
    expect(() =>
      buildNotificationTypeRegistry(
        [...NOTIFICATION_TYPES, { ...NOTIFICATION_TYPES[0]! }],
        defaults,
        ['inApp'],
      ),
    ).toThrow(/post.published is declared twice/);
  });

  it('lists each type with its scopes and reasons, and gets a whole declaration', () => {
    const registry = buildNotificationTypeRegistry(NOTIFICATION_TYPES, defaults, ['inApp']);
    expect(registry.list()).toHaveLength(NOTIFICATION_TYPES.length);
    expect(registry.list().find((t) => t.type === 'comment.created')).toEqual({
      type: 'comment.created',
      scopes: ['space', 'org'],
      reasons: ['post_author', 'comment_author', 'follower', 'thread_participant'],
    });
    expect(registry.get('mention')?.push?.chat?.title).toContain('{{chatTitle}}');
    expect(registry.get('post.liked')).toBeUndefined();
  });

  it('offers only the configured channels in the defaults, which still validate', () => {
    const registry = buildNotificationTypeRegistry(NOTIFICATION_TYPES, defaults, [
      'inApp',
      'email',
    ]);
    const community = registry.defaults('community');
    expect(community.find((c) => c.key === 'mentions')?.channels).toEqual({
      inApp: { default: true, locked: false },
      email: { default: true, locked: false },
    });
    expect(categoryListProblems(community, 'community', registry, ['inApp', 'email'])).toEqual([]);
    expect(
      categoryListProblems(registry.defaults('org'), 'org', registry, ['inApp', 'email']),
    ).toEqual([]);
    community[0]!.key = 'changed';
    expect(registry.defaults('community')[0]?.key).toBe('about_you');
  });
});

describe('channel registry', () => {
  it('lists in-app first, then the adapter channels in order, and gets only adapter channels', () => {
    const email = channel('email');
    const registry = buildChannelRegistry([email, channel('sms')]);
    expect(registry.list()).toEqual(['inApp', 'email', 'sms']);
    expect(registry.get('email')).toBe(email);
    expect(registry.get('inApp')).toBeUndefined();
  });

  it('refuses a channel key used twice, in-app included', () => {
    expect(() => buildChannelRegistry([channel('email'), channel('email')])).toThrow(/twice/);
    expect(() => buildChannelRegistry([channel('inApp')])).toThrow(/twice/);
  });

  it('registers email only when a mailer is configured', () => {
    const without = buildNotificationRegistries({
      declarations: NOTIFICATION_TYPES,
      defaults,
      mailer: null,
      emailOf: async () => null,
      push: null,
      channels: [],
    });
    expect(without.channels.list()).toEqual(['inApp']);
    expect(without.types.defaults('org').find((c) => c.key === 'access')?.channels).toEqual({
      inApp: { default: true, locked: false },
    });
    const withMailer = buildNotificationRegistries({
      declarations: NOTIFICATION_TYPES,
      defaults,
      mailer: { send: vi.fn() },
      emailOf: async () => null,
      push: null,
      channels: [channel('sms')],
    });
    expect(withMailer.channels.list()).toEqual(['inApp', 'email', 'sms']);
  });
});

describe('email channel', () => {
  it('addresses the person by their email and renders the template the matched reason selects', async () => {
    const send = vi.fn();
    const { channels } = buildNotificationRegistries({
      declarations: NOTIFICATION_TYPES,
      defaults,
      mailer: { send },
      emailOf: async (_orgId, userId) => (userId === 'usr_sarah' ? 'sarah@example.com' : null),
      push: null,
      channels: [],
    });
    const email = channels.get('email')!;
    await expect(email.recipient('org_1', 'usr_nobody')).resolves.toBeNull();
    const to = await email.recipient('org_1', 'usr_sarah');
    expect(to).toEqual({ email: 'sarah@example.com' });
    await expect(email.deliver(notification(), to!)).resolves.toEqual({ deadDeviceIds: [] });
    expect(send).toHaveBeenCalledWith('sarah@example.com', 'replyToYourComment', {
      commentId: 'cmt_1',
      postId: 'pst_1',
      communityId: 'cmy_1',
      spaceId: 'spc_2',
      postTitle: 'My first recording',
      commenterName: 'James',
      excerpt: 'Nice',
    });
    await email.deliver(notification({ matchedReason: 'post_author' }), to!);
    expect(send).toHaveBeenLastCalledWith(
      'sarah@example.com',
      'newCommentOnPost',
      expect.anything(),
    );
  });

  it('takes the content id from a content subject', () => {
    expect(
      emailParams(
        notification({
          type: 'access.granted',
          scope: 'org',
          communityId: null,
          spaceId: null,
          subject: { type: 'course', id: 'crs_1' },
          parent: null,
          display: { contentTitle: 'Spanish in 90 Days', contentType: 'course' },
        }),
      ),
    ).toEqual({
      courseId: 'crs_1',
      contentId: 'crs_1',
      contentTitle: 'Spanish in 90 Days',
      contentType: 'course',
    });
  });
});

describe('push channel', () => {
  const iphone: PushDevice = {
    id: 'dev_1',
    provider: 'apns',
    token: 'apns-token',
    p256dh: null,
    auth: null,
    appId: 'com.spanishin90days.app',
    environment: 'production',
  };

  function registries(devices: PushDevice[], send = vi.fn(async () => ({ deadDeviceIds: [] }))) {
    const activeDevices = vi.fn(async () => devices);
    const built = buildNotificationRegistries({
      declarations: NOTIFICATION_TYPES,
      defaults,
      mailer: { send: vi.fn() },
      emailOf: async () => null,
      push: { sender: { send }, activeDevices },
      channels: [channel('sms')],
    });
    return { ...built, send, activeDevices };
  }

  it('is registered after email when push is configured, and the defaults offer it', () => {
    const { channels, types } = registries([]);
    expect(channels.list()).toEqual(['inApp', 'email', 'push', 'sms']);
    expect(types.defaults('community').find((c) => c.key === 'mentions')?.channels).toEqual({
      inApp: { default: true, locked: false },
      email: { default: true, locked: false },
      push: { default: true, locked: false },
    });
  });

  it('addresses the devices seen in the last 30 days, and nobody without one', async () => {
    const { channels, activeDevices } = registries([iphone]);
    const push = channels.get('push')!;
    const before = Date.now();
    await expect(push.recipient('org_1', 'usr_sarah')).resolves.toEqual({ devices: [iphone] });
    const since = (activeDevices.mock.calls[0] as unknown as [string, string, Date])[2];
    expect(activeDevices).toHaveBeenCalledWith('org_1', 'usr_sarah', since);
    expect(before - since.getTime()).toBeGreaterThanOrEqual(30 * 24 * 60 * 60 * 1000 - 1000);
    expect(before - since.getTime()).toBeLessThanOrEqual(30 * 24 * 60 * 60 * 1000 + 1000);
    const { channels: none } = registries([]);
    await expect(none.get('push')!.recipient('org_1', 'usr_sarah')).resolves.toBeNull();
  });

  it("renders the type's push text from display and sends it with the notification's references", async () => {
    const send = vi.fn(async () => ({ deadDeviceIds: ['dev_2'] }));
    const { channels } = registries([iphone], send);
    const push = channels.get('push')!;
    await expect(
      push.deliver(
        notification({
          type: 'mention',
          scope: 'space',
          matchedReason: 'mentioned',
          display: { authorName: 'James', excerpt: 'See you at practice', postTitle: 'Week 3' },
        }),
        { devices: [iphone] },
      ),
    ).resolves.toEqual({ deadDeviceIds: ['dev_2'] });
    expect(send).toHaveBeenCalledWith([iphone], {
      title: 'James mentioned you in Week 3',
      body: 'See you at practice',
      data: {
        notificationId: 'ntf_1',
        type: 'mention',
        subject: { type: 'comment', id: 'cmt_1' },
        parent: { type: 'post', id: 'pst_1' },
        communityId: 'cmy_1',
        spaceId: 'spc_2',
      },
    });
  });

  it('throws for a type with no push text in the scope', async () => {
    const { channels } = registries([iphone]);
    await expect(
      channels.get('push')!.deliver(notification({ type: 'post.liked' }), { devices: [iphone] }),
    ).rejects.toThrow('no push text for post.liked in space');
  });

  it('is used only when at least one provider is configured', () => {
    const sender = { send: vi.fn() };
    expect(configuredPushSender({}, sender)).toBeNull();
    expect(configuredPushSender({ apns: undefined }, sender)).toBeNull();
    expect(
      configuredPushSender({ webpush: { publicKey: 'p', privateKey: 'k', subject: 's' } }, sender),
    ).toBe(sender);
    expect(
      configuredPushSender(
        { webpush: { publicKey: 'p', privateKey: 'k', subject: 's' } },
        undefined,
      ),
    ).toBeNull();
  });

  it('joins a list of strings and leaves out what is not text', () => {
    expect(
      renderPushText('{{adderName}} added you with {{participantNames}}{{posts}}{{missing}}', {
        adderName: 'Emma',
        participantNames: ['Sarah', 'James'],
        posts: [{ postId: 'pst_1' }],
      }),
    ).toBe('Emma added you with Sarah, James');
  });
});
