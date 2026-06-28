// Assets (media library) resource schemas. An Asset is a tracked object in
// private storage; files are uploaded via a presigned PUT and served via a
// presigned GET. Domain objects (e.g. a lesson) reference an asset by id.
import { z } from "zod";
import { ListQuery, paginated } from "./shared.js";

export const AssetKind = z.enum(["video", "download", "content"]);
export type AssetKind = z.infer<typeof AssetKind>;

export const AssetStatus = z.enum(["pending", "ready"]);
export type AssetStatus = z.infer<typeof AssetStatus>;

export const Asset = z.object({
  id: z.string(),
  orgId: z.string(),
  key: z.string(),
  kind: AssetKind,
  filename: z.string(),
  contentType: z.string(),
  size: z.number().int(),
  status: AssetStatus,
  uploadedBy: z.string(),
  createdAt: z.string(),
});
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

export const UploadTicket = z.object({
  asset: Asset,
  uploadUrl: z.string(),
  method: z.literal("PUT"),
  expiresInSeconds: z.number().int(),
  headers: z.record(z.string(), z.string()),
});
export type UploadTicket = z.infer<typeof UploadTicket>;

/** Optional override of the download filename (Content-Disposition). */
export const RequestDownload = z.object({ filename: z.string().optional() });
export type RequestDownload = z.infer<typeof RequestDownload>;

export const DownloadTicket = z.object({
  url: z.string(),
  asset: Asset,
});
export type DownloadTicket = z.infer<typeof DownloadTicket>;
