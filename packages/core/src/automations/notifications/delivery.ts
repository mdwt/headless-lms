import type { DevicesService } from '../../identity/index.js';
import { noopLogger } from '../../shared/logger.js';
import type { ChannelRegistry, Logger } from '../../shared/ports.js';
import type { ChannelRecipient, DeliveryDispatch } from '../../types/index.js';
import type { NotificationsRepository } from '../ports.js';

export const CHANNEL_NOT_CONFIGURED = 'channel not configured';
export const NO_ADDRESS = 'no address';
export const EVERY_DEVICE_DEAD = 'every device was dead';

export type NotificationDeliveryParams = {
  repo: Pick<NotificationsRepository, 'findDelivery' | 'markSent' | 'recordError' | 'markFailed'>;
  channels: Pick<ChannelRegistry, 'get'>;
  devices: Pick<DevicesService, 'removeDead'>;
  logger?: Logger;
};

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function everyDeviceDead(to: ChannelRecipient, dead: string[]): boolean {
  if (!to.devices || to.devices.length === 0 || dead.length === 0) {
    return false;
  }
  const gone = new Set(dead);
  return to.devices.every((device) => gone.has(device.id));
}

export class NotificationDelivery {
  private readonly repo: NotificationDeliveryParams['repo'];
  private readonly channels: Pick<ChannelRegistry, 'get'>;
  private readonly devices: Pick<DevicesService, 'removeDead'>;
  private readonly logger: Logger;

  constructor(params: NotificationDeliveryParams) {
    this.repo = params.repo;
    this.channels = params.channels;
    this.devices = params.devices;
    this.logger = params.logger ?? noopLogger;
  }

  async run(d: DeliveryDispatch, lastAttempt: boolean): Promise<void> {
    const found = await this.repo.findDelivery(d.orgId, d.deliveryId);
    if (!found || found.delivery.status !== 'pending') {
      this.logger.debug('notification delivery skipped', {
        orgId: d.orgId,
        deliveryId: d.deliveryId,
        status: found?.delivery.status ?? null,
      });
      return;
    }
    const { delivery, notification } = found;
    const log = {
      orgId: d.orgId,
      deliveryId: d.deliveryId,
      notificationId: notification.id,
      channel: delivery.channel,
      type: notification.type,
    };
    const channel = this.channels.get(delivery.channel);
    if (!channel) {
      await this.repo.markFailed(d.orgId, d.deliveryId, CHANNEL_NOT_CONFIGURED);
      this.logger.warn('notification delivery failed: channel not configured', log);
      return;
    }
    let to: ChannelRecipient | null;
    let dead: string[];
    try {
      to = await channel.recipient(d.orgId, notification.userId);
      if (!to) {
        await this.repo.markFailed(d.orgId, d.deliveryId, NO_ADDRESS);
        this.logger.info('notification delivery failed: no address', log);
        return;
      }
      dead = (await channel.deliver(notification, to)).deadDeviceIds;
    } catch (err) {
      const error = messageOf(err);
      if (lastAttempt) {
        await this.repo.markFailed(d.orgId, d.deliveryId, error);
        this.logger.warn('notification delivery failed on its last attempt', { ...log, err });
        return;
      }
      await this.repo.recordError(d.orgId, d.deliveryId, error);
      this.logger.warn('notification delivery attempt failed', { ...log, err });
      throw err;
    }
    if (dead.length > 0) {
      await this.devices.removeDead(d.orgId, dead);
    }
    if (everyDeviceDead(to, dead)) {
      await this.repo.markFailed(d.orgId, d.deliveryId, EVERY_DEVICE_DEAD);
      this.logger.info('notification delivery failed: every device was dead', log);
      return;
    }
    await this.repo.markSent(d.orgId, d.deliveryId, new Date());
    this.logger.info('notification delivered', log);
  }
}
