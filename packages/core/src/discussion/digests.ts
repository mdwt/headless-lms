import type { DigestSchedule } from '../content/index.js';
import type { Logger } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';
import { discussionEvents } from './events.js';
import type {
  DigestRunRepository,
  DigestScheduleReader,
  DigestService,
  DigestUnitOfWork,
} from './ports.js';

const HOUR_MS = 60 * 60 * 1000;

interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallTimeIn(at: Date, timeZone: string): WallTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((entry) => entry.type === type)?.value);
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    hour: part('hour'),
    minute: part('minute'),
    second: part('second'),
  };
}

function offsetAt(at: number, timeZone: string): number {
  const wall = wallTimeIn(new Date(at), timeZone);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  return asUtc - Math.floor(at / 1000) * 1000;
}

function instantOf(timeZone: string, year: number, month: number, day: number, hour: number): Date {
  const wall = Date.UTC(year, month - 1, day, hour);
  const guess = wall - offsetAt(wall, timeZone);
  return new Date(wall - offsetAt(guess, timeZone));
}

export function latestDueAt(schedule: DigestSchedule, now: Date): Date {
  const today = wallTimeIn(now, schedule.timeZone);
  const weekday = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();
  const weekly = schedule.cadence === 'weekly';
  const back = weekly ? (weekday - schedule.weekday + 7) % 7 : 0;
  const slot = (daysBack: number) =>
    instantOf(schedule.timeZone, today.year, today.month, today.day - daysBack, schedule.hour);
  const candidate = slot(back);
  return candidate.getTime() <= now.getTime() ? candidate : slot(back + (weekly ? 7 : 1));
}

function runKey(orgId: string, communityId: string): string {
  return `${orgId}\0${communityId}`;
}

export type DigestServiceParams = {
  schedules: DigestScheduleReader;
  runs: Pick<DigestRunRepository, 'listRuns'>;
  uow: DigestUnitOfWork;
  logger?: Logger;
};

export class DigestServiceImpl implements DigestService {
  private readonly schedules: DigestScheduleReader;
  private readonly runs: Pick<DigestRunRepository, 'listRuns'>;
  private readonly uow: DigestUnitOfWork;
  private readonly logger: Logger;

  constructor(params: DigestServiceParams) {
    this.schedules = params.schedules;
    this.runs = params.runs;
    this.uow = params.uow;
    this.logger = params.logger ?? noopLogger;
  }

  async openDue(now: Date): Promise<void> {
    const [communities, runs] = await Promise.all([
      this.schedules.communitiesWithDigest(),
      this.runs.listRuns(),
    ]);
    const handled = new Map(runs.map((run) => [runKey(run.orgId, run.communityId), run.lastDueAt]));
    let due = 0;
    let moved = 0;
    let failed = 0;
    for (const { orgId, communityId, digest } of communities) {
      const dueAt = latestDueAt(digest, now);
      const previous = handled.get(runKey(orgId, communityId)) ?? null;
      if (previous !== null && dueAt.getTime() <= previous.getTime()) {
        continue;
      }
      const emits = previous !== null && now.getTime() - dueAt.getTime() <= HOUR_MS;
      try {
        const advanced = await this.uow.run(async ({ digests, outbox }) => {
          if (!(await digests.advance(orgId, communityId, dueAt))) {
            return false;
          }
          if (emits && previous !== null) {
            await outbox.append([
              discussionEvents.digestDue.make({
                orgId,
                data: { communityId, from: previous, to: dueAt },
              }),
            ]);
          }
          return true;
        });
        if (advanced && emits) {
          due += 1;
        } else if (advanced) {
          moved += 1;
        }
      } catch (err) {
        failed += 1;
        this.logger.error('digest not opened', { orgId, communityId, err });
      }
    }
    if (due > 0 || moved > 0) {
      this.logger.info('digests opened', { due, moved, failed });
    }
    if (failed > 0) {
      throw new Error(`${failed} community digests could not be opened`);
    }
  }
}
