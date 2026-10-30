import { z } from 'zod';
import { boundedJsonSchema, idSchema, userProfileViewSchema } from '@headless-lms/core/schemas';

export const UserProfile = userProfileViewSchema.omit({ imageAssetOrgId: true }).strip();
export const UpdateProfile = z
  .object({
    displayName: z.string().trim().max(80).nullable().optional(),
    headline: z.string().trim().max(160).nullable().optional(),
    bio: z.string().trim().max(2_000).nullable().optional(),
    imageAssetId: idSchema
      .nullable()
      .optional()
      .describe('A finalized image you uploaded through `requestMemberUpload`; null clears it'),
    extra: boundedJsonSchema(16 * 1024).optional(),
  })
  .strict();
