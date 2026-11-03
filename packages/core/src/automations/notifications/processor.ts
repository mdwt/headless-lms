import type { DevicesService, NotificationSettingsService } from '../../identity/index.js';
import { NotFoundError } from '../../shared/errors.js';
import { genId } from '../../shared/id.js';
import { noopLogger } from '../../shared/logger.js';
import { resolveChannels } from '../../shared/notification-settings.js';
import type {
  ChannelRegistry,
  DomainEvent,
  Logger,
  NotificationTypeRegistry,
} from '../../shared/ports.js';
import type {
  NotificationCategory,
  Reason,
  RecipientList,
  StoredSetting,
} from '../../types/index.js';
import type {
  AutomationEngine,
  ChatDebounce,
  NewDelivery,
  NewNotification,
  NotificationCategories,
  NotificationReads,
  NotificationsRepository,
  RecipientRule,
} from '../ports.js';

export const IN_APP = 'inApp';
export const PUSH = 'push';
export const MESSAGE_SENT = 'message.sent';
export const DEVICE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export const noChatDebounce: ChatDebounce = {
  arm: async () => {},
  mentioned: async () => {},
};

type Recipient = NonNullable<RecipientList['recipients']>[number];

interface Pair {
  list: RecipientList;
  type: string;
  reasons: Reason[];
}

interface Person {
  orgUserId: string;
  userId: string;
  pairs: Pair[];
}

interface Group {
  communityId: string | null;
  lists: RecipientList[];
}

interface Filed {
  notification: NewNotification;
  deliveries: NewDelivery[];
}

export type NotificationProcessorParams = {
  rules: Record<string, RecipientRule>;
  reads: NotificationReads;
  types: Pick<NotificationTypeRegistry, 'get'>;
  channels: Pick<ChannelRegistry, 'list' | 'get'>;
  categories: NotificationCategories;
  settings: Pick<NotificationSettingsService, 'getMany'>;
  devices: Pick<DevicesService, 'activeDevices'>;
  repo: Pick<NotificationsRepository, 'insert' | 'pendingDeliveriesForEvent'>;
  engine: Pick<AutomationEngine, 'deliver'>;
  debounce?: ChatDebounce;
  now?: () => Date;
  logger?: Logger;
};

function sameKeys(a: string[], b: string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((key) => right.has(key));
}

export function chatOf(refs: Pick<RecipientList, 'subject' | 'parent'>): string | null {
  if (refs.parent?.type === 'chat') {
    return refs.parent.id;
  }
  return refs.subject?.type === 'chat' ? refs.subject.id : null;
}

export class NotificationProcessor {
  private readonly rules: Record<string, RecipientRule>;
  private readonly reads: NotificationReads;
  private readonly types: Pick<NotificationTypeRegistry, 'get'>;
  private readonly channels: Pick<ChannelRegistry, 'list' | 'get'>;
  private readonly categories: NotificationCategories;
  private readonly settings: Pick<NotificationSettingsService, 'getMany'>;
  private readonly devices: Pick<DevicesService, 'activeDevices'>;
  private readonly repo: Pick<NotificationsRepository, 'insert' | 'pendingDeliveriesForEvent'>;
  private readonly engine: Pick<AutomationEngine, 'deliver'>;
  private readonly debounce: ChatDebounce;
  private readonly now: () => Date;
  private readonly logger: Logger;

  constructor(params: NotificationProcessorParams) {
    this.rules = params.rules;
    this.reads = params.reads;
    this.types = params.types;
    this.channels = params.channels;
    this.categories = params.categories;
    this.settings = params.settings;
    this.devices = params.devices;
    this.repo = params.repo;
    this.engine = params.engine;
    this.debounce = params.debounce ?? noChatDebounce;
    this.now = params.now ?? (() => new Date());
    this.logger = params.logger ?? noopLogger;
  }

  async process(event: DomainEvent): Promise<void> {
    const rule = Object.prototype.hasOwnProperty.call(this.rules, event.type)
      ? this.rules[event.type]
      : undefined;
    if (!rule) {
      return;
    }
    const lists = await rule(event, this.reads);
    await this.file(event.orgId, event.id, lists, {
      occurredAt: new Date(event.occurredAt),
      debounce: true,
    });
  }

