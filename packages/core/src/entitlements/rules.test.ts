import { describe, expect, it } from 'vitest';
import { opensSpace, seesSpace } from './rules.js';

describe('opensSpace', () => {
  it('ignores space-member rows in an all-members space', () => {
    expect(opensSpace(true, false, 'all_members', false)).toBe(true);
    expect(opensSpace(false, false, 'all_members', true)).toBe(false);
  });

  it('requires an active row in a by-request or by-invite space for a member', () => {
    expect(opensSpace(true, false, 'by_request', false)).toBe(false);
    expect(opensSpace(true, false, 'by_invite', true)).toBe(true);
  });

  it('opens every space to a member who opens every space, and nothing to a non-member', () => {
    expect(opensSpace(true, true, 'by_invite', false)).toBe(true);
    expect(opensSpace(false, true, 'all_members', true)).toBe(false);
  });
});

describe('seesSpace', () => {
  it('hides a by-invite space from someone without a row, unless they open every space', () => {
    expect(seesSpace(false, 'by_invite', undefined)).toBe(false);
    expect(seesSpace(false, 'by_invite', 'revoked')).toBe(false);
    expect(seesSpace(false, 'by_invite', 'invited')).toBe(true);
    expect(seesSpace(true, 'by_invite', undefined)).toBe(true);
    expect(seesSpace(false, 'by_request', undefined)).toBe(true);
  });
});
