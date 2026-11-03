import { describe, expect, it, vi } from 'vitest';
import { createCapturingLogger } from '../shared/logger.js';
import type { Logger } from '../shared/ports.js';
import {
  DIGEST_OPEN_JOB,
  discussionJobs,
  discussionRecurringJobs,
  POST_PUBLISH_JOB,
} from './jobs.js';

function jobsWith(over: {
  publishScheduled?: () => Promise<void>;
  openDue?: () => Promise<void>;
  logger?: Logger;
}) {
  const publishScheduled = vi.fn(over.publishScheduled ?? (async () => {}));
  const openDue = vi.fn(over.openDue ?? (async () => {}));
  const jobs = discussionJobs({
    posts: { publishScheduled },
    digests: { openDue },
    ...(over.logger ? { logger: over.logger } : {}),
  });
  const handler = (job: string) => {
    const found = jobs.find((entry) => entry.job === job);
    if (!found) {
      throw new Error(`no handler for ${job}`);
    }
    return found;
  };
  return { publishScheduled, openDue, handler };
}

describe('discussion jobs', () => {
  it('publishes the scheduled post named in the payload at the firing time', async () => {
    const { publishScheduled, handler } = jobsWith({});
    const startedAt = new Date('2026-11-03T10:00:05.000Z');

    await handler(POST_PUBLISH_JOB).run(
      { orgId: 'org_1', postId: 'pst_1' },
      { id: 'f', startedAt },
    );

    expect(publishScheduled).toHaveBeenCalledWith('org_1', 'pst_1', startedAt);
  });

  it('logs and drops a payload that names no post', async () => {
    const { logger, entries } = createCapturingLogger();
    const { publishScheduled, handler } = jobsWith({ logger });

    await expect(
      handler(POST_PUBLISH_JOB).run({ orgId: 'org_1' }, { id: 'fire_1', startedAt: new Date() }),
    ).resolves.toBeUndefined();

    expect(publishScheduled).not.toHaveBeenCalled();
    expect(entries).toContainEqual({
      level: 'error',
      msg: 'scheduled post payload refused',
      meta: { job: POST_PUBLISH_JOB, fireId: 'fire_1' },
    });
  });

  it('rethrows a failure so the scheduler retries the firing', async () => {
    const { handler } = jobsWith({
      publishScheduled: async () => {
        throw new Error('db down');
      },
    });

    await expect(
      handler(POST_PUBLISH_JOB).run(
        { orgId: 'org_1', postId: 'pst_1' },
        { id: 'fire_1', startedAt: new Date() },
      ),
    ).rejects.toThrow('db down');
  });

  it('opens the due digests at the firing time, every hour', async () => {
    const { openDue, handler } = jobsWith({});
    const startedAt = new Date('2026-11-05T06:00:02.000Z');

    await handler(DIGEST_OPEN_JOB).run(null, { id: 'f', startedAt });

    expect(openDue).toHaveBeenCalledWith(startedAt);
    expect(discussionRecurringJobs).toEqual([{ job: DIGEST_OPEN_JOB, cron: '0 * * * *' }]);
  });
});
