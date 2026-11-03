import { describe, expect, it } from 'vitest';
import { organizationEvents } from '../../../organizations/index.js';
import type { DomainEvent } from '../../../shared/ports.js';
import { emptyCommunityMail } from '../../community-mail.js';
import type { NotificationReads } from '../../ports.js';
import { ORGANIZATION_RULES } from './organizations.js';

const ORG = 'org_1';
const T = new Date('2026-11-01T00:00:00Z');

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

describe('organization.user.updated', () => {
  const updated = (role: string, actor: string) =>
    ready(
      organizationEvents.orgUserUpdated.make({
        orgId: ORG,
        data: {
          id: 'ou_sarah',
          orgId: ORG,
          userId: 'usr_sarah',
          role: role as 'moderator',
          status: 'active',
          createdAt: T,
          updatedAt: T,
        },
      }),
      { actorOrgUserId: actor },
    );

  it('tells a person they are now a moderator, naming the communities they belong to', async () => {
    const lists = await ORGANIZATION_RULES['organization.user.updated']!(
      updated('moderator', 'ou_olivia'),
      fakeReads(),
    );
    expect(lists).toEqual([
      {
        type: 'moderator.assigned',
        scope: 'org',
        actorOrgUserId: 'ou_olivia',
        communityId: null,
        spaceId: null,
        subject: null,
        parent: null,
        display: { communityTitles: ['Spring cohort', 'Summer cohort'] },
        recipients: [{ orgUserId: 'ou_sarah', userId: 'usr_sarah', reasons: ['subject'] }],
      },
    ]);
  });

  it('sends nothing for another role', async () => {
    expect(
      await ORGANIZATION_RULES['organization.user.updated']!(
        updated('instructor', 'ou_olivia'),
        fakeReads(),
      ),
    ).toEqual([]);
  });
});
