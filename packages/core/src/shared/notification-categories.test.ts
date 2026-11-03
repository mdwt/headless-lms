import { describe, expect, it } from 'vitest';
import {
  assertValidCategoryList,
  categoryListProblems,
  offeringConfigured,
  storedCategoryList,
  typesForList,
} from './notification-categories.js';
import { ValidationError } from './errors.js';
import type { NotificationCategory, NotificationTypeDeclaration } from '../types/index.js';

const DECLARATIONS: NotificationTypeDeclaration[] = [
  {
    type: 'comment.created',
    scopes: ['space', 'org'],
    reasons: ['post_author', 'comment_author', 'follower'],
    display: { space: ['postTitle'], org: ['activityTitle'] },
  },
  {
    type: 'post.published',
    scopes: ['space'],
    reasons: ['space_member'],
    display: { space: ['postTitle'] },
  },
  {
    type: 'message.sent',
    scopes: ['chat'],
    reasons: ['participant'],
    display: { chat: ['chatTitle'] },
  },
  {
    type: 'access.granted',
    scopes: ['org'],
    reasons: ['subject'],
    display: { org: ['contentTitle'] },
  },
  {
    type: 'digest',
    scopes: ['community'],
    reasons: ['community_member'],
    display: { community: ['communityTitle'] },
  },
];

const types = {
  get: (type: string) => DECLARATIONS.find((declaration) => declaration.type === type),
  list: () => DECLARATIONS.map(({ type, scopes, reasons }) => ({ type, scopes, reasons })),
};

const configured = ['inApp', 'email', 'push'];
const on = { default: true, locked: false };

function category(over: Partial<NotificationCategory> = {}): NotificationCategory {
  return {
    key: 'comments_on_my_posts',
    covers: [{ type: 'comment.created', reasons: ['post_author'] }],
    channels: { inApp: on, email: on },
    ...over,
  };
}

