import { describe, expect, it } from 'vitest';
import { NOTIFICATION_TYPES } from './types.js';
import { DEFAULT_COMMUNITY_CATEGORIES, DEFAULT_ORG_CATEGORIES } from './defaults.js';
import {
  categoryListProblems,
  offeringConfigured,
  type CategoryListScope,
} from '../../shared/notification-categories.js';
import { ALL_EMAIL_TEMPLATE_IDS } from '../catalog.js';
import type { Scope } from '../../types/index.js';

const types = {
  get: (type: string) => NOTIFICATION_TYPES.find((declaration) => declaration.type === type),
};
const ALL_CHANNELS = ['inApp', 'email', 'push'];
const LISTS: [CategoryListScope, typeof DEFAULT_ORG_CATEGORIES][] = [
  ['community', DEFAULT_COMMUNITY_CATEGORIES],
  ['org', DEFAULT_ORG_CATEGORIES],
];
const OBJECT_LISTS = ['posts', 'communities'];

describe('notification type declarations', () => {
  it('declares every type once, with a lower case key', () => {
    const keys = NOTIFICATION_TYPES.map((declaration) => declaration.type);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(key).toMatch(/^[a-z][a-z0-9_.]{0,63}$/);
    }
    expect(keys).toHaveLength(32);
  });

  it.each(NOTIFICATION_TYPES.map((declaration) => [declaration.type, declaration] as const))(
    '%s declares display keys, an email template and a push text for each of its scopes',
    (_type, declaration) => {
      const scopes = Object.keys(declaration.display) as Scope[];
      expect(scopes.sort()).toEqual([...declaration.scopes].sort());
      for (const scope of declaration.scopes) {
        const keys = declaration.display[scope] ?? [];
        expect(keys.length).toBeGreaterThan(0);
        const email = declaration.email?.[scope];
        expect(email).toBeDefined();
        expect(ALL_EMAIL_TEMPLATE_IDS[email!.template]).toBe(true);
        for (const reason of Object.keys(email!.byReason ?? {})) {
          expect(declaration.reasons).toContain(reason);
        }
        const push = declaration.push?.[scope];
        expect(push).toBeDefined();
        const placeholders = [...`${push!.title} ${push!.body}`.matchAll(/\{\{(\w+)\}\}/g)].map(
          (match) => match[1],
        );
        for (const placeholder of placeholders) {
          expect(keys).toContain(placeholder);
          expect(OBJECT_LISTS).not.toContain(placeholder);
        }
      }
      expect(Object.keys(declaration.email ?? {}).sort()).toEqual([...declaration.scopes].sort());
      expect(Object.keys(declaration.push ?? {}).sort()).toEqual([...declaration.scopes].sort());
    },
  );

  it('picks the reply template for a comment author on a post', () => {
    expect(types.get('comment.created')?.email?.space).toEqual({
      template: 'newCommentOnPost',
      byReason: { comment_author: 'replyToYourComment' },
    });
  });
});

describe('default category lists', () => {
  it.each(LISTS)('the %s list passes validation with every channel configured', (scope, list) => {
    expect(categoryListProblems(list, scope, types, ALL_CHANNELS)).toEqual([]);
  });

  it.each(LISTS)(
    'the %s list passes validation offering only the in-app channel',
    (scope, list) => {
      const inAppOnly = offeringConfigured(list, ['inApp']);
      expect(categoryListProblems(inAppOnly, scope, types, ['inApp'])).toEqual([]);
      for (const category of inAppOnly) {
        expect(Object.keys(category.channels).every((channel) => channel === 'inApp')).toBe(true);
      }
    },
  );

  it.each(LISTS)(
    'every cover of the %s list names a declared type and allowed reasons',
    (_s, list) => {
      for (const category of list) {
        for (const cover of category.covers) {
          const declaration = types.get(cover.type);
          expect(declaration, cover.type).toBeDefined();
          for (const reason of cover.reasons) {
            expect(declaration!.reasons).toContain(reason);
          }
        }
      }
    },
  );

  it('covers every declared type and reason in one default list or the other', () => {
    const covered = new Set(
      [...DEFAULT_COMMUNITY_CATEGORIES, ...DEFAULT_ORG_CATEGORIES].flatMap((category) =>
        category.covers.flatMap((cover) =>
          cover.reasons.map((reason) => `${cover.type}:${reason}`),
        ),
      ),
    );
    const declared = NOTIFICATION_TYPES.flatMap((declaration) =>
      declaration.reasons.map((reason) => `${declaration.type}:${reason}`),
    );
    expect(declared.filter((pair) => !covered.has(pair))).toEqual([]);
  });

  it('orders the community list as the spec does, mentions before comments on my posts', () => {
    expect(DEFAULT_COMMUNITY_CATEGORIES.map((category) => category.key)).toEqual([
      'about_you',
      'review',
      'mentions',
      'comments_on_my_posts',
      'replies_to_my_comments',
      'followed_posts',
      'messages',
      'likes_on_my_posts',
      'likes_on_my_comments',
      'new_posts',
      'digest',
    ]);
    expect(DEFAULT_ORG_CATEGORIES.map((category) => category.key)).toEqual([
      'about_you',
      'review',
      'mentions',
      'replies_to_my_comments',
      'followed_threads',
      'likes_on_my_comments',
      'access',
      'events',
      'course_content',
    ]);
  });

  it('files every event notification under events, in-app locked on, email and push on', () => {
    const events = DEFAULT_ORG_CATEGORIES.find((c) => c.key === 'events');
    expect(events?.covers).toEqual(
      [
        'event.granted',
        'event.starting_soon',
        'event.changed',
        'event.canceled',
        'event.revoked',
      ].map((type) => ({ type, reasons: ['event_member'] })),
    );
    expect(events?.channels).toEqual({
      inApp: { default: true, locked: true },
      email: { default: true, locked: false },
      push: { default: true, locked: false },
    });
    for (const type of events?.covers ?? []) {
      expect(types.get(type.type)?.scopes).toEqual(['org']);
    }
  });

  it('locks in-app on for about_you and email on for access, and leaves new posts off', () => {
    expect(DEFAULT_COMMUNITY_CATEGORIES[0]?.channels.inApp).toEqual({
      default: true,
      locked: true,
    });
    expect(DEFAULT_ORG_CATEGORIES.find((c) => c.key === 'access')?.channels).toEqual({
      inApp: { default: true, locked: false },
      email: { default: true, locked: true },
    });
    const newPosts = DEFAULT_COMMUNITY_CATEGORIES.find((c) => c.key === 'new_posts');
    expect(newPosts?.perSpace).toBe(true);
    expect(Object.values(newPosts?.channels ?? {}).every((channel) => !channel.default)).toBe(true);
    expect(DEFAULT_COMMUNITY_CATEGORIES.find((c) => c.key === 'digest')?.channels).toEqual({
      email: { default: true, locked: false },
    });
  });
});
