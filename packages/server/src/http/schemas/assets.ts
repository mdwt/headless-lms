import { z } from 'zod';
import {
  assetKindSchema,
  assetReferenceSchema,
  assetSchema,
  assetSourceSchema,
  assetStatusSchema,
  downloadTicketSchema,
  uploadTicketSchema,
} from '@headless-lms/core/schemas';
import { ListQuery, paginated } from './shared.js';

export const AssetKind = assetKindSchema.describe(
  'The media class, derived by the server from the content type.',
);
export type AssetKind = z.infer<typeof AssetKind>;

export const AssetSource = assetSourceSchema.describe(
  "Where the file came from: `library` is the org's media uploaded by staff, `member` is a person's own upload.",
);
export type AssetSource = z.infer<typeof AssetSource>;

export const AssetStatus = assetStatusSchema;
export type AssetStatus = z.infer<typeof AssetStatus>;

export const Asset = assetSchema.extend({ kind: AssetKind, source: AssetSource });
export type Asset = z.infer<typeof Asset>;

export const AssetsQuery = ListQuery.extend({
  kind: AssetKind.optional(),
  source: AssetSource.optional().describe('Defaults to `library`.'),
});
export type AssetsQuery = z.infer<typeof AssetsQuery>;

export const AssetsPage = paginated(Asset);
export type AssetsPage = z.infer<typeof AssetsPage>;

export const AssetIdParam = z.object({ id: z.string() });
export type AssetIdParam = z.infer<typeof AssetIdParam>;

export const RequestUpload = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1).describe('The media class is derived from this.'),
});
export type RequestUpload = z.infer<typeof RequestUpload>;

export const RequestMemberUpload = z.object({
  filename: z.string().min(1),
  contentType: z
    .string()
    .regex(/^image\//i, 'A member upload must be an image')
    .describe('Must be an `image/*` type. The size is checked when the upload is finalized.'),
});
export type RequestMemberUpload = z.infer<typeof RequestMemberUpload>;

export const UploadTicket = uploadTicketSchema.extend({ asset: Asset });
export type UploadTicket = z.infer<typeof UploadTicket>;

export const RequestDownload = z.object({ filename: z.string().optional() });
export type RequestDownload = z.infer<typeof RequestDownload>;

export const DownloadTicket = downloadTicketSchema.extend({ asset: Asset });
export type DownloadTicket = z.infer<typeof DownloadTicket>;

export const AssetReference = z
  .object({ via: assetReferenceSchema })
  .describe(
    'What the asset is being served as. The owning content decides whether the caller may see it: an activity through the course grant, a course, download or community through its thumbnail, a post through its cover, a message through its attachments, a profile through the org user whose photo it is.',
  );
export type AssetReference = z.infer<typeof AssetReference>;
