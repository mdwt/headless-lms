// Bundles resource schemas — a named grouping of content items. The Fastify
// routes validate requests/responses against these, the OpenAPI spec is built
// from them, and the frontend SDK is generated off that spec.
import { z } from 'zod';
import { bundleItemSchema, bundleSchema, idSchema } from '@headless-lms/core/schemas';
import { ListQuery, paginated } from './shared.js';

export const Bundle = bundleSchema;
export type Bundle = z.infer<typeof Bundle>;

export const BundleItem = bundleItemSchema;
export type BundleItem = z.infer<typeof BundleItem>;

export const CreateBundle = z.object({
  name: z.string().trim().min(1).max(200),
  contentIds: z.array(idSchema).max(500).optional(),
});
export type CreateBundle = z.infer<typeof CreateBundle>;

export const UpdateBundle = z.object({
  name: z.string().trim().min(1).max(200).optional(),
});
export type UpdateBundle = z.infer<typeof UpdateBundle>;

export const BundlesQuery = ListQuery;
export type BundlesQuery = z.infer<typeof BundlesQuery>;

export const BundlesPage = paginated(Bundle);
export type BundlesPage = z.infer<typeof BundlesPage>;

export const AddBundleItem = z.object({
  contentId: idSchema,
});
export type AddBundleItem = z.infer<typeof AddBundleItem>;

export const BundleIdParam = z.object({ bundleId: z.string() });
export type BundleIdParam = z.infer<typeof BundleIdParam>;

export const BundleItemParams = z.object({
  bundleId: z.string(),
  contentId: idSchema,
});
export type BundleItemParams = z.infer<typeof BundleItemParams>;
