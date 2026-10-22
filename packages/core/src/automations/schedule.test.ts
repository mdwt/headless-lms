import { describe, expect, it } from 'vitest';
import { cronMatches, cronSupported } from './schedule.js';

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
