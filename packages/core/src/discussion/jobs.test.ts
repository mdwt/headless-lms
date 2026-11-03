import { describe, expect, it, vi } from 'vitest';
import { createCapturingLogger } from '../shared/logger.js';
import { discussionJobs, POST_PUBLISH_JOB } from './jobs.js';

function handler(job: string, jobs: ReturnType<typeof discussionJobs>) {
  const found = jobs.find((entry) => entry.job === job);
  if (!found) {
    throw new Error(`no handler for ${job}`);
  }
  return found;
}

describe('discussion jobs', () => {
  it('publishes the scheduled post named in the payload at the firing time', async () => {
    const publishScheduled = vi.fn(async () => {});
    const job = handler(POST_PUBLISH_JOB, discussionJobs({ posts: { publishScheduled } }));
    const startedAt = new Date('2026-11-03T10:00:05.000Z');

    await job.run({ orgId: 'org_1', postId: 'pst_1' }, { id: 'fire_1', startedAt });

    expect(publishScheduled).toHaveBeenCalledWith('org_1', 'pst_1', startedAt);
  });

  it('logs and drops a payload that names no post', async () => {
    const publishScheduled = vi.fn(async () => {});
    const { logger, entries } = createCapturingLogger();
    const job = handler(POST_PUBLISH_JOB, discussionJobs({ posts: { publishScheduled }, logger }));

    await expect(
      job.run({ orgId: 'org_1' }, { id: 'fire_1', startedAt: new Date() }),
    ).resolves.toBeUndefined();

    expect(publishScheduled).not.toHaveBeenCalled();
    expect(entries).toContainEqual({
      level: 'error',
      msg: 'scheduled post payload refused',
      meta: { job: POST_PUBLISH_JOB, fireId: 'fire_1' },
    });
  });

  it('rethrows a failure so the scheduler retries the firing', async () => {
    const publishScheduled = vi.fn(async () => {
      throw new Error('db down');
    });
    const job = handler(POST_PUBLISH_JOB, discussionJobs({ posts: { publishScheduled } }));

    await expect(
      job.run({ orgId: 'org_1', postId: 'pst_1' }, { id: 'fire_1', startedAt: new Date() }),
    ).rejects.toThrow('db down');
  });
});