describe('category list validation', () => {
  it('accepts a valid community list', () => {
    expect(
      categoryListProblems(
        [
          category(),
          category({
            key: 'new_posts',
            perSpace: true,
            covers: [{ type: 'post.published', reasons: ['space_member'] }],
            spaceDefaults: { spc_1: { inApp: true } },
          }),
        ],
        'community',
        types,
        configured,
      ),
    ).toEqual([]);
  });

  it('refuses a repeated key', () => {
    const problems = categoryListProblems(
      [category(), category({ covers: [{ type: 'comment.created', reasons: ['follower'] }] })],
      'community',
      types,
      configured,
    );
    expect(problems).toEqual([
      'categories[1] (comments_on_my_posts): the key is used by an earlier category',
    ]);
  });

  it('refuses a type the list cannot cover, and a type that does not exist', () => {
    expect(
      categoryListProblems(
        [category({ key: 'access', covers: [{ type: 'access.granted', reasons: ['subject'] }] })],
        'community',
        types,
        configured,
      ),
    ).toEqual(['categories[0] (access).covers[0]: access.granted cannot be in the community list']);
    expect(
      categoryListProblems(
        [category({ key: 'chat', covers: [{ type: 'message.sent', reasons: ['participant'] }] })],
        'org',
        types,
        configured,
      ),
    ).toEqual(['categories[0] (chat).covers[0]: message.sent cannot be in the org list']);
    expect(
      categoryListProblems(
        [category({ covers: [{ type: 'post.liked', reasons: ['post_author'] }] })],
        'community',
        types,
        configured,
      ),
    ).toEqual([
      'categories[0] (comments_on_my_posts).covers[0]: post.liked is not a notification type',
    ]);
  });

  it('lets a type with an org scope and a space scope into both lists', () => {
    expect(categoryListProblems([category()], 'org', types, configured)).toEqual([]);
    expect(categoryListProblems([category()], 'community', types, configured)).toEqual([]);
  });

  it('refuses a reason the type does not allow', () => {
    expect(
      categoryListProblems(
        [category({ covers: [{ type: 'comment.created', reasons: ['mentioned'] }] })],
        'community',
        types,
        configured,
      ),
    ).toEqual([
      'categories[0] (comments_on_my_posts).covers[0]: comment.created does not allow the reason mentioned',
    ]);
  });

  it('refuses a channel that is not configured', () => {
    expect(
      categoryListProblems([category({ channels: { push: on } })], 'community', types, [
        'inApp',
        'email',
      ]),
    ).toEqual(['categories[0] (comments_on_my_posts): the channel push is not configured']);
  });

  it('refuses perSpace on a type that cannot occur in a space, and on the org list', () => {
    expect(
      categoryListProblems(
        [
          category({
            key: 'digest',
            perSpace: true,
            covers: [{ type: 'digest', reasons: ['community_member'] }],
          }),
        ],
        'community',
        types,
        configured,
      ),
    ).toEqual([
      'categories[0] (digest).covers[0]: digest cannot occur in a space, so it cannot be per space',
    ]);
    expect(categoryListProblems([category({ perSpace: true })], 'org', types, configured)).toEqual([
      'categories[0] (comments_on_my_posts): only a community list can have a per-space category',
    ]);
  });

  it('refuses spaceDefaults without perSpace, or naming a channel the category does not offer', () => {
    expect(
      categoryListProblems(
        [category({ spaceDefaults: { spc_1: { inApp: true } } })],
        'community',
        types,
        configured,
      ),
    ).toEqual(['categories[0] (comments_on_my_posts): spaceDefaults needs perSpace']);
    expect(
      categoryListProblems(
        [
          category({
            key: 'new_posts',
            perSpace: true,
            covers: [{ type: 'post.published', reasons: ['space_member'] }],
            spaceDefaults: { spc_unknown: { push: true } },
          }),
        ],
        'community',
        types,
        configured,
      ),
    ).toEqual([
      'categories[0] (new_posts): spaceDefaults for spc_unknown names the channel push, which the category does not offer',
    ]);
  });

  it('refuses a category whose every pair earlier categories already cover', () => {
    const problems = categoryListProblems(
      [
        category({
          key: 'all_comments',
          covers: [{ type: 'comment.created', reasons: ['post_author', 'follower'] }],
        }),
        category({ key: 'followed', covers: [{ type: 'comment.created', reasons: ['follower'] }] }),
        category({
          key: 'replies',
          covers: [{ type: 'comment.created', reasons: ['follower', 'comment_author'] }],
        }),
      ],
      'community',
      types,
      configured,
    );
    expect(problems).toEqual([
      'categories[1] (followed): earlier categories already cover everything it covers',
    ]);
  });

  it('throws a ValidationError listing every problem', () => {
    try {
      assertValidCategoryList(
        [category({ channels: { sms: on } }), category()],
        'community',
        types,
        configured,
      );
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).problems).toHaveLength(3);
    }
  });
});

describe('category list helpers', () => {
  it('lists the types a list of a scope can cover, with all their scopes', () => {
    expect(typesForList(types, 'org').map((t) => t.type)).toEqual([
      'comment.created',
      'access.granted',
    ]);
    expect(typesForList(types, 'community').map((t) => t.type)).toEqual([
      'comment.created',
      'post.published',
      'message.sent',
      'digest',
    ]);
    expect(typesForList(types, 'org')[0]?.scopes).toEqual(['space', 'org']);
  });

  it('keeps only the configured channels of each category', () => {
    expect(
      offeringConfigured([category({ channels: { inApp: on, push: on } })], ['inApp', 'email']),
    ).toEqual([category({ channels: { inApp: on } })]);
  });

  it('reads a stored list, null for none, and throws on a list that is not one', () => {
    expect(storedCategoryList(null)).toBeNull();
    expect(storedCategoryList(undefined)).toBeNull();
    expect(storedCategoryList([category()])).toEqual([category()]);
    expect(() => storedCategoryList([{ key: 'Bad Key' }])).toThrow(/invalid/);
  });
});
