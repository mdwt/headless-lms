// Email side-effects of domain events, subscribed on the EventBus. Events
// reach the bus via the outbox relay at-least-once: a mailer failure throws
// through publish, and the relay retries with backoff — no email is silently
// dropped.
import type { EventBus } from '../core/shared/ports.js';
import type { Mailer } from '../core/shared/mailer.js';
import type { EntitlementCreated, EntitlementDeleted } from '../core/entitlements/index.js';

export function registerNotificationSubscribers(bus: EventBus, mailer: Pick<Mailer, 'send'>): void {
  bus.subscribe('entitlement.created', async (event) => {
    const { entitlement } = event as EntitlementCreated;
    await mailer.send(entitlement.studentEmail, 'accessGranted', {
      contentTitle: entitlement.content.title,
      contentId: entitlement.content.id,
    });
  });

  bus.subscribe('entitlement.deleted', async (event) => {
    const { entitlement } = event as EntitlementDeleted;
    await mailer.send(entitlement.studentEmail, 'accessRevoked', {
      contentTitle: entitlement.content.title,
    });
  });
}
