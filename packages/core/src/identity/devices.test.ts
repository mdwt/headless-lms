import { describe, expect, it } from 'vitest';
import { DevicesServiceImpl } from './devices.js';
import type { DevicesRepository } from './ports.js';
import { NotFoundError, ValidationError } from '../shared/errors.js';
import type { DeviceView, PushConfig } from '../types/index.js';

const DAY = 24 * 60 * 60 * 1000;

const PUSH: PushConfig = {
  apns: { teamId: 'T', keyId: 'K', key: 'p8', bundleIds: ['com.spanishin90days.app'] },
  fcm: { serviceAccount: { project_id: 'spanish' } },
  webpush: { publicKey: 'BPub', privateKey: 'priv', subject: 'mailto:ops@example.com' },
};

function harness(push: PushConfig = PUSH) {
  const rows: (DeviceView & { userId: string; createdAt: Date })[] = [];
  let next = 1;
  const repo: DevicesRepository = {
    upsert: async (_orgId, device, at) => {
      const existing = rows.find(
        (row) => row.provider === device.provider && row.token === device.token,
      );
      if (existing) {
        Object.assign(existing, { ...device, lastSeenAt: at });
        return existing;
      }
      const row = { id: `dev_${next++}`, ...device, createdAt: at, lastSeenAt: at };
      rows.push(row);
      return row;
    },
    listForUser: async (_orgId, userId, since) =>
      rows.filter((row) => row.userId === userId && (since === null || row.lastSeenAt >= since)),
    deleteOwn: async (_orgId, userId, deviceId) => {
      const index = rows.findIndex((row) => row.userId === userId && row.id === deviceId);
      if (index < 0) {
        return false;
      }
      rows.splice(index, 1);
      return true;
    },
    deleteMany: async (_orgId, deviceIds) => {
      for (const id of deviceIds) {
        const index = rows.findIndex((row) => row.id === id);
        if (index >= 0) {
          rows.splice(index, 1);
        }
      }
    },
  };
  return { service: new DevicesServiceImpl({ repo, push }), rows };
}

const sarah = { id: 'ou_sarah', role: 'student' as const, userId: 'usr_sarah' };
const james = { id: 'ou_james', role: 'student' as const, userId: 'usr_james' };
const iphone = {
  provider: 'apns' as const,
  token: 'apns-token-1',
  appId: 'com.spanishin90days.app',
  environment: 'production' as const,
};

describe('devices', () => {
  it('registers a device and answers it without the person or times', async () => {
    const { service } = harness();
    await expect(service.register('org_1', sarah, iphone)).resolves.toEqual({
      id: 'dev_1',
      provider: 'apns',
      token: 'apns-token-1',
      p256dh: null,
      auth: null,
      appId: 'com.spanishin90days.app',
      environment: 'production',
    });
  });

  it('refreshes a known token instead of adding a device', async () => {
    const { service, rows } = harness();
    await service.register('org_1', sarah, iphone);
    const firstSeen = rows[0]!.lastSeenAt;
    await new Promise((resolve) => setTimeout(resolve, 5));
    const again = await service.register('org_1', sarah, iphone);
    expect(again.id).toBe('dev_1');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.lastSeenAt.getTime()).toBeGreaterThan(firstSeen.getTime());
  });

  it('moves a token registered by another person to the caller', async () => {
    const { service } = harness();
    await service.register('org_1', sarah, iphone);
    await service.register('org_1', james, iphone);
    await expect(service.list('org_1', sarah)).resolves.toEqual([]);
    await expect(service.list('org_1', james)).resolves.toMatchObject([{ id: 'dev_1' }]);
  });

  it('stores web push keys with a browser subscription', async () => {
    const { service } = harness();
    const device = await service.register('org_1', sarah, {
      provider: 'webpush',
      token: 'https://push.example.com/sub/1',
      keys: { p256dh: 'p', auth: 'a' },
    });
    expect(device).toMatchObject({ provider: 'webpush', p256dh: 'p', auth: 'a', appId: null });
  });

  it.each([
    [{ ...iphone, appId: 'com.other.app' }, 'appId must be one of the configured iOS bundle ids'],
    [
      { provider: 'apns' as const, token: 't' },
      'appId must be one of the configured iOS bundle ids',
    ],
    [
      { provider: 'webpush' as const, token: 't' },
      'a webpush device needs its p256dh and auth keys',
    ],
    [
      { provider: 'fcm' as const, token: 't', keys: { p256dh: 'p', auth: 'a' } },
      'keys apply to webpush devices only',
    ],
    [
      { provider: 'fcm' as const, token: 't', environment: 'sandbox' as const },
      'environment applies to apns devices only',
    ],
  ])('refuses %o with 422', async (input, message) => {
    const { service, rows } = harness();
    await expect(service.register('org_1', sarah, input)).rejects.toThrow(message);
    await expect(service.register('org_1', sarah, input)).rejects.toBeInstanceOf(ValidationError);
    expect(rows).toEqual([]);
  });

  it('refuses every provider when none is configured, and serves no VAPID key', async () => {
    const { service } = harness({});
    for (const provider of ['apns', 'fcm', 'webpush'] as const) {
      await expect(service.register('org_1', sarah, { provider, token: 't' })).rejects.toThrow(
        `push through ${provider} is not configured`,
      );
    }
    expect(service.pushConfig()).toEqual({ vapidPublicKey: null });
    expect(harness().service.pushConfig()).toEqual({ vapidPublicKey: 'BPub' });
  });

  it('removes only the caller’s own device', async () => {
    const { service } = harness();
    const device = await service.register('org_1', sarah, iphone);
    await expect(service.remove('org_1', james, device.id)).rejects.toBeInstanceOf(NotFoundError);
    await service.remove('org_1', sarah, device.id);
    await expect(service.list('org_1', sarah)).resolves.toEqual([]);
  });

  it('gives the push channel only the devices seen since the cutoff', async () => {
    const { service, rows } = harness();
    await service.register('org_1', sarah, iphone);
    await service.register('org_1', sarah, { provider: 'fcm', token: 'android-1' });
    rows[0]!.lastSeenAt = new Date(Date.now() - 31 * DAY);
    const active = await service.activeDevices(
      'org_1',
      'usr_sarah',
      new Date(Date.now() - 30 * DAY),
    );
    expect(active.map((device) => device.token)).toEqual(['android-1']);
    expect(active[0]).not.toHaveProperty('lastSeenAt');
  });

  it('deletes the devices the provider reported dead', async () => {
    const { service, rows } = harness();
    await service.register('org_1', sarah, iphone);
    await service.register('org_1', sarah, { provider: 'fcm', token: 'android-1' });
    await service.removeDead('org_1', ['dev_1']);
    await service.removeDead('org_1', []);
    expect(rows.map((row) => row.id)).toEqual(['dev_2']);
  });
});
