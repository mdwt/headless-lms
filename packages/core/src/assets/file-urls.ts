import { PUBLIC_PREFIX } from '../types/index.js';

/** Public storage URLs for public images: a profile photo, or the thumbnail or cover of a
 *  published item. Every other file a response refers to carries a signed link from
 *  `AssetFiles.fileLinks`. */
export interface FileUrls {
  publicImage(orgId: string, ownerId: string, assetId: string): string;
}

export function publicImagePrefix(orgId: string, ownerId: string): string {
  return `${PUBLIC_PREFIX}${orgId}/${ownerId}/`;
}

export function publicImageKey(orgId: string, ownerId: string, assetId: string): string {
  return `${publicImagePrefix(orgId, ownerId)}${assetId}`;
}

export function createFileUrls(publicUrl: (key: string) => string): FileUrls {
  return {
    publicImage: (orgId, ownerId, assetId) => publicUrl(publicImageKey(orgId, ownerId, assetId)),
  };
}
