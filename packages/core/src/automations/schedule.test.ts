import { describe, expect, it } from 'vitest';
import { cronMatches } from './schedule.js';

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
