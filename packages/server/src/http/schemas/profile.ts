import { z } from 'zod';
import { jsonValueSchema, userProfileViewSchema } from '@headless-lms/core/schemas';

export const UserProfile = userProfileViewSchema;
export const UpdateProfile = z
  .object({
    displayName: z.string().nullable().optional(),
    headline: z.string().nullable().optional(),
    bio: z.string().nullable().optional(),
    imageAssetOrgId: z.string().nullable().optional(),
    imageAssetId: z.string().nullable().optional(),
    extra: jsonValueSchema.optional(),
  })
  .strict();
