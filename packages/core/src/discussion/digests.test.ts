import { describe, expect, it } from 'vitest';
import type { CommunityDigest, DigestSchedule } from '../content/index.js';
import type { DigestRun } from '../types/index.js';
import type { NewDomainEvent } from '../shared/ports.js';
import { createCapturingLogger } from '../shared/logger.js';
import { DigestServiceImpl, latestDueAt } from './digests.js';
import type { DigestRunRepository, DigestUnitOfWork } from './ports.js';

const daily = (hour: number, timeZone: string): DigestSchedule => ({
  cadence: 'daily',
  weekday: 0,
  hour,
  timeZone,
});
const weekly = (weekday: number, hour: number, timeZone: string): DigestSchedule => ({
  cadence: 'weekly',
  weekday,
  hour,
  timeZone,
});
const at = (iso: string) => new Date(iso);

describe('latestDueAt', () => {
  it('answers today’s slot once it has passed, and yesterday’s before', () => {
    const schedule = daily(7, 'UTC');
    expect(latestDueAt(schedule, at('2026-11-05T08:30:00Z'))).toEqual(at('2026-11-05T07:00:00Z'));
    expect(latestDueAt(schedule, at('2026-11-05T07:00:00Z'))).toEqual(at('2026-11-05T07:00:00Z'));
    expect(latestDueAt(schedule, at('2026-11-05T06:59:59Z'))).toEqual(at('2026-11-04T07:00:00Z'));
  });

  it('reads the hour in the community’s time zone, across daylight saving', () => {
    const schedule = daily(7, 'Europe/Madrid');
    expect(latestDueAt(schedule, at('2026-11-05T09:00:00Z'))).toEqual(at('2026-11-05T06:00:00Z'));
    expect(latestDueAt(schedule, at('2026-03-28T09:00:00Z'))).toEqual(at('2026-03-28T06:00:00Z'));
    expect(latestDueAt(schedule, at('2026-03-29T09:00:00Z'))).toEqual(at('2026-03-29T05:00:00Z'));
    expect(latestDueAt(schedule, at('2026-10-25T09:00:00Z'))).toEqual(at('2026-10-25T06:00:00Z'));
  });

  it('handles zones with a half-hour offset and a local day behind UTC', () => {
    expect(latestDueAt(daily(7, 'Asia/Kolkata'), at('2026-11-05T02:00:00Z'))).toEqual(
      at('2026-11-05T01:30:00Z'),
    );
    expect(latestDueAt(daily(23, 'America/Los_Angeles'), at('2026-11-05T08:00:00Z'))).toEqual(
      at('2026-11-05T07:00:00Z'),
    );
  });

  it('goes back to the schedule’s weekday for a weekly digest', () => {
    const thursday = weekly(4, 7, 'Europe/Madrid');
    expect(latestDueAt(thursday, at('2026-11-02T10:00:00Z'))).toEqual(at('2026-10-29T06:00:00Z'));
    expect(latestDueAt(thursday, at('2026-11-05T06:30:00Z'))).toEqual(at('2026-11-05T06:00:00Z'));
    expect(latestDueAt(thursday, at('2026-11-05T05:59:00Z'))).toEqual(at('2026-10-29T06:00:00Z'));
    expect(latestDueAt(thursday, at('2026-07-02T06:00:00Z'))).toEqual(at('2026-07-02T05:00:00Z'));
  });
});

function harness(communities: CommunityDigest[], initial: DigestRun[] = []) {
  const runs = new Map(initial.map((run) => [`${run.orgId}:${run.communityId}`, { ...run }]));
  const appended: NewDomainEvent[] = [];
  const advances: { orgId: string; communityId: string; dueAt: Date }[] = [];
  let failFor: string | null = null;
  const repo: DigestRunRepository = {
    async listRuns() {
      return [...runs.values()].map((run) => ({ ...run }));
    },
    async advance(orgId, communityId, dueAt) {
      if (communityId === failFor) {
        throw new Error('db down');
      }
      advances.push({ orgId, communityId, dueAt });
      const key = `${orgId}:${communityId}`;
      const existing = runs.get(key);
      if (existing && existing.lastDueAt.getTime() >= dueAt.getTime()) {
        return false;
      }
      runs.set(key, { orgId, communityId, lastDueAt: dueAt });
      return true;
    },
  };
  const uow: DigestUnitOfWork = {
    run: (fn) =>
      fn({
        digests: repo,
        outbox: {
          async append(events: NewDomainEvent[]) {
            appended.push(...events);
          },
        },
      }),
  };
  const { logger, entries } = createCapturingLogger();
  const svc = new DigestServiceImpl({
    schedules: { communitiesWithDigest: async () => communities },
    runs: repo,
    uow,
    logger,
  });
  return {
    svc,
    repo,
    runs,
    appended,
    advances,
    entries,
    failOn(communityId: string) {
      failFor = communityId;
    },
  };
}

