import { z } from 'zod';
import {
  notificationKindSchema,
  notificationPreferenceSchema,
  notificationSchema,
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
