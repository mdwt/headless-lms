import { describe, expect, it, vi } from 'vitest';
import { entitlementsJobs, entitlementsRecurringJobs, GRANTS_EXPIRE_JOB } from './jobs.js';

describe('entitlements jobs', () => {
  it('expires due grants across orgs at the firing time, every hour', async () => {
    const expireDueGrants = vi.fn(async () => {});
    const [job] = entitlementsJobs({ grants: { expireDueGrants } });
    const startedAt = new Date('2026-11-05T07:00:01.000Z');

    await job!.run(null, { id: 'f', startedAt });

    expect(job!.job).toBe(GRANTS_EXPIRE_JOB);
    expect(expireDueGrants).toHaveBeenCalledWith(startedAt);
    expect(entitlementsRecurringJobs).toEqual([{ job: GRANTS_EXPIRE_JOB, cron: '0 * * * *' }]);
  });

  it('rethrows a failure so the scheduler retries the firing', async () => {
    const [job] = entitlementsJobs({
      grants: {
        expireDueGrants: async () => {
          throw new Error('db down');
        },
      },
    });
    await expect(job!.run(null, { id: 'f', startedAt: new Date() })).rejects.toThrow('db down');
  });
});
