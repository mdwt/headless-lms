import { describe, expect, it, vi } from 'vitest';
import type { AutomationExecutor } from '../types/index.js';
import { cronMatches, cronSupported, fireDueSchedules } from './schedule.js';

describe('cronMatches', () => {
  const at = new Date('2026-10-21T07:00:00.000Z');

  it('matches a wildcard and the UTC fields of the minute', () => {
    expect(cronMatches('0 7 * * *', at)).toBe(true);
    expect(cronMatches('* * * * *', at)).toBe(true);
    expect(cronMatches('0 8 * * *', at)).toBe(false);
    expect(cronMatches('0 7 * * 3', at)).toBe(true);
    expect(cronMatches('0,30 7 * * *', at)).toBe(true);
    expect(cronMatches('not a cron', at)).toBe(false);
  });
});

describe('cronSupported', () => {
  it('accepts a wildcard or a list of integers inside each field range', () => {
    expect(cronSupported('* * * * *')).toBe(true);
    expect(cronSupported('0 7 * * *')).toBe(true);
    expect(cronSupported('0,30 7 * * *')).toBe(true);
    expect(cronSupported('0 * * * *')).toBe(true);
  });

  it('rejects a step, a range, a name, or an integer the clock never shows', () => {
    expect(cronSupported('*/5 * * * *')).toBe(false);
    expect(cronSupported('1-5 * * * *')).toBe(false);
    expect(cronSupported('0 7 * * MON')).toBe(false);
    expect(cronSupported('60 * * * *')).toBe(false);
    expect(cronSupported('0 7 * * 7')).toBe(false);
    expect(cronSupported('not a cron')).toBe(false);
  });
});

describe('fireDueSchedules', () => {
  const schedule = { orgId: 'org-1', automationId: 'atm_1', cron: '0 7 * * *' };

  function executor(fireSchedule: AutomationExecutor['fireSchedule']): AutomationExecutor {
    return {
      listSchedules: async () => [schedule],
      fireSchedule,
      runAction: vi.fn(),
      finalize: vi.fn(),
    };
  }

  it('fires a minute the previous tick skipped', async () => {
    const fireSchedule = vi.fn().mockResolvedValue(undefined);
    const lastFired = new Map<string, number>();

    await fireDueSchedules(executor(fireSchedule), new Date('2026-10-21T06:59:00.000Z'), lastFired);
    expect(fireSchedule).not.toHaveBeenCalled();

    await fireDueSchedules(executor(fireSchedule), new Date('2026-10-21T07:01:30.000Z'), lastFired);
    expect(fireSchedule).toHaveBeenCalledTimes(1);
    expect(fireSchedule).toHaveBeenCalledWith(
      'org-1',
      'atm_1',
      new Date('2026-10-21T07:00:00.000Z'),
    );
  });

  it('retries a minute whose fire failed', async () => {
    const fireSchedule = vi
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue(undefined);
    const lastFired = new Map<string, number>();
    const at = new Date('2026-10-21T07:00:00.000Z');

    await fireDueSchedules(executor(fireSchedule), at, lastFired);
    await fireDueSchedules(executor(fireSchedule), at, lastFired);

    expect(fireSchedule).toHaveBeenCalledTimes(2);
  });
});
