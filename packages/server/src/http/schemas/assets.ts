import { z } from 'zod';
import {
  assetKindSchema,
  assetSourceSchema,
  assetStatusSchema,
  assetViewSchema,
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

export const Asset = assetViewSchema
  .omit({ key: true })
  .extend({
    kind: AssetKind,
    source: AssetSource,
    url: z
      .string()
      .nullable()
      .describe(
        'A short-lived signed URL that shows a ready library file. `null` while pending and for a member upload, which is served with what it is attached to.',
      ),
    downloadUrl: z
      .string()
      .nullable()
      .describe('The same file as a download saved under its filename. `null` when `url` is.'),
  })
  .strip();
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

const Filename = z.string().trim().min(1).max(255);

export const RequestUpload = z.object({
  filename: Filename,
  contentType: z.string().min(1).max(255).describe('The media class is derived from this.'),
});
export type RequestUpload = z.infer<typeof RequestUpload>;

export const RequestMemberUpload = z.object({
  filename: Filename,
  contentType: z
    .string()
    .regex(/^image\/[a-z0-9.+-]+$/i, 'A member upload must be an image')
    .describe('Must be an `image/*` type. The size is checked when the upload is finalized.'),
});
export type RequestMemberUpload = z.infer<typeof RequestMemberUpload>;

export const UploadTicket = uploadTicketSchema.extend({ asset: Asset });
export type UploadTicket = z.infer<typeof UploadTicket>;
