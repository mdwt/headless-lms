import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_COMMUNITY_CATEGORIES,
  DEFAULT_ORG_CATEGORIES,
  NOTIFICATION_TYPES,
} from '@headless-lms/core/automations';
import { categoryListProblems } from '@headless-lms/core/shared/notification-categories';
import type { NotificationChannel, StoredNotification } from '@headless-lms/core/shared/ports';
import {
  buildChannelRegistry,
  buildNotificationRegistries,
  buildNotificationTypeRegistry,
  emailParams,
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
