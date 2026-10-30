import { describe, expect, it, vi } from 'vitest';
import type { DomainEvent } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';
import { address, type ActionDeps } from './community-mail.js';

const event = { metadata: {} } as DomainEvent;
const params = { communityTitle: 'Founders', communityId: 'cmy_1' };

function deps(emails: Record<string, string | null>, warn = vi.fn()): ActionDeps {
  return {
    lookups: {
      orgUserPerson: async (_orgId: string, orgUserId: string) => {
        const email = emails[orgUserId];
        return email ? { userId: `usr_${orgUserId}`, email } : null;
      },
    },
    logger: { ...noopLogger, warn },
  } as unknown as ActionDeps;
}

describe('address', () => {
  it('skips a recipient with no address and keeps the rest', async () => {
    const warn = vi.fn();
    const recipients = await address(
      deps({ a: 'a@example.com', b: null }, warn),
      event,
      'org-1',
      ['a', 'b'],
      params,
    );
    expect(recipients).toEqual([{ to: 'a@example.com', orgUserId: 'a', userId: 'usr_a', params }]);
    expect(warn).toHaveBeenCalledWith('email skipped: recipient has no address', {
      orgId: 'org-1',
      orgUserId: 'b',
    });
  });
});