  async file(
    orgId: string,
    sourceEventId: string,
    lists: RecipientList[],
    options: { occurredAt: Date; debounce: boolean },
  ): Promise<void> {
    const valid = lists.filter((list) => this.isValid(orgId, sourceEventId, list));
    const filed: Filed[] = [];
    for (const group of this.groups(valid)) {
      const categories = await this.categoriesOf(orgId, sourceEventId, group.communityId);
      if (!categories) {
        continue;
      }
      const expanded: RecipientList[] = [];
      for (const list of group.lists) {
        const ready = list.audience ? await this.expand(orgId, list, categories) : list;
        if (options.debounce && ready.type === MESSAGE_SENT) {
          await this.debounce.arm(orgId, ready, options.occurredAt);
          continue;
        }
        expanded.push(ready);
      }
      filed.push(
        ...(await this.match(orgId, sourceEventId, group.communityId, expanded, categories)),
      );
    }
    if (filed.length > 0) {
      await this.repo.insert(
        orgId,
        filed.map((entry) => entry.notification),
        filed.flatMap((entry) => entry.deliveries),
      );
      this.logger.info('notifications filed', {
        orgId,
        sourceEventId,
        count: filed.length,
        types: [...new Set(filed.map((entry) => entry.notification.type))],
      });
      await this.mentionsInChats(orgId, filed);
    }
    await this.dispatch(orgId, sourceEventId);
  }

  private isValid(orgId: string, sourceEventId: string, list: RecipientList): boolean {
    const drop = (reason: string): false => {
      this.logger.error('notification recipient list dropped', {
        orgId,
        sourceEventId,
        type: list.type,
        scope: list.scope,
        reason,
      });
      return false;
    };
    const declaration = this.types.get(list.type);
    if (!declaration) {
      return drop('unknown type');
    }
    if (!declaration.scopes.includes(list.scope)) {
      return drop('scope not declared');
    }
    const keys = declaration.display[list.scope] ?? [];
    if (!sameKeys(Object.keys(list.display), keys)) {
      return drop('display keys do not match the declaration');
    }
    if ((list.recipients === undefined) === (list.audience === undefined)) {
      return drop('a list needs either recipients or an audience');
    }
    const reasons = list.audience
      ? [list.audience.reason]
      : (list.recipients ?? []).flatMap((recipient) => recipient.reasons);
    if (reasons.some((reason) => !declaration.reasons.includes(reason))) {
      return drop('reason not allowed for the type');
    }
    if (list.audience && list.communityId === null) {
      return drop('an audience needs a community');
    }
    return true;
  }

  private groups(lists: RecipientList[]): Group[] {
    const byCommunity = new Map<string | null, Group>();
    for (const list of lists) {
      const group = byCommunity.get(list.communityId) ?? {
        communityId: list.communityId,
        lists: [],
      };
      group.lists.push(list);
      byCommunity.set(list.communityId, group);
    }
    return [...byCommunity.values()];
  }

  private async categoriesOf(
    orgId: string,
    sourceEventId: string,
    communityId: string | null,
  ): Promise<NotificationCategory[] | null> {
    try {
      return await this.categories.listFor(orgId, communityId);
    } catch (err) {
      if (!(err instanceof NotFoundError)) {
        throw err;
      }
      this.logger.warn('notification group dropped: the community no longer exists', {
        orgId,
        sourceEventId,
        communityId,
      });
      return null;
    }
  }

  private async expand(
    orgId: string,
    list: RecipientList,
    categories: NotificationCategory[],
  ): Promise<RecipientList> {
    const audience = list.audience!;
    const communityId = list.communityId!;
    const category = categories.find((candidate) =>
      candidate.covers.some(
        (cover) => cover.type === list.type && cover.reasons.includes(audience.reason),
      ),
    );
    let orgUserIds: string[] = [];
    if (category) {
      const onByDefault = resolveChannels(
        category,
        [],
        audience.spaceId,
        this.channels.list(),
      ).some((channel) => channel.enabled);
      if (onByDefault) {
        orgUserIds = await this.reads.spaceOpeners(orgId, audience.spaceId);
      } else {
        const switched = await this.reads.switchedOn(
          orgId,
          communityId,
          category.key,
          audience.spaceId,
        );
        orgUserIds =
          switched.length > 0
            ? await this.reads.spaceOpenersAmong(orgId, audience.spaceId, switched)
            : [];
      }
    }
    const excluded = new Set(audience.exclude);
    const candidates = [...new Set(orgUserIds)].filter((id) => !excluded.has(id));
    const muted =
      candidates.length > 0
        ? new Set(
            await this.reads.mutedAmong(
              orgId,
              { type: 'space', id: audience.spaceId },
              candidates,
              this.now(),
            ),
          )
        : new Set<string>();
    const kept = candidates.filter((id) => !muted.has(id));
    const userIds = kept.length > 0 ? await this.reads.userIdsOf(orgId, kept) : {};
    const recipients: Recipient[] = kept.flatMap((orgUserId) => {
      const userId = userIds[orgUserId];
      return userId ? [{ orgUserId, userId, reasons: [audience.reason] }] : [];
    });
    const { audience: _audience, ...rest } = list;
    return { ...rest, recipients };
  }

