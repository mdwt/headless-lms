import type {
  ChannelRegistry,
  EmailTemplateId,
  EmailTemplateParams,
  JsonValue,
  NotificationCategory,
  NotificationChannel,
  NotificationTypeDeclaration,
  NotificationTypeRegistry,
  PushDevice,
  PushSender,
  StoredNotification,
} from '@headless-lms/core/shared/ports';
import { DEVICE_WINDOW_MS, PUSH } from '@headless-lms/core/automations';
import type { PushConfig } from '@headless-lms/core/types';
import { offeringConfigured } from '@headless-lms/core/shared/notification-categories';
import { isEmailRejected, isEmailRenderError, type Mailer } from '@headless-lms/core/shared/mailer';

export const IN_APP = 'inApp';
export const EMAIL = 'email';

const CONTENT_SUBJECTS = new Set(['course', 'download', 'community', 'bundle']);

export function buildNotificationTypeRegistry(
  declarations: NotificationTypeDeclaration[],
  defaults: { community: NotificationCategory[]; org: NotificationCategory[] },
  configured: string[],
): NotificationTypeRegistry {
  const byType = new Map<string, NotificationTypeDeclaration>();
  for (const declaration of declarations) {
    if (byType.has(declaration.type)) {
      throw new Error(`notification type ${declaration.type} is declared twice`);
    }
    byType.set(declaration.type, declaration);
  }
  const lists = {
    community: offeringConfigured(defaults.community, configured),
    org: offeringConfigured(defaults.org, configured),
  };
  return {
    list: () =>
      declarations.map(({ type, scopes, reasons }) => ({
        type,
        scopes: [...scopes],
        reasons: [...reasons],
      })),
    get: (type) => byType.get(type),
    defaults: (scope) => structuredClone(lists[scope]),
  };
}

export function buildChannelRegistry(channels: NotificationChannel[]): ChannelRegistry {
  const byKey = new Map<string, NotificationChannel>();
  for (const channel of channels) {
    if (channel.key === IN_APP || byKey.has(channel.key)) {
      throw new Error(`notification channel ${channel.key} is registered twice`);
    }
    byKey.set(channel.key, channel);
  }
  const keys = [IN_APP, ...byKey.keys()];
  return {
    list: () => [...keys],
    get: (key) => byKey.get(key),
  };
}

export function emailTemplateFor(
  declaration: NotificationTypeDeclaration,
  notification: Pick<StoredNotification, 'scope' | 'matchedReason'>,
): EmailTemplateId | null {
  const email = declaration.email?.[notification.scope];
  if (!email) {
    return null;
  }
  return email.byReason?.[notification.matchedReason] ?? email.template;
}

export function emailParams(notification: StoredNotification): Record<string, JsonValue> {
  const ids: Record<string, JsonValue> = {};
  for (const ref of [notification.parent, notification.subject]) {
    if (ref) {
      ids[`${ref.type}Id`] = ref.id;
    }
  }
  if (notification.subject && CONTENT_SUBJECTS.has(notification.subject.type)) {
    ids.contentId = notification.subject.id;
  }
  if (notification.communityId) {
    ids.communityId = notification.communityId;
  }
  if (notification.spaceId) {
    ids.spaceId = notification.spaceId;
  }
  return { ...ids, ...notification.display };
}

export function emailChannel(deps: {
  mailer: Pick<Mailer, 'send'>;
  types: NotificationTypeRegistry;
  emailOf: (orgId: string, userId: string) => Promise<string | null>;
}): NotificationChannel {
  return {
    key: EMAIL,
    recipient: async (orgId, userId) => {
      const email = await deps.emailOf(orgId, userId);
      return email ? { email } : null;
    },
    deliver: async (notification, to) => {
      const declaration = deps.types.get(notification.type);
      const template = declaration ? emailTemplateFor(declaration, notification) : null;
      if (!to.email) {
        return { accepted: false, deadDeviceIds: [], error: 'no address' };
      }
      if (!template) {
        return {
          accepted: false,
          deadDeviceIds: [],
          error: `no email template for ${notification.type} in ${notification.scope}`,
        };
      }
      try {
        await deps.mailer.send(
          to.email,
          template,
          emailParams(notification) as unknown as EmailTemplateParams[typeof template],
        );
      } catch (err) {
        if (isEmailRejected(err) || isEmailRenderError(err)) {
          return { accepted: false, deadDeviceIds: [], error: err.message };
        }
        throw err;
      }
      return { accepted: true, deadDeviceIds: [] };
    },
  };
}

export function renderPushText(template: string, display: Record<string, JsonValue>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_placeholder, key: string) => {
    const value = display[key];
    if (typeof value === 'string') {
      return value;
    }
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
      return value.join(', ');
    }
    return '';
  });
}

export function configuredPushSender(
  config: PushConfig,
  sender: PushSender | undefined,
): PushSender | null {
  const configured = Object.values(config).some((provider) => provider !== undefined);
  return configured && sender ? sender : null;
}

export type ActiveDevices = (orgId: string, userId: string, since: Date) => Promise<PushDevice[]>;

export function pushChannel(deps: {
  sender: PushSender;
  types: NotificationTypeRegistry;
  activeDevices: ActiveDevices;
  now?: () => Date;
}): NotificationChannel {
  const now = deps.now ?? (() => new Date());
  return {
    key: PUSH,
    recipient: async (orgId, userId) => {
      const since = new Date(now().getTime() - DEVICE_WINDOW_MS);
      const devices = await deps.activeDevices(orgId, userId, since);
      return devices.length > 0 ? { devices } : null;
    },
    deliver: async (notification, to) => {
      const text = deps.types.get(notification.type)?.push?.[notification.scope];
      if (!text || !to.devices) {
        throw new Error(`no push text for ${notification.type} in ${notification.scope}`);
      }
      return deps.sender.send(to.devices, {
        title: renderPushText(text.title, notification.display),
        body: renderPushText(text.body, notification.display),
        data: {
          notificationId: notification.id,
          type: notification.type,
          subject: notification.subject,
          parent: notification.parent,
          communityId: notification.communityId,
          spaceId: notification.spaceId,
        },
      });
    },
  };
}

export function buildNotificationRegistries(deps: {
  declarations: NotificationTypeDeclaration[];
  defaults: { community: NotificationCategory[]; org: NotificationCategory[] };
  mailer: Pick<Mailer, 'send'> | null;
  emailOf: (orgId: string, userId: string) => Promise<string | null>;
  push: { sender: PushSender; activeDevices: ActiveDevices } | null;
  channels: NotificationChannel[];
}): { types: NotificationTypeRegistry; channels: ChannelRegistry } {
  const configured = [
    IN_APP,
    ...(deps.mailer ? [EMAIL] : []),
    ...(deps.push ? [PUSH] : []),
    ...deps.channels.map((channel) => channel.key),
  ];
  const types = buildNotificationTypeRegistry(deps.declarations, deps.defaults, configured);
  const channels = buildChannelRegistry([
    ...(deps.mailer ? [emailChannel({ mailer: deps.mailer, types, emailOf: deps.emailOf })] : []),
    ...(deps.push ? [pushChannel({ ...deps.push, types })] : []),
    ...deps.channels,
  ]);
  return { types, channels };
}
