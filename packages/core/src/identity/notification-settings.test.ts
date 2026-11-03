import { describe, expect, it } from 'vitest';
import { NotificationSettingsServiceImpl } from './notification-settings.js';
import type { NotificationSettingsRepository, SettingKey } from './ports.js';
import { NotFoundError, ValidationError } from '../shared/errors.js';
import type { NotificationCategory, StoredSetting } from '../types/index.js';

const on = { default: true, locked: false };

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
    channels: { inApp: on, push: on },
  },
];

const ORG: NotificationCategory[] = [
  {
    key: 'course_content',
    covers: [{ type: 'course.activity_added', reasons: ['course_member'] }],
    channels: { inApp: on, email: on },
  },
];

type Row = StoredSetting & { userId: string };

function sameKey(row: Row, key: SettingKey): boolean {
  return (
    row.communityId === key.communityId &&
    row.spaceId === key.spaceId &&
    row.category === key.category &&
    row.channel === key.channel
  );
}

function harness(options: { canOpen?: boolean } = {}) {
  const rows: Row[] = [];
  const orgUserOf: Record<string, string> = { usr_sarah: 'ou_sarah', usr_james: 'ou_james' };
  const repo: NotificationSettingsRepository = {
    forUsers: async (_orgId, userIds, communityId, categories) =>
      rows.filter(
        (row) =>
          userIds.includes(row.userId) &&
          row.communityId === communityId &&
          (categories === null || categories.includes(row.category)),
      ),
    apply: async (_orgId, userId, upserts, deletes) => {
      for (const key of deletes) {
        const index = rows.findIndex((row) => row.userId === userId && sameKey(row, key));
        if (index >= 0) {
          rows.splice(index, 1);
        }
      }
      for (const upsert of upserts) {
        const existing = rows.find((row) => row.userId === userId && sameKey(row, upsert));
        if (existing) {
          existing.enabled = upsert.enabled;
        } else {
          rows.push({ ...upsert, userId });
        }
      }
    },
    switchedOn: async (_orgId, communityId, category, spaceId) => [
      ...new Set(
        rows
          .filter(
            (row) =>
              row.enabled &&
              row.communityId === communityId &&
              row.category === category &&
              (row.spaceId === null || row.spaceId === spaceId),
          )
          .map((row) => orgUserOf[row.userId]!),
      ),
    ],
  };
  const service = new NotificationSettingsServiceImpl({
    repo,
    categories: {
      communityList: async () => COMMUNITY,
      orgList: async () => ORG,
    },
    access: { canOpen: async () => options.canOpen ?? true },
    channels: { list: () => ['inApp', 'email', 'push'] },
  });
  return { service, rows };
}

const sarah = { id: 'ou_sarah', role: 'student' as const, userId: 'usr_sarah' };
const james = { id: 'ou_james', role: 'student' as const, userId: 'usr_james' };
const cohort = { communityId: 'cmy_1' };

