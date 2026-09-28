import { z } from 'zod';
import { activityCommentsRuleSchema, commentSettingsSchema } from './discussion.js';
import { idSchema, jsonValueSchema } from './shared.js';

export const contentTypeSchema = z.enum(['course', 'download']);
export type ContentType = z.infer<typeof contentTypeSchema>;

export const courseStatusSchema = z.enum(['draft', 'published']);
export type CourseStatus = z.infer<typeof courseStatusSchema>;

export const courseSettingsSchema = z
  .object({
    transcriptDownloads: z.boolean(),
    comments: commentSettingsSchema.optional(),
  })
  .strict();
export type CourseSettings = z.infer<typeof courseSettingsSchema>;

/** Defaults for keys a stored settings row doesn't carry (or no row at all). */
export const courseSettingsDefaults: CourseSettings = { transcriptDownloads: false };

export const activitySettingsSchema = z
  .object({
    comments: activityCommentsRuleSchema.optional(),
  })
  .strict();
export type ActivitySettings = z.infer<typeof activitySettingsSchema>;

export const bundleSchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    name: z.string(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type Bundle = z.output<typeof bundleSchema>;
export type BundleInput = z.input<typeof bundleSchema>;

export const bundleItemSchema = z
  .object({
    orgId: idSchema,
    bundleId: idSchema,
    contentId: idSchema,
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type BundleItem = z.output<typeof bundleItemSchema>;
export type BundleItemInput = z.input<typeof bundleItemSchema>;

export const listBundlesQuerySchema = z
  .object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    search: z.string().optional(),
    sort: z.string().optional(),
  })
  .strict();
export type ListBundlesQuery = z.infer<typeof listBundlesQuerySchema>;

export const createBundleInputSchema = z
  .object({
    name: z.string(),
    /** Content to put in the bundle at creation — bundle and items land together. */
    contentIds: z.array(idSchema).optional(),
  })
  .strict();
export type CreateBundleInput = z.infer<typeof createBundleInputSchema>;

export const updateBundleInputSchema = z
  .object({
    name: z.string().optional(),
  })
  .strict();
export type UpdateBundleInput = z.infer<typeof updateBundleInputSchema>;

export const contentItemSchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    type: contentTypeSchema,
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type ContentItem = z.output<typeof contentItemSchema>;
export type ContentItemInput = z.input<typeof contentItemSchema>;

export const courseSchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    type: z.literal('course'),
    title: z.string(),
    slug: z.string(),
    description: z.string(),
    status: courseStatusSchema,
    category: z.string(),
    thumbnailAssetId: idSchema.nullable(),
    settings: courseSettingsSchema,
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type Course = z.output<typeof courseSchema>;

export const activitySchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    moduleId: idSchema,
    courseId: idSchema,
    seq: z.number().int().min(0),
    settings: jsonValueSchema.nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type Activity = z.output<typeof activitySchema>;
export type ActivityInput = z.input<typeof activitySchema>;

export const moduleSchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    courseId: idSchema,
    title: z.string(),
    seq: z.number().int().min(0),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type Module = z.output<typeof moduleSchema>;
export type ModuleInput = z.input<typeof moduleSchema>;

export const activityAssetSchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    activityId: idSchema,
    assetId: idSchema,
    seq: z.number().int(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type ActivityAsset = z.output<typeof activityAssetSchema>;
export type ActivityAssetInput = z.input<typeof activityAssetSchema>;

export const saveActivityInputSchema = z
  .object({
    settings: jsonValueSchema.optional(),
    assetIds: z.array(idSchema).optional(),
  })
  .strict();
export type SaveActivityInput = z.infer<typeof saveActivityInputSchema>;

export const listCoursesQuerySchema = z
  .object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    search: z.string().optional(),
    sort: z.string().optional(),
    status: courseStatusSchema.optional(),
    category: z.string().optional(),
  })
  .strict();
export type ListCoursesQuery = z.infer<typeof listCoursesQuerySchema>;

export const createCourseInputSchema = z
  .object({
    title: z.string(),
    description: z.string().optional(),
    category: z.string().optional(),
  })
  .strict();
export type CreateCourseInput = z.infer<typeof createCourseInputSchema>;

export const updateCourseInputSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    category: z.string().optional(),
    status: courseStatusSchema.optional(),
    thumbnailAssetId: idSchema.nullable().optional(),
  })
  .strict();
export type UpdateCourseInput = z.infer<typeof updateCourseInputSchema>;

export const downloadStatusSchema = z.enum(['draft', 'published']);
export type DownloadStatus = z.infer<typeof downloadStatusSchema>;

export const downloadSchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    type: z.literal('download'),
    title: z.string(),
    slug: z.string(),
    description: z.string(),
    status: downloadStatusSchema,
    category: z.string(),
    thumbnailAssetId: idSchema.nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type Download = z.output<typeof downloadSchema>;
export type DownloadInput = z.input<typeof downloadSchema>;

export const downloadAssetSchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    downloadId: idSchema,
    assetId: idSchema,
    seq: z.number().int(),
    displayName: z.string().nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type DownloadAsset = z.output<typeof downloadAssetSchema>;
export type DownloadAssetInput = z.input<typeof downloadAssetSchema>;

export const listDownloadsQuerySchema = z
  .object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    search: z.string().optional(),
    sort: z.string().optional(),
    status: downloadStatusSchema.optional(),
    category: z.string().optional(),
  })
  .strict();
export type ListDownloadsQuery = z.infer<typeof listDownloadsQuerySchema>;

export const createDownloadInputSchema = z
  .object({
    title: z.string(),
    description: z.string().optional(),
    category: z.string().optional(),
  })
  .strict();
export type CreateDownloadInput = z.infer<typeof createDownloadInputSchema>;

export const updateDownloadInputSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    category: z.string().optional(),
    status: downloadStatusSchema.optional(),
    thumbnailAssetId: idSchema.nullable().optional(),
  })
  .strict();
export type UpdateDownloadInput = z.infer<typeof updateDownloadInputSchema>;

export const addDownloadAssetInputSchema = z
  .object({
    assetId: idSchema,
    displayName: z.string().optional(),
  })
  .strict();
export type AddDownloadAssetInput = z.infer<typeof addDownloadAssetInputSchema>;

export const reorderDownloadAssetsInputSchema = z
  .object({
    assetIds: z.array(idSchema),
  })
  .strict();
export type ReorderDownloadAssetsInput = z.infer<typeof reorderDownloadAssetsInputSchema>;
