import { describe, expect, it } from 'vitest';
import { contentEvents } from '../../../content/index.js';
import type { DomainEvent } from '../../../shared/ports.js';
import { emptyCommunityMail } from '../../community-mail.js';
import type { NotificationReads } from '../../ports.js';
import { CONTENT_RULES } from './content.js';

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

describe('content.course.activity.published', () => {
  const published = ready(
    contentEvents.activityPublished.make({
      orgId: ORG,
      data: { activityId: 'act_1', moduleId: 'mod_1', courseId: 'crs_1' },
    }),
    { actorOrgUserId: 'ou_olivia' },
  );

  it('tells every course holder about the new activity, in the org', async () => {
    const lists = await CONTENT_RULES['content.course.activity.published']!(published, fakeReads());
    expect(lists).toEqual([
      {
        type: 'course.activity_added',
        scope: 'org',
        actorOrgUserId: 'ou_olivia',
        communityId: null,
        spaceId: null,
        subject: { type: 'activity', id: 'act_1' },
        parent: { type: 'course', id: 'crs_1' },
        display: {
          courseTitle: 'Spanish in 90 Days',
          moduleTitle: 'Sounds',
          activityTitle: 'Rolling r',
        },
        recipients: [
          { orgUserId: 'ou_sarah', userId: 'usr_sarah', reasons: ['course_member'] },
          { orgUserId: 'ou_james', userId: 'usr_james', reasons: ['course_member'] },
        ],
      },
    ]);
  });

  it('tells nobody about an activity that no longer exists', async () => {
    expect(
      await CONTENT_RULES['content.course.activity.published']!(published, fakeReads(false)),
    ).toEqual([]);
  });
});
