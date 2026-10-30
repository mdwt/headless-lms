import { z } from 'zod';
import { idSchema, emailSchema, jsonValueSchema } from './shared.js';

export const userSchema = z
  .object({
    id: idSchema,
    externalId: idSchema.nullable(),
    email: emailSchema,
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type User = z.output<typeof userSchema>;
export type UserInput = z.input<typeof userSchema>;

export const createUserInputSchema = z
  .object({
    id: idSchema.optional(),
    externalId: idSchema.optional(),
    email: emailSchema,
    firstName: z.string().optional(),
    lastName: z.string().optional(),
  })
  .strict();
export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const provisionUserInputSchema = z
  .object({
    email: emailSchema,
    firstName: z.string().optional(),
    lastName: z.string().optional(),
  })
  .strict();
export type ProvisionUserInput = z.infer<typeof provisionUserInputSchema>;

export const updateUserInputSchema = z
  .object({
    externalId: idSchema.optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: emailSchema.optional(),
  })
  .strict();
export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;

export const userProfileSchema = z
  .object({
    userId: idSchema,
    displayName: z.string().nullable(),
    headline: z.string().nullable(),
    bio: z.string().nullable(),
    imageAssetOrgId: idSchema.nullable(),
    imageAssetId: idSchema.nullable(),
    extra: jsonValueSchema,
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type UserProfile = z.output<typeof userProfileSchema>;

export const userProfileViewSchema = userProfileSchema
  .extend({ imageUrl: z.string().nullable() })
  .strict();
export type UserProfileView = z.output<typeof userProfileViewSchema>;

export const notificationKindSchema = z.enum([
  'newPostInSpace',
  'newCommentOnPost',
  'replyToYourComment',
  'yourPostWasPublished',
  'yourPostWasRemoved',
  'yourCommentWasRemoved',
  'requestApproved',
  'requestDeclined',
  'invitedToSpace',
  'newMessage',
  'messageRequest',
  'addedToGroupChat',
  'youAreNowAModerator',
  'membershipEndingSoon',
  'welcomeToCommunity',
  'postAwaitingReview',
  'joinRequest',
  'somethingWasFlagged',
  'messageWasFlagged',
]);
export type NotificationKind = z.infer<typeof notificationKindSchema>;

export const notificationSchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    userId: idSchema,
    kind: notificationKindSchema,
    actorOrgUserId: idSchema.nullable(),
    communityId: idSchema.nullable(),
    spaceId: idSchema.nullable(),
    postId: idSchema.nullable(),
    commentId: idSchema.nullable(),
    chatId: idSchema.nullable(),
    messageId: idSchema.nullable(),
    createdAt: z.coerce.date(),
    readAt: z.coerce.date().nullable(),
  })
  .strict();
export type Notification = z.output<typeof notificationSchema>;

export const notificationPreferenceSchema = z
  .object({
    kind: notificationKindSchema,
    inApp: z.boolean(),
    email: z.boolean(),
  })
  .strict();
export type NotificationPreference = z.output<typeof notificationPreferenceSchema>;
