import { z } from 'zod';
import type { NotificationCategory, Reason, SubjectRef } from '../notifications.js';

export const reasonSchema = z.enum([
  'subject',
  'post_author',
  'comment_author',
  'message_author',
  'follower',
  'thread_participant',
  'mentioned',
  'participant',
  'space_member',
  'community_member',
  'course_member',
  'moderator',
  'staff',
]) satisfies z.ZodType<Reason>;

export const notificationScopeSchema = z.enum(['org', 'community', 'space', 'chat']);

export const subjectTypeSchema = z.enum([
  'post',
  'comment',
  'chat',
  'message',
  'space',
  'community',
  'course',
  'download',
  'bundle',
  'activity',
]) satisfies z.ZodType<SubjectRef['type']>;

export const notificationCategoryKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,63}$/, 'must be lower case letters, digits and underscores');

export const notificationTypeKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_.]{0,63}$/, 'must be a notification type key');

export const notificationChannelKeySchema = z
  .string()
  .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/, 'must be a channel key');

export const notificationCategorySchema = z
  .object({
    key: notificationCategoryKeySchema,
    covers: z
      .array(
        z
          .object({
            type: notificationTypeKeySchema,
            reasons: z.array(reasonSchema).min(1).max(13),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    channels: z.record(
      notificationChannelKeySchema,
      z.object({ default: z.boolean(), locked: z.boolean() }).strict(),
    ),
    perSpace: z.boolean().optional(),
    spaceDefaults: z
      .record(z.string().min(1).max(64), z.record(notificationChannelKeySchema, z.boolean()))
      .optional(),
  })
  .strict() satisfies z.ZodType<NotificationCategory>;

export const notificationCategoryListSchema = z.array(notificationCategorySchema).max(100);
