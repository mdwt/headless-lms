import { z } from 'zod';
import {
  notificationCategoryListSchema,
  notificationCategorySchema,
  notificationKindSchema,
  notificationPreferenceSchema,
  notificationScopeSchema,
  notificationSchema,
  reasonSchema,
} from '@headless-lms/core/schemas';
import type { NotificationView as DomainNotificationView } from '@headless-lms/core/reporting/member';
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
