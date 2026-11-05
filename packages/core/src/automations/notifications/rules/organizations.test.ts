import { describe, expect, it } from 'vitest';
import { organizationEvents } from '../../../organizations/index.js';
import type { DomainEvent } from '../../../shared/ports.js';
import { emptyCommunityMail } from '../../community-mail.js';
import type { NotificationReads } from '../../ports.js';
import type { Permission } from '../../../types/index.js';
import { ORGANIZATION_RULES } from './organizations.js';

const ORG = 'org_1';

function fakeReads(activity = true): NotificationReads {
  return {
    ...emptyCommunityMail,
    threadParticipants: async () => [],
    mutedAmong: async (_o, _i, ids) => ids,
    communityMembers: async () => [],
    switchedOn: async () => [],
    courseHolders: async () => ['ou_sarah', 'ou_james', 'ou_olivia'],
    contentLostBy: async () => [],
    activity: async () =>
      activity
        ? {
            title: 'Rolling r',
            moduleTitle: 'Sounds',
            courseId: 'crs_1',
            courseTitle: 'Spanish in 90 Days',
          }
        : null,
    emailOf: async () => null,
    contentInfo: async () => null,
    message: async () => null,
    postsPublished: async () => [],
    unreadInChat: async () => ({ count: 0, latest: null }),
    userIdsOf: async (_o, ids) => Object.fromEntries(ids.map((id) => [id, `usr_${id.slice(3)}`])),
    memberCommunityTitles: async () => [
      { id: 'cmy_1', title: 'Spring cohort' },
      { id: 'cmy_2', title: 'Summer cohort' },
    ],
  };
}

function ready(
  made: { type: string; version: number; orgId: string; data: unknown },
  metadata?: DomainEvent['metadata'],
): DomainEvent {
  return {
    id: 'evt_1',
    occurredAt: '2026-11-03T09:00:00.000Z',
    type: made.type,
    version: made.version,
    orgId: made.orgId,
    data: made.data,
    ...(metadata ? { metadata } : {}),
  };
}

const ROLES: Record<string, { name: string; permissions: Permission[] }> = {
  member: { name: 'Member', permissions: [] },
  admin: { name: 'Admin', permissions: ['communities:moderate', 'courses:write', 'people:write'] },
  instructor: {
    name: 'Tutor',
    permissions: ['courses:write', 'courses:moderate', 'api_keys:write'],
  },
  moderator: { name: 'Moderator', permissions: ['communities:moderate'] },
};

function withRoles(): NotificationReads {
  return {
    ...fakeReads(),
    role: async (_o, key) => ROLES[key] ?? null,
    orgName: async () => 'Spanish in 90 Days',
    contentInfo: async (_o, item) =>
      'contentId' in item && item.contentId === 'crs_1'
        ? { title: 'Spanish Basics', type: 'course' }
        : null,
  };
}

describe('organization.role.assigned', () => {
  const assigned = (data: {
    roleKey: string;
    previousRoleKey: string | null;
    contentId?: string;
    contentType?: 'course' | 'community';
  }) =>
    ready(
      organizationEvents.roleAssigned.make({
        orgId: ORG,
        data: {
          orgUserId: 'ou_james',
          roleKey: data.roleKey,
          previousRoleKey: data.previousRoleKey,
          contentId: data.contentId ?? null,
          contentType: data.contentType ?? null,
        },
      }),
      { actorOrgUserId: 'ou_sarah' },
    );
  const rule = ORGANIZATION_RULES['organization.role.assigned']!;

  it('tells James he is now Tutor of the course he gained permissions on', async () => {
    const lists = await rule(
      assigned({
        roleKey: 'instructor',
        previousRoleKey: null,
        contentId: 'crs_1',
        contentType: 'course',
      }),
      withRoles(),
    );
    expect(lists).toEqual([
      {
        type: 'role.assigned',
        scope: 'org',
        actorOrgUserId: 'ou_sarah',
        communityId: null,
        spaceId: null,
        subject: null,
        parent: null,
        display: {
          roleName: 'Tutor',
          place: 'of Spanish Basics',
          contentId: 'crs_1',
          contentType: 'course',
        },
        recipients: [{ orgUserId: 'ou_james', userId: 'usr_james', reasons: ['subject'] }],
      },
    ]);
  });

  it('names the org for an org role gained from Member', async () => {
    const [list] = await rule(
      assigned({ roleKey: 'instructor', previousRoleKey: 'member' }),
      withRoles(),
    );
    expect(list?.display).toMatchObject({ roleName: 'Tutor', place: 'in Spanish in 90 Days' });
  });

  it('sends nothing when moving from Admin to Moderator, which gains nothing', async () => {
    expect(
      await rule(assigned({ roleKey: 'moderator', previousRoleKey: 'admin' }), withRoles()),
    ).toEqual([]);
  });

  it('sends nothing on a loss, or for a role key the org no longer has', async () => {
    expect(
      await rule(assigned({ roleKey: 'member', previousRoleKey: 'moderator' }), withRoles()),
    ).toEqual([]);
    expect(
      await rule(assigned({ roleKey: 'role_gone', previousRoleKey: null }), withRoles()),
    ).toEqual([]);
  });

  it('counts only the permissions about the item’s type for a role given on an item', async () => {
    const lists = await rule(
      assigned({
        roleKey: 'moderator',
        previousRoleKey: null,
        contentId: 'crs_1',
        contentType: 'course',
      }),
      withRoles(),
    );
    expect(lists).toEqual([]);
  });
});
