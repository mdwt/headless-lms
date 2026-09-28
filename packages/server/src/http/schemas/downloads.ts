// Downloads resource schemas — a content type whose whole structure is an
// ordered set of media-library assets. The Fastify routes validate
// requests/responses against these, the OpenAPI spec is built from them, and
// the frontend SDK is generated off that spec.
import { z } from 'zod';
import {
  addDownloadAssetInputSchema,
  downloadAssetSchema,
  downloadSchema,
  downloadStatusSchema,
  reorderDownloadAssetsInputSchema,
} from '@headless-lms/core/schemas';
import { ListQuery, paginated } from './shared.js';

export const DownloadStatus = downloadStatusSchema;
export type DownloadStatus = z.infer<typeof DownloadStatus>;

export const Download = downloadSchema;
export type Download = z.infer<typeof Download>;

export const DownloadAsset = downloadAssetSchema;
export type DownloadAsset = z.infer<typeof DownloadAsset>;

export const CreateDownload = z.object({
  title: z.string().min(1),
  description: z.string().default(''),
  category: z.string().default(''),
});
export type CreateDownload = z.infer<typeof CreateDownload>;

export const UpdateDownload = CreateDownload.partial().extend({
  status: DownloadStatus.optional(),
  thumbnailAssetId: z.string().nullable().optional(),
});
export type UpdateDownload = z.infer<typeof UpdateDownload>;

export const DownloadsQuery = ListQuery.extend({
  status: DownloadStatus.optional(),
  category: z.string().optional(),
});
export type DownloadsQuery = z.infer<typeof DownloadsQuery>;

export const DownloadsPage = paginated(Download);
export type DownloadsPage = z.infer<typeof DownloadsPage>;

export const AddDownloadAsset = addDownloadAssetInputSchema;
export type AddDownloadAsset = z.infer<typeof AddDownloadAsset>;

/** `null` restores the `filename` fallback. */
export const RenameDownloadAsset = z.object({
  displayName: z.string().nullable(),
});
export type RenameDownloadAsset = z.infer<typeof RenameDownloadAsset>;

export const ReorderDownloadAssets = reorderDownloadAssetsInputSchema;
export type ReorderDownloadAssets = z.infer<typeof ReorderDownloadAssets>;

export const DownloadIdParam = z.object({ downloadId: z.string() });
export type DownloadIdParam = z.infer<typeof DownloadIdParam>;

export const DownloadAssetParams = z.object({
  downloadId: z.string(),
  assetId: z.string(),
});
export type DownloadAssetParams = z.infer<typeof DownloadAssetParams>;
