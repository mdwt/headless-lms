import { describe, it, expect, vi } from 'vitest';
import { registerNotificationSubscribers } from './notifications.js';
import { InMemoryEventBus } from '@headless-lms/adapter-defaults/events';
import type { Entitlement } from '@headless-lms/core/types';
import type { MailerLookups } from '@headless-lms/core/shared/mailer';
import { entitlementEvents } from '@headless-lms/core/entitlements';

const ENTITLEMENT: Entitlement = {
  orgId: 'org-1',
  id: 'e1',
  orgUserId: 's1',
  bundleId: null,
  contentId: 'c1',
  status: 'active',
  grantedAt: new Date('2026-01-01T00:00:00Z'),
  expiresAt: null,
  source: 'manual',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const meta = { id: 'ev1', occurredAt: '2026-01-01T00:00:00Z' };
const created = {
  ...entitlementEvents.entitlementCreated.make({
    orgId: 'org-1',
    data: ENTITLEMENT,
  }),
  ...meta,
};
const deleted = {
  ...entitlementEvents.entitlementDeleted.make({
    orgId: 'org-1',
    data: ENTITLEMENT,
  }),
  ...meta,
};
const updated = {
  ...entitlementEvents.entitlementUpdated.make({
    orgId: 'org-1',
    data: ENTITLEMENT,
  }),
  ...meta,
};

function fakeLookups(over?: Partial<MailerLookups>): MailerLookups {
  return {
    orgUserEmail: vi.fn().mockResolvedValue('bob@example.com'),
    contentInfo: vi.fn().mockResolvedValue({ id: 'c1', title: 'Intro', type: 'course' }),
    ...over,
  };
}

function build(lookups: MailerLookups = fakeLookups()) {
  const bus = new InMemoryEventBus();
  const send = vi.fn().mockResolvedValue(undefined);
  registerNotificationSubscribers(bus, { send }, lookups);
  return { bus, send };
}

describe('notification subscribers', () => {
  it('sends accessGranted on entitlement.created', async () => {
    const { bus, send } = build();
    await bus.publish(created);
    expect(send).toHaveBeenCalledWith('bob@example.com', 'accessGranted', {
      contentTitle: 'Intro',
      contentId: 'c1',
      contentType: 'course',
    });
  });

  it('sends accessRevoked on entitlement.deleted', async () => {
    const { bus, send } = build();
    await bus.publish(deleted);
    expect(send).toHaveBeenCalledWith('bob@example.com', 'accessRevoked', {
      contentTitle: 'Intro',
    });
  });

  it('sends nothing on entitlement.updated (reactivation)', async () => {
    const { bus, send } = build();
    await bus.publish(updated);
    expect(send).not.toHaveBeenCalled();
  });

  it('throws when the recipient cannot be resolved, so the relay retries', async () => {
    const { bus, send } = build(fakeLookups({ orgUserEmail: vi.fn().mockResolvedValue(null) }));
    await expect(bus.publish(created)).rejects.toThrow('lookups failed');
    expect(send).not.toHaveBeenCalled();
  });

  it('propagates a mailer failure so the relay retries the dispatch', async () => {
    const { bus, send } = build();
    send.mockRejectedValue(new Error('smtp down'));
    await expect(bus.publish(created)).rejects.toThrow('smtp down');
  });
});
