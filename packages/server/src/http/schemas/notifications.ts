import { z } from 'zod';
import {
  jsonValueSchema,
  notificationCategoryKeySchema,
  notificationChannelKeySchema,
  notificationCategoryListSchema,
  notificationCategorySchema,
  notificationScopeSchema,
  notificationTypeKeySchema,
  reasonSchema,
  subjectTypeSchema,
} from '@headless-lms/core/schemas';
import type {
  CommunityNotificationSettingsView as DomainCommunityNotificationSettingsView,
  NotificationUnreadCounts as DomainNotificationUnreadCounts,
  NotificationView as DomainNotificationView,
} from '@headless-lms/core/reporting/member';
import { PageQuery, paginated, type Matches } from './shared.js';

export const NotificationIdParam = z.object({ notificationId: z.string() });

function commaSeparated<T extends string>(item: z.ZodType<T, string>, description: string) {
  return z
    .string()
    .max(2000)
    .transform((value) =>
      value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0),
    )
    .pipe(z.array(item).min(1).max(50))
    .describe(description);
}

function scopeMatchesCommunity(
  filter: { scope?: 'org' | 'community'; communityId?: string; includeOrg?: boolean },
  ctx: z.RefinementCtx,
): void {
  if (filter.scope === 'org' && filter.communityId !== undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['communityId'],
      message: '`communityId` implies `scope=community`; it cannot go with `scope=org`',
    });
  }
  if (filter.includeOrg === true && filter.communityId === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['includeOrg'],
      message: '`includeOrg` goes with `communityId`',
    });
  }
  if (filter.includeOrg === true && filter.scope !== undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['includeOrg'],
      message: '`includeOrg` cannot go with `scope`',
    });
  }
}

const notificationFilterShape = z
  .object({
    scope: z
      .enum(['org', 'community'])
      .optional()
      .describe('`org`: the org list only; `community`: notifications in any community'),
    communityId: z
      .string()
      .min(1)
      .max(64)
      .optional()
      .describe('Notifications in this community; implies `scope=community`'),
    includeOrg: z
      .stringbool()
      .optional()
      .describe(
        'With `communityId`, `true` adds the org list (notifications in no community); not with `scope`',
      ),
    category: commaSeparated(
      notificationCategoryKeySchema,
      'One or more category keys, comma separated',
    ).optional(),
    reason: commaSeparated(
      reasonSchema,
      'One or more reasons, comma separated; matches any',
    ).optional(),
    type: commaSeparated(
      notificationTypeKeySchema,
      'One or more types, comma separated',
    ).optional(),
    unread: z.stringbool().optional().describe('`true` for unread notifications only'),
  })
  .strict();

export const NotificationFilterQuery = notificationFilterShape.superRefine(scopeMatchesCommunity);

export const NotificationListQuery = PageQuery.extend(notificationFilterShape.shape)
  .strict()
  .superRefine(scopeMatchesCommunity);

const NotificationItem = z.object({
  type: subjectTypeSchema,
  id: z.string(),
  title: z.string().optional(),
  excerpt: z.string().optional(),
});

export const NotificationView = z.object({
  id: z.string(),
  type: z.string(),
  scope: notificationScopeSchema,
  reasons: z.array(reasonSchema),
  matchedReason: reasonSchema.describe(
    'The reason of the pair the category matched, which picks the wording, such as a reply to your comment',
  ),
  category: z.string(),
  display: z
    .record(z.string(), jsonValueSchema)
    .describe('The text stored when the notification was sent'),
  community: z.object({ id: z.string(), title: z.string() }).nullable(),
  space: z.object({ id: z.string(), name: z.string() }).nullable(),
  actor: z
    .object({
      orgUserId: z.string(),
      name: z.string().nullable(),
      imageUrl: z.string().nullable(),
    })
    .nullable(),
  subject: NotificationItem.nullable().describe(
    'What the notification is about, with its current title or excerpt; null when you can no longer open it or it was deleted',
  ),
  parent: NotificationItem.nullable().describe(
    "The subject's container, such as a comment's post; null when you can no longer open it or it was deleted",
  ),
  createdAt: z.coerce.date(),
  readAt: z.coerce.date().nullable(),
});
type _NotificationViewMatches = Matches<DomainNotificationView, z.infer<typeof NotificationView>> &
  Matches<z.infer<typeof NotificationView>, DomainNotificationView>;

export const NotificationsPage = paginated(NotificationView).extend({
  unreadCount: z.number().int().describe('Unread notifications matching the same filters'),
});

export const NotificationUnreadCounts = z.object({
  org: z.number().int(),
  communities: z.array(z.object({ communityId: z.string(), unread: z.number().int() })),
});
type _NotificationUnreadCountsMatches = Matches<
  DomainNotificationUnreadCounts,
  z.infer<typeof NotificationUnreadCounts>
>;

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
