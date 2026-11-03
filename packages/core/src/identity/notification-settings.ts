import type { NotificationCategory, SettingsScope, StoredSetting } from '../types/index.js';
import type { ChannelRegistry, Logger } from '../shared/ports.js';
import { NotFoundError, ValidationError, type ValidationProblem } from '../shared/errors.js';
import { noopLogger } from '../shared/logger.js';
import type {
  CommunityAccessReader,
  MemberActor,
  NotificationCategoryReader,
  NotificationSettingsRepository,
  NotificationSettingsService,
  SettingChange,
  SettingKey,
} from './ports.js';

function communityOf(scope: SettingsScope): string | null {
  return scope === 'org' ? null : scope.communityId;
}

function keyOf(key: SettingKey): string {
  return JSON.stringify([key.communityId, key.spaceId, key.category, key.channel]);
}

export type NotificationSettingsServiceParams = {
  repo: NotificationSettingsRepository;
  categories: NotificationCategoryReader;
  access: CommunityAccessReader;
  channels: Pick<ChannelRegistry, 'list'>;
  logger?: Logger;
};

export class NotificationSettingsServiceImpl implements NotificationSettingsService {
  private readonly repo: NotificationSettingsRepository;
  private readonly categories: NotificationCategoryReader;
  private readonly access: CommunityAccessReader;
  private readonly channels: Pick<ChannelRegistry, 'list'>;
  private readonly logger: Logger;

  constructor(params: NotificationSettingsServiceParams) {
    this.repo = params.repo;
    this.categories = params.categories;
    this.access = params.access;
    this.channels = params.channels;
    this.logger = params.logger ?? noopLogger;
  }

  async get(orgId: string, userId: string, scope: SettingsScope): Promise<StoredSetting[]> {
    const rows = await this.repo.forUsers(orgId, [userId], communityOf(scope), null);
    return rows.map(({ userId: _userId, ...setting }) => setting);
  }

  async getMany(
    orgId: string,
    userIds: string[],
    scope: SettingsScope,
    categories: string[],
  ): Promise<Record<string, StoredSetting[]>> {
    const unique = [...new Set(userIds)];
    const result: Record<string, StoredSetting[]> = Object.fromEntries(
      unique.map((userId) => [userId, []]),
    );
    if (unique.length === 0 || categories.length === 0) {
      return result;
    }
    const rows = await this.repo.forUsers(orgId, unique, communityOf(scope), categories);
    for (const { userId, ...setting } of rows) {
      result[userId]?.push(setting);
    }
    return result;
  }

  async set(
    orgId: string,
    actor: MemberActor,
    scope: SettingsScope,
    changes: SettingChange[],
  ): Promise<void> {
    const communityId = communityOf(scope);
    let list: NotificationCategory[];
    if (communityId === null) {
      list = await this.categories.orgList(orgId);
    } else {
      if (!(await this.access.canOpen(orgId, actor, communityId))) {
        throw new NotFoundError('Community', communityId);
      }
      list = await this.categories.communityList(orgId, communityId);
    }
    const configured = this.channels.list();
    const problems: ValidationProblem[] = [];
    const byKey = new Map<string, { key: SettingKey; enabled: boolean | null }>();
    changes.forEach((change, index) => {
      const at = `settings[${index}]`;
      const category = list.find((candidate) => candidate.key === change.category);
      if (!category) {
        problems.push({
          path: `${at}.category`,
          message: `there is no category ${change.category}`,
        });
        return;
      }
      const offered = category.channels[change.channel];
      if (!offered || !configured.includes(change.channel)) {
        problems.push({
          path: `${at}.channel`,
          message: `${change.category} does not offer the channel ${change.channel}`,
        });
        return;
      }
      if (offered.locked) {
        problems.push({
          path: `${at}.channel`,
          message: `the channel ${change.channel} of ${change.category} is locked`,
        });
        return;
      }
      if (change.spaceId !== undefined && category.perSpace !== true) {
        problems.push({
          path: `${at}.spaceId`,
          message: `${change.category} cannot be set per space`,
        });
        return;
      }
      const key: SettingKey = {
        communityId,
        spaceId: change.spaceId ?? null,
        category: change.category,
        channel: change.channel,
      };
      byKey.set(keyOf(key), { key, enabled: change.enabled });
    });
    if (problems.length > 0) {
      throw new ValidationError(problems);
    }
    const entries = [...byKey.values()];
    await this.repo.apply(
      orgId,
      actor.userId,
      entries.flatMap(({ key, enabled }) => (enabled === null ? [] : [{ ...key, enabled }])),
      entries.flatMap(({ key, enabled }) => (enabled === null ? [key] : [])),
      new Date(),
    );
    this.logger.info('notification settings changed', {
      orgId,
      userId: actor.userId,
      communityId,
      count: entries.length,
    });
  }

  switchedOn(
    orgId: string,
    communityId: string,
    category: string,
    spaceId: string | null,
  ): Promise<string[]> {
    return this.repo.switchedOn(orgId, communityId, category, spaceId);
  }
}
