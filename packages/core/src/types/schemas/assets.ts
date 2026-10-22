import { z } from 'zod';
import { idSchema } from './shared.js';

export const assetKindSchema = z.enum(['image', 'video', 'audio', 'document']);
export type AssetKind = z.infer<typeof assetKindSchema>;

export const assetSourceSchema = z.enum(['library', 'member']);
export type AssetSource = z.infer<typeof assetSourceSchema>;

export const assetStatusSchema = z.enum(['pending', 'ready']);
export type AssetStatus = z.infer<typeof assetStatusSchema>;

export const assetSchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    key: z.string().trim().min(1),
    kind: assetKindSchema,
    source: assetSourceSchema,
    filename: z.string().trim().min(1),
    contentType: z.string().trim().min(1),
    size: z.number().int().min(0),
    status: assetStatusSchema,
    uploadedBy: idSchema,
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type Asset = z.output<typeof assetSchema>;
export type AssetInput = z.input<typeof assetSchema>;

export const requestUploadInputSchema = z
  .object({
    uploadedBy: idSchema,
    filename: z.string().trim().min(1),
    contentType: z.string().trim().min(1),
    source: assetSourceSchema,
  })
  .strict();
export type RequestUploadInput = z.infer<typeof requestUploadInputSchema>;

export const uploadTicketSchema = z
  .object({
    asset: assetSchema,
    uploadUrl: z.string().trim().min(1),
    method: z.literal('PUT'),
    expiresInSeconds: z.number().int().positive(),
    headers: z.record(z.string(), z.string()),
  })
  .strict();
export type UploadTicket = z.infer<typeof uploadTicketSchema>;

export const downloadTicketSchema = z
  .object({
    url: z.string().trim().min(1),
    asset: assetSchema,
  })
  .strict();
export type DownloadTicket = z.infer<typeof downloadTicketSchema>;

export const assetsQuerySchema = z
  .object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    search: z.string().optional(),
    sort: z.string().optional(),
    kind: assetKindSchema.optional(),
    source: assetSourceSchema.optional(),
  })
  .strict();
export type AssetsQuery = z.infer<typeof assetsQuerySchema>;

export const assetReferenceSchema = z.union([
  z.object({ activity: idSchema }).strict(),
  z.object({ course: idSchema }).strict(),
  z.object({ download: idSchema }).strict(),
  z.object({ community: idSchema }).strict(),
  z.object({ post: idSchema }).strict(),
  z.object({ message: idSchema }).strict(),
  z.object({ profile: idSchema }).strict(),
]);
export type AssetReference = z.infer<typeof assetReferenceSchema>;
