import { z } from 'zod';
import { idSchema } from './shared.js';

export const entitlementStatusSchema = z.enum(['active', 'revoked']);
export type EntitlementStatus = z.infer<typeof entitlementStatusSchema>;

export const entitlementSchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    orgUserId: idSchema,
    bundleId: idSchema.nullable(),
    contentId: idSchema.nullable(),
    status: entitlementStatusSchema,
    source: z.string(),
    grantedAt: z.coerce.date(),
    expiresAt: z.coerce.date().nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type Entitlement = z.output<typeof entitlementSchema>;
export type EntitlementInput = z.input<typeof entitlementSchema>;

export const entitlementsQuerySchema = z
  .object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    search: z.string().optional(),
    sort: z.string().optional(),
    status: z.enum(['active', 'expired', 'revoked']).optional(),
    source: z.string().optional(),
    orgUserId: idSchema.optional(),
    contentId: idSchema.optional(),
    bundleId: idSchema.optional(),
    type: z.enum(['course', 'download']).optional(),
  })
  .strict();
export type EntitlementsQuery = z.infer<typeof entitlementsQuerySchema>;

/** A grant targets exactly one of: a bundle or a single content item. */
export const grantEntitlementInputSchema = z
  .object({
    orgUserId: idSchema,
    contentId: idSchema.nullish(),
    bundleId: idSchema.nullish(),
    expiresAt: z.coerce.date().nullable(),
  })
  .strict()
  .refine((v) => (v.contentId != null) !== (v.bundleId != null), {
    message: 'Provide exactly one of contentId or bundleId',
  });
export type GrantEntitlementInput = z.output<typeof grantEntitlementInputSchema>;
