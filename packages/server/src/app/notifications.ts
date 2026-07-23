import type { EventBus } from '../core/shared/ports.js';
import type { Mailer } from '../core/shared/mailer.js';
import type { EntitlementCreated, EntitlementDeleted } from '../core/entitlements/index.js';

export interface NotificationUrls {
  /** Student portal origin — access-granted emails link into it. */
  studentPortalUrl: string;
}

export function registerNotificationSubscribers(
  bus: EventBus,
  mailer: Pick<Mailer, 'send'>,
  urls: NotificationUrls,
): void {
  bus.subscribe('entitlement.created', async (event) => {
    const { entitlement } = event as EntitlementCreated;
    await mailer.send(entitlement.studentEmail, 'accessGranted', {
      contentTitle: entitlement.content.title,
      contentUrl: `${urls.studentPortalUrl}/courses/${entitlement.content.id}`,
    });
  });

  bus.subscribe('entitlement.deleted', async (event) => {
    const { entitlement } = event as EntitlementDeleted;
    await mailer.send(entitlement.studentEmail, 'accessRevoked', {
      contentTitle: entitlement.content.title,
    });
  });
}
