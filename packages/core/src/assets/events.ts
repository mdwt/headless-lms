import { assetSchema } from '../types/schemas/index.js';
import { defineEvent, type EventOf, type EventOfValues } from '../shared/ports.js';

const publicAsset = assetSchema
  .pick({
    orgId: true,
    id: true,
    key: true,
    kind: true,
    filename: true,
    contentType: true,
    size: true,
    status: true,
    uploadedBy: true,
    createdAt: true,
    updatedAt: true,
  })
  .strip();

export const assetEvents = {
  assetCreated: defineEvent({
    type: 'asset.created',
    version: 1,
    data: assetSchema,
    publicData: publicAsset,
  }),
  assetReady: defineEvent({
    type: 'asset.ready',
    version: 1,
    data: assetSchema,
    publicData: publicAsset,
  }),
  assetDeleted: defineEvent({
    type: 'asset.deleted',
    version: 1,
    data: assetSchema,
    publicData: publicAsset,
  }),
};

export type AssetCreated = EventOf<typeof assetEvents.assetCreated>;
export type AssetReady = EventOf<typeof assetEvents.assetReady>;
export type AssetDeleted = EventOf<typeof assetEvents.assetDeleted>;
export type AssetEvent = EventOfValues<typeof assetEvents>;
