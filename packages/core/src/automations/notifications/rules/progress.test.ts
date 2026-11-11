import { describe, expect, it } from 'vitest';
import { progressEvents, type ProgressRecord } from '../../../progress/index.js';
import type { DomainEvent } from '../../../shared/ports.js';
import { emptyCommunityMail } from '../../community-mail.js';
import type { NotificationReads } from '../../ports.js';
import { PROGRESS_RULES } from './progress.js';

const ORG = 'org_1';
const AT = new Date('2026-11-03T09:00:00.000Z');

function fakeReads(course = true): NotificationReads {
  return {
    ...emptyCommunityMail,
    threadParticipants: async () => [],
    mutedAmong: async (_o, _i, ids) => ids,
    communityMembers: async () => [],
    switchedOn: async () => [],
    courseMembers: async () => [],
    event: async () => null,
    eventAttendees: async () => [],
    contentLostBy: async () => [],
    activity: async () => null,
    emailOf: async () => null,
    contentInfo: async () => (course ? { title: 'Spanish in 90 Days', type: 'course' } : null),
    message: async () => null,
    postsPublished: async () => [],
    unreadInChat: async () => ({ count: 0, latest: null }),
    userIdsOf: async (_o, ids) => Object.fromEntries(ids.map((id) => [id, `usr_${id.slice(3)}`])),
  };
}

function completed(targetType: ProgressRecord['targetType'], targetId: string): DomainEvent {
  const made = progressEvents.progressCompleted.make({
    orgId: ORG,
    data: {
      id: 'prg_1',
      orgId: ORG,
      orgUserId: 'ou_sarah',
      targetType,
      targetId,
      startedAt: AT,
      position: null,
      completedAt: AT,
      createdAt: AT,
      updatedAt: AT,
    },
  });
  return { ...made, id: 'evt_1', occurredAt: AT.toISOString() };
}

describe('progress.record.completed', () => {
  const rule = PROGRESS_RULES['progress.record.completed']!;

  it('tells the student who completed the course', async () => {
    expect(await rule(completed('course', 'crs_1'), fakeReads())).toEqual([
      {
        type: 'course.completed',
        scope: 'org',
        actorId: null,
        communityId: null,
        spaceId: null,
        subject: { type: 'course', id: 'crs_1' },
        parent: null,
        display: { courseTitle: 'Spanish in 90 Days' },
        recipients: [{ orgUserId: 'ou_sarah', userId: 'usr_sarah', reasons: ['subject'] }],
      },
    ]);
  });

  it.each(['activity', 'module'] as const)('tells nobody about a completed %s', async (type) => {
    expect(await rule(completed(type, 'tgt_1'), fakeReads())).toEqual([]);
  });

  it('tells nobody about a course that no longer exists', async () => {
    expect(await rule(completed('course', 'crs_1'), fakeReads(false))).toEqual([]);
  });
});
