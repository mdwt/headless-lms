import { describe, expect, it } from 'vitest';
import { laterExpiry, opensSpace } from './rules.js';

describe('opensSpace', () => {
  it('ignores space-member rows in an all-members space', () => {
    expect(opensSpace('student', true, 'all_members', false)).toBe(true);
    expect(opensSpace('student', false, 'all_members', true)).toBe(false);
  });

  it('requires an active row in a by-request or by-invite space for a member', () => {
    expect(opensSpace('student', true, 'by_request', false)).toBe(false);
    expect(opensSpace('student', true, 'by_invite', true)).toBe(true);
  });

  it('lets a moderating member open every space and nobody who is not a member', () => {
    expect(opensSpace('moderator', true, 'by_invite', false)).toBe(true);
    expect(opensSpace('owner', true, 'by_invite', false)).toBe(true);
    expect(opensSpace('moderator', false, 'all_members', false)).toBe(false);
    expect(opensSpace('owner', false, 'all_members', true)).toBe(false);
  });
});

describe('laterExpiry', () => {
  it('treats a lifetime grant as later than any date', () => {
    const date = new Date('2026-01-01T00:00:00Z');
    expect(laterExpiry(null, date)).toBeNull();
    expect(laterExpiry(date, null)).toBeNull();
    expect(laterExpiry(date, new Date('2027-01-01T00:00:00Z'))).toEqual(
      new Date('2027-01-01T00:00:00Z'),
    );
    expect(laterExpiry(new Date('2027-01-01T00:00:00Z'), date)).toEqual(
      new Date('2027-01-01T00:00:00Z'),
    );
  });
});
