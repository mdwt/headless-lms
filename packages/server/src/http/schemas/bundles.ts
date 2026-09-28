// Bundles resource schemas — a named grouping of content items. The Fastify
// routes validate requests/responses against these, the OpenAPI spec is built
// from them, and the frontend SDK is generated off that spec.
import { z } from 'zod';
import { bundleItemSchema, bundleSchema } from '@headless-lms/core/schemas';
import { ListQuery, paginated } from './shared.js';

export const Bundle = bundleSchema;
export type Bundle = z.infer<typeof Bundle>;

export const BundleItem = bundleItemSchema;
export type BundleItem = z.infer<typeof BundleItem>;

export const CreateBundle = z.object({
  name: z.string().min(1),
  contentIds: z.array(z.string()).optional(),
});
export type CreateBundle = z.infer<typeof CreateBundle>;

export const UpdateBundle = z.object({
  name: z.string().min(1).optional(),
});
export type UpdateBundle = z.infer<typeof UpdateBundle>;

export const BundlesQuery = ListQuery;
export type BundlesQuery = z.infer<typeof BundlesQuery>;

export const BundlesPage = paginated(Bundle);
export type BundlesPage = z.infer<typeof BundlesPage>;

export const AddBundleItem = z.object({
  contentId: z.string(),
});
export type AddBundleItem = z.infer<typeof AddBundleItem>;

export const BundleIdParam = z.object({ bundleId: z.string() });
export type BundleIdParam = z.infer<typeof BundleIdParam>;

export const BundleItemParams = z.object({
  bundleId: z.string(),
  contentId: z.string(),
});
export type BundleItemParams = z.infer<typeof BundleItemParams>;
