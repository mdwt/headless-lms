import type { DeviceView, PushConfig, PushDevice } from '../types/index.js';
import type { Logger } from '../shared/ports.js';
import { NotFoundError, ValidationError, type ValidationProblem } from '../shared/errors.js';
import { noopLogger } from '../shared/logger.js';
import type {
  DeviceRegistration,
  DevicesRepository,
  DevicesService,
  MemberActor,
} from './ports.js';

function pushDevice(device: DeviceView): PushDevice {
  return {
    id: device.id,
    provider: device.provider,
    token: device.token,
    p256dh: device.p256dh,
    auth: device.auth,
    appId: device.appId,
    environment: device.environment,
  };
}

export type DevicesServiceParams = {
  repo: DevicesRepository;
  push: PushConfig;
  logger?: Logger;
};

export class DevicesServiceImpl implements DevicesService {
  private readonly repo: DevicesRepository;
  private readonly push: PushConfig;
  private readonly logger: Logger;

  constructor(params: DevicesServiceParams) {
    this.repo = params.repo;
    this.push = params.push;
    this.logger = params.logger ?? noopLogger;
  }

  async register(
    orgId: string,
    actor: MemberActor,
    input: DeviceRegistration,
  ): Promise<PushDevice> {
    const problems = this.registrationProblems(input);
    if (problems.length > 0) {
      throw new ValidationError(problems);
    }
    const device = await this.repo.upsert(
      orgId,
      {
        userId: actor.userId,
        provider: input.provider,
        token: input.token,
        p256dh: input.keys?.p256dh ?? null,
        auth: input.keys?.auth ?? null,
        appId: input.appId ?? null,
        environment: input.environment ?? null,
      },
      new Date(),
    );
    this.logger.info('device registered', {
      orgId,
      userId: actor.userId,
      deviceId: device.id,
      provider: device.provider,
    });
    return pushDevice(device);
  }

  list(orgId: string, actor: MemberActor): Promise<DeviceView[]> {
    return this.repo.listForUser(orgId, actor.userId, null);
  }

  async remove(orgId: string, actor: MemberActor, deviceId: string): Promise<void> {
    if (!(await this.repo.deleteOwn(orgId, actor.userId, deviceId))) {
      throw new NotFoundError('Device', deviceId);
    }
    this.logger.info('device removed', { orgId, userId: actor.userId, deviceId });
  }

  async activeDevices(orgId: string, userId: string, since: Date): Promise<PushDevice[]> {
    const devices = await this.repo.listForUser(orgId, userId, since);
    return devices.map(pushDevice);
  }

  async withActiveDevices(orgId: string, userIds: string[], since: Date): Promise<string[]> {
    if (userIds.length === 0) {
      return [];
    }
    return this.repo.usersWithDevices(orgId, [...new Set(userIds)], since);
  }

  async removeDead(orgId: string, deviceIds: string[]): Promise<void> {
    if (deviceIds.length === 0) {
      return;
    }
    await this.repo.deleteMany(orgId, deviceIds);
    this.logger.info('dead devices removed', { orgId, count: deviceIds.length });
  }

  pushConfig(): { vapidPublicKey: string | null } {
    return { vapidPublicKey: this.push.webpush?.publicKey ?? null };
  }

  private registrationProblems(input: DeviceRegistration): ValidationProblem[] {
    const problems: ValidationProblem[] = [];
    if (!this.push[input.provider]) {
      problems.push({
        path: 'provider',
        message: `push through ${input.provider} is not configured`,
      });
      return problems;
    }
    if (input.provider === 'apns') {
      const bundleIds = this.push.apns?.bundleIds ?? [];
      if (!input.appId || !bundleIds.includes(input.appId)) {
        problems.push({
          path: 'appId',
          message: 'must be one of the configured iOS bundle ids',
        });
      }
    } else if (input.environment !== undefined) {
      problems.push({
        path: 'environment',
        message: 'applies to apns devices only',
      });
    }
    if (input.provider === 'webpush') {
      if (!input.keys) {
        problems.push({
          path: 'keys',
          message: 'a webpush device needs its p256dh and auth keys',
        });
      }
    } else if (input.keys !== undefined) {
      problems.push({ path: 'keys', message: 'apply to webpush devices only' });
    }
    return problems;
  }
}
