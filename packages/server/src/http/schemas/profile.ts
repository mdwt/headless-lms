import { z } from 'zod';
import { jsonValueSchema, userProfileViewSchema } from '@headless-lms/core/schemas';

export const UserProfile = userProfileViewSchema;
export const UpdateProfile = z
  .object({
    displayName: z.string().trim().max(80).nullable().optional(),
    headline: z.string().trim().max(160).nullable().optional(),
    bio: z.string().trim().max(2_000).nullable().optional(),
    imageAssetId: z.string().nullable().optional(),
    extra: jsonValueSchema.optional(),
  })
  .strict();
