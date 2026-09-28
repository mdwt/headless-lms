// Assets (media library) resource schemas. An Asset is a tracked object in
// private storage; files are uploaded via a presigned PUT and served via a
// presigned GET. Domain objects (e.g. a lesson) reference an asset by id.
// The Asset payload shape is owned by @headless-lms/core/schemas; route-local
// schemas define endpoint-only concerns such as params and pagination.
import { z } from 'zod';
import {
  assetKindSchema,
  assetSchema,
  assetStatusSchema,
  downloadTicketSchema,
  uploadTicketSchema,
} from '@headless-lms/core/schemas';
import { ListQuery, paginated } from './shared.js';

export const AssetKind = assetKindSchema;
export type AssetKind = z.infer<typeof AssetKind>;

export const AssetStatus = assetStatusSchema;
export type AssetStatus = z.infer<typeof AssetStatus>;

export const Asset = assetSchema;
export type Asset = z.infer<typeof Asset>;

export const AssetsQuery = ListQuery.extend({ kind: AssetKind.optional() });
export type AssetsQuery = z.infer<typeof AssetsQuery>;

export const AssetsPage = paginated(Asset);
export type AssetsPage = z.infer<typeof AssetsPage>;

export const AssetIdParam = z.object({ id: z.string() });
export type AssetIdParam = z.infer<typeof AssetIdParam>;

/** Register an asset and get a presigned upload URL. */
export const RequestUpload = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  kind: AssetKind,
});
export type RequestUpload = z.infer<typeof RequestUpload>;

export const UploadTicket = uploadTicketSchema;
export type UploadTicket = z.infer<typeof UploadTicket>;

/** Optional override of the download filename (Content-Disposition). */
export const RequestDownload = z.object({ filename: z.string().optional() });
export type RequestDownload = z.infer<typeof RequestDownload>;

export const DownloadTicket = downloadTicketSchema;
export type DownloadTicket = z.infer<typeof DownloadTicket>;