  private collect(lists: RecipientList[]): Person[] {
    const people = new Map<string, Person>();
    for (const list of lists) {
      for (const recipient of list.recipients ?? []) {
        const person = people.get(recipient.userId) ?? {
          orgUserId: recipient.orgUserId,
          userId: recipient.userId,
          pairs: [],
        };
        person.pairs.push({ list, type: list.type, reasons: [...new Set(recipient.reasons)] });
        people.set(recipient.userId, person);
      }
    }
    return [...people.values()];
  }

  private async match(
    orgId: string,
    sourceEventId: string,
    communityId: string | null,
    lists: RecipientList[],
    categories: NotificationCategory[],
  ): Promise<Filed[]> {
    const people = this.collect(lists);
    if (people.length === 0 || categories.length === 0) {
      return [];
    }
    const settings = await this.settings.getMany(
      orgId,
      people.map((person) => person.userId),
      communityId ? { communityId } : 'org',
      categories.map((category) => category.key),
    );
    const configured = this.channels.list();
    const filed: Filed[] = [];
    for (const person of people) {
      const entry = await this.fileOne(
        orgId,
        sourceEventId,
        communityId,
        person,
        categories,
        settings[person.userId] ?? [],
        configured,
      );
      if (entry) {
        filed.push(entry);
      }
    }
    return filed;
  }

  private async fileOne(
    orgId: string,
    sourceEventId: string,
    communityId: string | null,
    person: Person,
    categories: NotificationCategory[],
    settings: StoredSetting[],
    configured: string[],
  ): Promise<Filed | null> {
    let hasDevice: boolean | undefined;
    for (const category of categories) {
      for (const { pair, cover } of this.coveredPairs(category, person.pairs)) {
        let on = resolveChannels(category, settings, pair.list.spaceId, configured)
          .filter((channel) => channel.enabled)
          .map((channel) => channel.channel);
        if (on.includes(PUSH)) {
          hasDevice ??= await this.hasActiveDevice(orgId, person.userId);
          if (!hasDevice) {
            on = on.filter((channel) => channel !== PUSH);
          }
        }
        if (on.length > 0) {
          return this.filed(sourceEventId, communityId, person, category, pair, cover, on);
        }
      }
    }
    return null;
  }

  private filed(
    sourceEventId: string,
    communityId: string | null,
    person: Person,
    category: NotificationCategory,
    pair: Pair,
    cover: NotificationCategory['covers'][number],
    on: string[],
  ): Filed {
    const list = pair.list;
    const notificationId = genId('notification');
    const reasons = [...new Set(person.pairs.flatMap((candidate) => candidate.reasons))];
    return {
      notification: {
        id: notificationId,
        userId: person.userId,
        sourceEventId,
        type: pair.type,
        scope: list.scope,
        reasons,
        matchedReason: cover.reasons.find((reason) => pair.reasons.includes(reason))!,
        category: category.key,
        communityId,
        spaceId: list.spaceId,
        actorOrgUserId: list.actorOrgUserId,
        subject: list.subject,
        parent: list.parent,
        display: list.display,
        inApp: on.includes(IN_APP),
        createdAt: this.now(),
      },
      deliveries: on
        .filter((channel) => channel !== IN_APP && this.channels.get(channel) !== undefined)
        .map((channel) => ({
          id: genId('notificationDelivery'),
          notificationId,
          channel,
        })),
    };
  }

  private coveredPairs(
    category: NotificationCategory,
    pairs: Pair[],
  ): { pair: Pair; cover: NotificationCategory['covers'][number] }[] {
    const covered: { pair: Pair; cover: NotificationCategory['covers'][number] }[] = [];
    for (const pair of pairs) {
      if (category.perSpace === true && pair.list.spaceId === null) {
        continue;
      }
      const cover = category.covers.find(
        (candidate) =>
          candidate.type === pair.type &&
          candidate.reasons.some((reason) => pair.reasons.includes(reason)),
      );
      if (cover) {
        covered.push({ pair, cover });
      }
    }
    return covered;
  }

  private async hasActiveDevice(orgId: string, userId: string): Promise<boolean> {
    const since = new Date(this.now().getTime() - DEVICE_WINDOW_MS);
    return (await this.devices.activeDevices(orgId, userId, since)).length > 0;
  }

  private async mentionsInChats(orgId: string, filed: Filed[]): Promise<void> {
    for (const { notification } of filed) {
      if (notification.type !== 'mention' || notification.scope !== 'chat') {
        continue;
      }
      const chatId = chatOf(notification);
      if (chatId) {
        await this.debounce.mentioned(orgId, notification.userId, chatId);
      }
    }
  }

  private async dispatch(orgId: string, sourceEventId: string): Promise<void> {
    const pending = await this.repo.pendingDeliveriesForEvent(orgId, sourceEventId);
    for (const delivery of pending) {
      await this.engine.deliver({ orgId, deliveryId: delivery.id });
    }
  }
}
