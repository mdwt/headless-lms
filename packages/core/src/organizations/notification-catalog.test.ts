import { describe, expect, it } from 'vitest';
import { NotificationCatalog } from './notification-catalog.js';
import { actorWith } from './testing.js';
import { ForbiddenError } from '../shared/errors.js';
import type { NotificationCategory, NotificationTypeDeclaration } from '../types/index.js';

const DECLARATIONS: NotificationTypeDeclaration[] = [
  { type: 'post.published', scopes: ['space'], reasons: ['space_member'], display: {} },
  { type: 'access.granted', scopes: ['org'], reasons: ['subject'], display: {} },
];

const ORG_DEFAULT: NotificationCategory[] = [
  { key: 'access', covers: [{ type: 'access.granted', reasons: ['subject'] }], channels: {} },
];
const COMMUNITY_DEFAULT: NotificationCategory[] = [
  {
    key: 'new_posts',
    covers: [{ type: 'post.published', reasons: ['space_member'] }],
    channels: {},
  },
];

const catalog = new NotificationCatalog({
  types: {
    list: () => DECLARATIONS,
    get: (type) => DECLARATIONS.find((declaration) => declaration.type === type),
    defaults: (scope) => (scope === 'org' ? ORG_DEFAULT : COMMUNITY_DEFAULT),
  },
  channels: { list: () => ['inApp', 'email'] },
});

describe('NotificationCatalog', () => {
  it('serves every scope to notification_categories:read', () => {
    const admin = actorWith({ org: ['notification_categories:read'] });
    expect(catalog.types(admin, 'org').map((t) => t.type)).toEqual(['access.granted']);
    expect(catalog.types(admin, 'community').map((t) => t.type)).toEqual(['post.published']);
    expect(catalog.channels(admin)).toEqual([{ channel: 'inApp' }, { channel: 'email' }]);
    expect(catalog.defaults(admin, 'org')).toEqual(ORG_DEFAULT);
  });

  it('serves the community scope and the channels to an editor of one community', () => {
    const editor = actorWith({ content: { cmy_1: ['communities:write'] } });
    expect(catalog.types(editor, 'community')).toHaveLength(1);
    expect(catalog.channels(editor)).toHaveLength(2);
    expect(catalog.defaults(editor, 'community')).toEqual(COMMUNITY_DEFAULT);
    expect(() => catalog.types(editor, 'org')).toThrow(ForbiddenError);
    expect(() => catalog.defaults(editor, 'org')).toThrow(ForbiddenError);
  });

  it('refuses everything to an actor who holds nothing', () => {
    const nobody = actorWith();
    expect(() => catalog.types(nobody, 'community')).toThrow(ForbiddenError);
    expect(() => catalog.channels(nobody)).toThrow(ForbiddenError);
    expect(() => catalog.defaults(nobody, 'community')).toThrow(ForbiddenError);
  });
});