const spring: CommunityDigest = {
  orgId: 'org_1',
  communityId: 'cmy_spring',
  digest: weekly(4, 7, 'Europe/Madrid'),
};

describe('DigestService.openDue', () => {
  it('records the latest slot without emitting when the community has no row yet', async () => {
    const { svc, runs, appended } = harness([spring]);
    await svc.openDue(at('2026-11-02T10:00:00Z'));
    expect(runs.get('org_1:cmy_spring')?.lastDueAt).toEqual(at('2026-10-29T06:00:00Z'));
    expect(appended).toEqual([]);
  });

  it('emits discussion.digest.due v2 once for the window when a slot falls due', async () => {
    const { svc, appended, runs } = harness(
      [spring],
      [{ orgId: 'org_1', communityId: 'cmy_spring', lastDueAt: at('2026-10-29T06:00:00Z') }],
    );
    await svc.openDue(at('2026-11-05T06:00:03Z'));
    await svc.openDue(at('2026-11-05T06:00:03Z'));
    await svc.openDue(at('2026-11-05T07:00:00Z'));
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({
      type: 'discussion.digest.due',
      version: 2,
      orgId: 'org_1',
      data: {
        communityId: 'cmy_spring',
        from: at('2026-10-29T06:00:00Z'),
        to: at('2026-11-05T06:00:00Z'),
      },
    });
    expect(runs.get('org_1:cmy_spring')?.lastDueAt).toEqual(at('2026-11-05T06:00:00Z'));
  });

  it('moves past a slot older than an hour without emitting', async () => {
    const { svc, appended, runs } = harness(
      [spring],
      [{ orgId: 'org_1', communityId: 'cmy_spring', lastDueAt: at('2026-10-22T06:00:00Z') }],
    );
    await svc.openDue(at('2026-11-02T10:00:00Z'));
    expect(appended).toEqual([]);
    expect(runs.get('org_1:cmy_spring')?.lastDueAt).toEqual(at('2026-10-29T06:00:00Z'));
  });

  it('emits for a slot exactly one hour old and not one a second older', async () => {
    const onTime = harness(
      [spring],
      [{ orgId: 'org_1', communityId: 'cmy_spring', lastDueAt: at('2026-10-29T06:00:00Z') }],
    );
    await onTime.svc.openDue(at('2026-11-05T07:00:00Z'));
    expect(onTime.appended).toHaveLength(1);
    const late = harness(
      [spring],
      [{ orgId: 'org_1', communityId: 'cmy_spring', lastDueAt: at('2026-10-29T06:00:00Z') }],
    );
    await late.svc.openDue(at('2026-11-05T07:00:01Z'));
    expect(late.appended).toEqual([]);
  });

  it('does not touch a community whose latest slot is already handled', async () => {
    const { svc, advances, appended } = harness(
      [spring],
      [{ orgId: 'org_1', communityId: 'cmy_spring', lastDueAt: at('2026-11-05T06:00:00Z') }],
    );
    await svc.openDue(at('2026-11-05T06:30:00Z'));
    expect(advances).toEqual([]);
    expect(appended).toEqual([]);
  });

  it('emits nothing when a concurrent run moved the row first', async () => {
    const { svc, repo, appended } = harness(
      [spring],
      [{ orgId: 'org_1', communityId: 'cmy_spring', lastDueAt: at('2026-10-29T06:00:00Z') }],
    );
    repo.listRuns = async () => [
      { orgId: 'org_1', communityId: 'cmy_spring', lastDueAt: at('2026-10-29T06:00:00Z') },
    ];
    await Promise.all([
      svc.openDue(at('2026-11-05T06:00:03Z')),
      svc.openDue(at('2026-11-05T06:00:04Z')),
    ]);
    expect(appended).toHaveLength(1);
  });

  it('keeps going past a community that fails, then fails the run so it is retried', async () => {
    const other: CommunityDigest = {
      orgId: 'org_2',
      communityId: 'cmy_other',
      digest: daily(7, 'UTC'),
    };
    const { svc, appended, entries, failOn } = harness(
      [spring, other],
      [
        { orgId: 'org_1', communityId: 'cmy_spring', lastDueAt: at('2026-10-29T06:00:00Z') },
        { orgId: 'org_2', communityId: 'cmy_other', lastDueAt: at('2026-11-04T07:00:00Z') },
      ],
    );
    failOn('cmy_spring');
    await expect(svc.openDue(at('2026-11-05T07:00:00Z'))).rejects.toThrow(
      '1 community digests could not be opened',
    );
    expect(appended.map((event) => (event.data as { communityId: string }).communityId)).toEqual([
      'cmy_other',
    ]);
    expect(entries).toContainEqual(
      expect.objectContaining({ level: 'error', msg: 'digest not opened' }),
    );
  });
});
