import { describe, it, expect } from 'vitest';
import { inviteLinkFor, inviteAllowsSignup, STUDENT_ROLE } from './invites.js';

const urls = { studentPortalUrl: 'http://localhost:8002', adminAppUrl: 'http://localhost:8001' };

describe('inviteLinkFor', () => {
  it('sends students to the portal welcome page', () => {
    expect(inviteLinkFor(STUDENT_ROLE, 'tok1', 'jane@example.com', urls)).toBe(
      'http://localhost:8002/welcome?token=tok1&email=jane%40example.com',
    );
  });
  it('sends staff to the admin invite page', () => {
    expect(inviteLinkFor('instructor', 'tok2', 'sam@example.com', urls)).toBe(
      'http://localhost:8001/invite?token=tok2&email=sam%40example.com',
    );
  });
});

describe('inviteAllowsSignup', () => {
  const now = new Date('2026-07-22T12:00:00Z');
  const base = { status: 'pending', expiresAt: new Date('2026-07-29T12:00:00Z') };

  it('accepts a pending, unexpired invite for the matching email (emails array)', () => {
    expect(inviteAllowsSignup({ ...base, emails: ['jane@example.com'] }, 'jane@example.com', now)).toBe(true);
  });
  it('accepts via the legacy single-email field', () => {
    expect(inviteAllowsSignup({ ...base, email: 'jane@example.com' }, 'jane@example.com', now)).toBe(true);
  });
  it('rejects a missing invite', () => {
    expect(inviteAllowsSignup(null, 'jane@example.com', now)).toBe(false);
  });
  it('rejects a non-pending invite', () => {
    expect(inviteAllowsSignup({ ...base, status: 'used', emails: ['jane@example.com'] }, 'jane@example.com', now)).toBe(false);
  });
  it('rejects an expired invite', () => {
    expect(
      inviteAllowsSignup(
        { ...base, expiresAt: new Date('2026-07-21T12:00:00Z'), emails: ['jane@example.com'] },
        'jane@example.com',
        now,
      ),
    ).toBe(false);
  });
  it('rejects an email mismatch', () => {
    expect(inviteAllowsSignup({ ...base, emails: ['other@example.com'] }, 'jane@example.com', now)).toBe(false);
  });
});
