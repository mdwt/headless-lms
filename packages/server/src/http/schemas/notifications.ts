import { z } from 'zod';
import {
  notificationCategoryKeySchema,
  notificationChannelKeySchema,
  notificationCategoryListSchema,
  notificationCategorySchema,
  notificationKindSchema,
  notificationPreferenceSchema,
  notificationScopeSchema,
  notificationSchema,
  reasonSchema,
} from '@headless-lms/core/schemas';
import type {
  CommunityNotificationSettingsView as DomainCommunityNotificationSettingsView,
  NotificationView as DomainNotificationView,
} from '@headless-lms/core/reporting/member';
import { paginated, type Matches } from './shared.js';

export const Notification = notificationSchema;
export const NotificationIdParam = z.object({ notificationId: z.string() });

export const NotificationView = z.object({
  id: z.string(),
  kind: notificationKindSchema,
  createdAt: z.coerce.date(),
  readAt: z.coerce.date().nullable(),
  actor: z
    .object({
      orgUserId: z.string(),
      displayName: z.string().nullable(),
      imageUrl: z.string().nullable(),
    })
    .nullable(),
  community: z.object({ id: z.string(), title: z.string() }).nullable(),
  space: z.object({ id: z.string(), name: z.string() }).nullable(),
  post: z
    .object({ id: z.string(), title: z.string() })
    .nullable()
    .describe('Null when the viewer can no longer see the post'),
  commentId: z.string().nullable(),
  chat: z
    .object({ id: z.string(), title: z.string() })
    .nullable()
    .describe('Null when the viewer is not in the chat'),
  messageId: z.string().nullable(),
});
type _NotificationViewMatches = Matches<DomainNotificationView, z.infer<typeof NotificationView>> &
  Matches<z.infer<typeof NotificationView>, DomainNotificationView>;

export const NotificationsPage = paginated(NotificationView).extend({
  unreadCount: z.number().int(),
});

export const MarkedRead = z.object({ updated: z.number().int() });

export const NotificationPreference = notificationPreferenceSchema;
export const NotificationPreferences = z.array(NotificationPreference);
export const SetNotificationPreferences = z
  .object({
    preferences: z
      .array(NotificationPreference)
      .min(1)
      .max(notificationKindSchema.options.length)
      .refine(
        (preferences) => new Set(preferences.map((p) => p.kind)).size === preferences.length,
        { message: 'must name each kind at most once' },
      )
      .describe('One entry per kind to change, each kind at most once; kinds left out keep theirs'),
  })
  .strict();

export const NotificationCategory = notificationCategorySchema;

export const NotificationCategoryList = z.object({
  categories: z.array(NotificationCategory),
  source: z
    .enum(['default', 'stored'])
    .describe('`default` while the list in use is the server default, `stored` once one is saved'),
});

export const ReplaceNotificationCategories = z
  .object({
    categories: notificationCategoryListSchema.describe(
      'The whole ordered list; a notification is filed under the first category that matches',
    ),
  })
  .strict();

export const NotificationCategoryDefaults = z.object({ categories: z.array(NotificationCategory) });

export const NotificationListScopeQuery = z
  .object({ scope: z.enum(['org', 'community']) })
  .strict();

export const NotificationTypeInfo = z.object({
  type: z.string(),
  scopes: z.array(notificationScopeSchema),
  reasons: z.array(reasonSchema),
});
export const NotificationTypeInfos = z.array(NotificationTypeInfo);

export const NotificationChannelInfos = z.array(z.object({ channel: z.string() }));

const ResolvedChannel = z.object({
  channel: z.string(),
  enabled: z.boolean(),
  source: z
    .enum(['locked', 'space', 'community', 'spaceDefault', 'default'])
    .describe(
      'Why the channel is on or off: locked by the category, your setting for the space, your setting for the whole community (or the org), the default for the space, or the category default',
    ),
  locked: z.boolean(),
});

const NotificationSettingsCategory = z.object({
  key: z.string(),
  perSpace: z.boolean(),
  channels: z.array(ResolvedChannel),
  spaces: z
    .array(z.object({ spaceId: z.string(), channels: z.array(ResolvedChannel) }))
    .optional()
    .describe('Per-space categories only: every space you can open'),
});

export const CommunityNotificationSettings = z.object({
  communityId: z.string(),
  categories: z.array(NotificationSettingsCategory),
});
type _CommunityNotificationSettingsMatches = Matches<
  DomainCommunityNotificationSettingsView,
  z.infer<typeof CommunityNotificationSettings>
>;

export const OrgNotificationSettings = z.object({
  categories: z.array(NotificationSettingsCategory),
});

export const PatchNotificationSettings = z
  .object({
    settings: z
      .array(
        z
          .object({
            category: notificationCategoryKeySchema,
            spaceId: z.string().min(1).max(64).optional(),
            channel: notificationChannelKeySchema,
            enabled: z
              .boolean()
              .nullable()
              .describe('null removes your choice, so the default applies again'),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();

const DeviceFields = {
  id: z.string(),
  provider: z.enum(['apns', 'fcm', 'webpush']),
  token: z.string(),
  p256dh: z.string().nullable(),
  auth: z.string().nullable(),
  appId: z.string().nullable(),
  environment: z.enum(['production', 'sandbox']).nullable(),
};

export const Device = z.object(DeviceFields);
export const DeviceList = z.array(z.object({ ...DeviceFields, lastSeenAt: z.coerce.date() }));
export const DeviceIdParam = z.object({ deviceId: z.string() });

export const RegisterDevice = z
  .object({
    provider: z.enum(['apns', 'fcm', 'webpush']),
    token: z
      .string()
      .min(1)
      .max(4096)
      .describe('The APNs device token, the FCM registration token, or the Web Push endpoint URL'),
    keys: z
      .object({ p256dh: z.string().min(1).max(512), auth: z.string().min(1).max(512) })
      .strict()
      .optional()
      .describe('The Web Push subscription keys; webpush only'),
    appId: z
      .string()
      .min(1)
      .max(255)
      .optional()
      .describe('The iOS bundle id or Android package name'),
    environment: z.enum(['production', 'sandbox']).optional().describe('apns only'),
  })
  .strict();

export const PushConfigView = z.object({ vapidPublicKey: z.string().nullable() });
