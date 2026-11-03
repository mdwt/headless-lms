import { describe, expect, it, vi } from 'vitest';
import { createCapturingLogger } from '../shared/logger.js';
import { assetsJobs, assetsRecurringJobs, UPLOADS_REMOVE_UNATTACHED_JOB } from './jobs.js';

describe('assets jobs', () => {
  it('sweeps the unattached uploads of every org at the firing time, every hour', async () => {
    const removeUnattached = vi.fn(async () => 0);
    const [job] = assetsJobs({
      assets: { removeUnattached },
      orgs: { orgIds: async () => ['org_1', 'org_2'] },
    });
    const startedAt = new Date('2026-11-05T07:00:01.000Z');

    await job!.run(null, { id: 'f', startedAt });

    expect(job!.job).toBe(UPLOADS_REMOVE_UNATTACHED_JOB);
    expect(removeUnattached.mock.calls).toEqual([
      ['org_1', startedAt],
      ['org_2', startedAt],
    ]);
    expect(assetsRecurringJobs).toEqual([
      { job: UPLOADS_REMOVE_UNATTACHED_JOB, cron: '0 * * * *' },
    ]);
  });

  it('keeps going past an org that fails, then fails the run so it is retried', async () => {
    const removeUnattached = vi.fn(async (orgId: string) => {
      if (orgId === 'org_1') {
        throw new Error('storage down');
      }
      return 1;
    });
    const { logger, entries } = createCapturingLogger();
    const [job] = assetsJobs({
      assets: { removeUnattached },
      orgs: { orgIds: async () => ['org_1', 'org_2'] },
      logger,
    });

    await expect(job!.run(null, { id: 'f', startedAt: new Date() })).rejects.toThrow(
      'unattached uploads of 1 orgs could not be swept',
    );
    expect(removeUnattached).toHaveBeenCalledTimes(2);
    expect(entries).toContainEqual(
      expect.objectContaining({ level: 'error', msg: 'unattached uploads not swept' }),
    );
  });
});
