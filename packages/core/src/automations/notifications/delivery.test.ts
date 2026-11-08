import { describe, expect, it, vi } from 'vitest';
import type { NotificationChannel } from '../../shared/ports.js';
import type { Delivery, PushDevice, StoredNotification } from '../../types/index.js';
import {
  CHANNEL_NOT_CONFIGURED,
  NOT_ACCEPTED,
  NO_ADDRESS,
  NotificationDelivery,
} from './delivery.js';

const AT = new Date('2026-11-01T09:00:00Z');

const notification: StoredNotification = {
  id: 'ntf_1',
  orgId: 'org_1',
  userId: 'usr_sarah',
  type: 'mention',
  scope: 'space',
  reasons: ['post_author', 'mentioned'],
  matchedReason: 'mentioned',
  category: 'mentions',
  communityId: 'cmy_1',
  spaceId: 'spc_2',
  actorId: 'ou_james',
  subject: { type: 'comment', id: 'cmt_1' },
  parent: { type: 'post', id: 'pst_1' },
  display: { authorName: 'James', excerpt: 'Nice', postTitle: 'My first recording' },
  createdAt: AT,
};

function delivery(over: Partial<Delivery> = {}): Delivery {
  return {
    id: 'ndl_1',
    notificationId: 'ntf_1',
    channel: 'push',
    status: 'pending',
    lastError: null,
    createdAt: AT,
    sentAt: null,
    ...over,
  };
}

function device(id: string): PushDevice {
  return {
    id,
    provider: 'apns',
    token: `tok_${id}`,
    p256dh: null,
    auth: null,
    appId: 'com.app',
    environment: 'production',
  };
}

function build(options: {
  found?: { delivery: Delivery; notification: StoredNotification } | null;
  channel?: Partial<NotificationChannel> | null;
}) {
  const repo = {
    findDelivery: vi.fn(async () =>
      options.found === undefined ? { delivery: delivery(), notification } : options.found,
    ),
    markSent: vi.fn(async () => {}),
    recordError: vi.fn(async () => {}),
    markFailed: vi.fn(async () => {}),
  };
  const channel: NotificationChannel | undefined =
    options.channel === null
      ? undefined
      : {
          key: 'push',
          recipient: vi.fn(async () => ({ devices: [device('dev_1'), device('dev_2')] })),
          deliver: vi.fn(async () => ({ accepted: true, deadDeviceIds: [] })),
          ...options.channel,
        };
  const devices = { removeDead: vi.fn(async () => {}) };
  const task = new NotificationDelivery({
    repo,
    channels: { get: (key) => (key === 'push' ? channel : undefined) },
    devices,
  });
  return { repo, channel, devices, task };
}

const D = { orgId: 'org_1', deliveryId: 'ndl_1' };

describe('NotificationDelivery', () => {
  it('sends through the channel to the recipient and marks the delivery sent', async () => {
    const { repo, channel, task } = build({});
    await task.run(D, false);
    expect(channel?.recipient).toHaveBeenCalledWith('org_1', 'usr_sarah');
    expect(channel?.deliver).toHaveBeenCalledWith(notification, {
      devices: [device('dev_1'), device('dev_2')],
    });
    expect(repo.markSent).toHaveBeenCalledWith('org_1', 'ndl_1', expect.any(Date));
    expect(repo.markFailed).not.toHaveBeenCalled();
  });

  it('stops when the delivery is missing or no longer pending', async () => {
    for (const found of [null, { delivery: delivery({ status: 'sent' }), notification }]) {
      const { repo, task } = build({ found });
      await task.run(D, false);
      expect(repo.markSent).not.toHaveBeenCalled();
      expect(repo.markFailed).not.toHaveBeenCalled();
      expect(repo.recordError).not.toHaveBeenCalled();
    }
  });

  it('fails a delivery whose channel is no longer configured', async () => {
    const { repo, task } = build({ channel: null });
    await task.run(D, false);
    expect(repo.markFailed).toHaveBeenCalledWith('org_1', 'ndl_1', CHANNEL_NOT_CONFIGURED);
  });

  it('fails a delivery with no address without retrying', async () => {
    const { repo, channel, task } = build({ channel: { recipient: vi.fn(async () => null) } });
    await expect(task.run(D, false)).resolves.toBeUndefined();
    expect(repo.markFailed).toHaveBeenCalledWith('org_1', 'ndl_1', NO_ADDRESS);
    expect(channel?.deliver).not.toHaveBeenCalled();
  });

  it('records the error and rethrows so the engine retries', async () => {
    const error = new Error('apns 503');
    const { repo, task } = build({
      channel: {
        deliver: vi.fn(async () => {
          throw error;
        }),
      },
    });
    await expect(task.run(D, false)).rejects.toBe(error);
    expect(repo.recordError).toHaveBeenCalledWith('org_1', 'ndl_1', 'apns 503');
    expect(repo.markFailed).not.toHaveBeenCalled();
    expect(repo.markSent).not.toHaveBeenCalled();
  });

  it('marks the delivery failed instead of rethrowing on the last attempt', async () => {
    const { repo, task } = build({
      channel: {
        recipient: vi.fn(async () => {
          throw new Error('identity down');
        }),
      },
    });
    await expect(task.run(D, true)).resolves.toBeUndefined();
    expect(repo.markFailed).toHaveBeenCalledWith('org_1', 'ndl_1', 'identity down');
    expect(repo.recordError).not.toHaveBeenCalled();
  });

  it('removes the devices reported dead and keeps the delivery sent when another accepted', async () => {
    const { repo, devices, task } = build({
      channel: { deliver: vi.fn(async () => ({ accepted: true, deadDeviceIds: ['dev_1'] })) },
    });
    await task.run(D, false);
    expect(devices.removeDead).toHaveBeenCalledWith('org_1', ['dev_1']);
    expect(repo.markSent).toHaveBeenCalled();
  });

  it('fails the delivery with the provider answers when every device was dead', async () => {
    const error =
      'push accepted by no device: dev_1: apns 410 Unregistered; dev_2: apns 410 Unregistered';
    const { repo, devices, task } = build({
      channel: {
        deliver: vi.fn(async () => ({
          accepted: false,
          deadDeviceIds: ['dev_1', 'dev_2'],
          error,
        })),
      },
    });
    await task.run(D, false);
    expect(devices.removeDead).toHaveBeenCalledWith('org_1', ['dev_1', 'dev_2']);
    expect(repo.markFailed).toHaveBeenCalledWith('org_1', 'ndl_1', error);
    expect(repo.markSent).not.toHaveBeenCalled();
  });

  it('fails without retrying when no device accepted and no failure was dead or retryable', async () => {
    const error = 'push accepted by no device: dev_1: apns 400 BadTopic; dev_2: apns 400 BadTopic';
    const { repo, devices, task } = build({
      channel: { deliver: vi.fn(async () => ({ accepted: false, deadDeviceIds: [], error })) },
    });
    await expect(task.run(D, false)).resolves.toBeUndefined();
    expect(devices.removeDead).not.toHaveBeenCalled();
    expect(repo.markFailed).toHaveBeenCalledWith('org_1', 'ndl_1', error);
    expect(repo.recordError).not.toHaveBeenCalled();
    expect(repo.markSent).not.toHaveBeenCalled();
  });

  it('names no answer when a channel refuses without one', async () => {
    const { repo, task } = build({
      channel: { deliver: vi.fn(async () => ({ accepted: false, deadDeviceIds: [] })) },
    });
    await task.run(D, false);
    expect(repo.markFailed).toHaveBeenCalledWith('org_1', 'ndl_1', NOT_ACCEPTED);
  });
});