describe('notification settings', () => {
  it('stores one row per explicit choice and reads them back per community', async () => {
    const { service } = harness();
    await service.set('org_1', sarah, cohort, [
      { category: 'mentions', channel: 'email', enabled: false },
      { category: 'new_posts', spaceId: 'spc_1', channel: 'push', enabled: true },
    ]);
    await expect(service.get('org_1', 'usr_sarah', cohort)).resolves.toEqual([
      {
        communityId: 'cmy_1',
        spaceId: null,
        category: 'mentions',
        channel: 'email',
        enabled: false,
      },
      {
        communityId: 'cmy_1',
        spaceId: 'spc_1',
        category: 'new_posts',
        channel: 'push',
        enabled: true,
      },
    ]);
    await expect(service.get('org_1', 'usr_sarah', { communityId: 'cmy_2' })).resolves.toEqual([]);
    await expect(service.get('org_1', 'usr_sarah', 'org')).resolves.toEqual([]);
  });

  it('changes a stored value in place and deletes it on enabled null', async () => {
    const { service, rows } = harness();
    await service.set('org_1', sarah, cohort, [
      { category: 'mentions', channel: 'email', enabled: false },
    ]);
    await service.set('org_1', sarah, cohort, [
      { category: 'mentions', channel: 'email', enabled: true },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.enabled).toBe(true);
    await service.set('org_1', sarah, cohort, [
      { category: 'mentions', channel: 'email', enabled: null },
    ]);
    expect(rows).toEqual([]);
  });

  it('keeps the last of two changes to one setting in a request', async () => {
    const { service, rows } = harness();
    await service.set('org_1', sarah, cohort, [
      { category: 'mentions', channel: 'push', enabled: false },
      { category: 'mentions', channel: 'push', enabled: true },
    ]);
    expect(rows.map((row) => row.enabled)).toEqual([true]);
  });

  it('stores org settings with no community, against the org list', async () => {
    const { service } = harness();
    await service.set('org_1', sarah, 'org', [
      { category: 'course_content', channel: 'email', enabled: true },
    ]);
    await expect(service.get('org_1', 'usr_sarah', 'org')).resolves.toEqual([
      {
        communityId: null,
        spaceId: null,
        category: 'course_content',
        channel: 'email',
        enabled: true,
      },
    ]);
    await expect(
      service.set('org_1', sarah, 'org', [
        { category: 'mentions', channel: 'email', enabled: true },
      ]),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('answers not found when the person cannot open the community', async () => {
    const { service, rows } = harness({ canOpen: false });
    await expect(
      service.set('org_1', sarah, cohort, [
        { category: 'mentions', channel: 'email', enabled: false },
      ]),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(rows).toEqual([]);
  });

  it.each([
    [
      { category: 'likes', channel: 'email', enabled: false },
      { path: 'settings[1].category', message: 'there is no category likes' },
    ],
    [
      { category: 'new_posts', channel: 'email', enabled: true },
      { path: 'settings[1].channel', message: 'new_posts does not offer the channel email' },
    ],
    [
      { category: 'about_you', channel: 'inApp', enabled: false },
      { path: 'settings[1].channel', message: 'the channel inApp of about_you is locked' },
    ],
    [
      { category: 'mentions', spaceId: 'spc_1', channel: 'push', enabled: true },
      { path: 'settings[1].spaceId', message: 'mentions cannot be set per space' },
    ],
  ])('refuses %o with 422, naming the field', async (change, problem) => {
    const { service, rows } = harness();
    const attempt = service.set('org_1', sarah, cohort, [
      { category: 'mentions', channel: 'email', enabled: false },
      change,
    ]);
    await expect(attempt).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt).rejects.toThrow(`${problem.path}: ${problem.message}`);
    await expect(attempt).rejects.toMatchObject({ problems: [problem] });
    expect(rows).toEqual([]);
  });

  it('refuses a channel the category offers that the deployment does not have', async () => {
    const configuredWithoutPush = new NotificationSettingsServiceImpl({
      repo: { forUsers: async () => [], apply: async () => {}, switchedOn: async () => [] },
      categories: { communityList: async () => COMMUNITY, orgList: async () => ORG },
      access: { canOpen: async () => true },
      channels: { list: () => ['inApp', 'email'] },
    });
    await expect(
      configuredWithoutPush.set('org_1', sarah, cohort, [
        { category: 'mentions', channel: 'push', enabled: true },
      ]),
    ).rejects.toThrow(/does not offer the channel push/);
  });

  it('reads many people at once, keyed by user id, for the categories asked', async () => {
    const { service } = harness();
    await service.set('org_1', sarah, cohort, [
      { category: 'mentions', channel: 'email', enabled: false },
      { category: 'new_posts', channel: 'push', enabled: true },
    ]);
    await service.set('org_1', james, cohort, [
      { category: 'new_posts', spaceId: 'spc_1', channel: 'inApp', enabled: true },
    ]);
    const many = await service.getMany('org_1', ['usr_sarah', 'usr_james', 'usr_emma'], cohort, [
      'new_posts',
    ]);
    expect(Object.keys(many).sort()).toEqual(['usr_emma', 'usr_james', 'usr_sarah']);
    expect(many.usr_sarah?.map((s) => s.category)).toEqual(['new_posts']);
    expect(many.usr_james?.map((s) => s.spaceId)).toEqual(['spc_1']);
    expect(many.usr_emma).toEqual([]);
    await expect(service.getMany('org_1', ['usr_sarah'], cohort, [])).resolves.toEqual({
      usr_sarah: [],
    });
  });

  it('lists who switched a category on for a space or for all spaces, as org-user ids', async () => {
    const { service } = harness();
    await service.set('org_1', sarah, cohort, [
      { category: 'new_posts', channel: 'push', enabled: true },
    ]);
    await service.set('org_1', james, cohort, [
      { category: 'new_posts', spaceId: 'spc_1', channel: 'inApp', enabled: true },
      { category: 'new_posts', spaceId: 'spc_2', channel: 'inApp', enabled: false },
    ]);
    await expect(service.switchedOn('org_1', 'cmy_1', 'new_posts', 'spc_1')).resolves.toEqual([
      'ou_sarah',
      'ou_james',
    ]);
    await expect(service.switchedOn('org_1', 'cmy_1', 'new_posts', 'spc_2')).resolves.toEqual([
      'ou_sarah',
    ]);
    await expect(service.switchedOn('org_1', 'cmy_1', 'new_posts', null)).resolves.toEqual([
      'ou_sarah',
    ]);
  });
});
