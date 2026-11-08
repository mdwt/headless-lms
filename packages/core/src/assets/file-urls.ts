import { PUBLIC_PREFIX } from '../types/index.js';

export type ThumbnailOwner = 'course' | 'download' | 'community' | 'event';

/** URLs for every file a response refers to. A public image (a profile photo, or the
 *  thumbnail or cover of a published item) is a public storage URL; every other file is a
 *  stable, access-checked URL on the API that redirects to a signed storage URL. */
export interface FileUrls {
  publicImage(orgId: string, ownerId: string, assetId: string): string;
  thumbnail(owner: ThumbnailOwner, ownerId: string): string;
  activityAsset(activityId: string, assetId: string): string;
  downloadFile(downloadId: string, assetId: string): string;
  eventFile(eventId: string, assetId: string): string;
  postCover(postId: string): string;
  postAsset(postId: string, assetId: string): string;
  messageAttachment(chatId: string, messageId: string, assetId: string): string;
  memberUpload(assetId: string): string;
  libraryFile(assetId: string): string;
  libraryDownload(assetId: string): string;
}

const THUMBNAIL_PATHS: Record<ThumbnailOwner, string> = {
  course: 'courses',
  download: 'downloads',
  community: 'communities',
  event: 'events',
};

export function publicImagePrefix(orgId: string, ownerId: string): string {
  return `${PUBLIC_PREFIX}${orgId}/${ownerId}/`;
}

export function publicImageKey(orgId: string, ownerId: string, assetId: string): string {
  return `${publicImagePrefix(orgId, ownerId)}${assetId}`;
}

export function createFileUrls(apiUrl: string, publicUrl: (key: string) => string): FileUrls {
  const base = apiUrl.replace(/\/+$/, '');
  const at = (...segments: string[]) =>
    `${base}/api/${segments.map((s) => encodeURIComponent(s)).join('/')}`;
  return {
    publicImage: (orgId, ownerId, assetId) => publicUrl(publicImageKey(orgId, ownerId, assetId)),
    thumbnail: (owner, ownerId) => at('member', THUMBNAIL_PATHS[owner], ownerId, 'thumbnail'),
    activityAsset: (activityId, assetId) =>
      at('member', 'activities', activityId, 'assets', assetId),
    downloadFile: (downloadId, assetId) => at('member', 'downloads', downloadId, 'assets', assetId),
    eventFile: (eventId, assetId) => at('member', 'events', eventId, 'assets', assetId),
    postCover: (postId) => at('member', 'posts', postId, 'cover'),
    postAsset: (postId, assetId) => at('member', 'posts', postId, 'assets', assetId),
    messageAttachment: (chatId, messageId, assetId) =>
      at('member', 'chats', chatId, 'messages', messageId, 'attachments', assetId),
    memberUpload: (assetId) => at('member', 'uploads', assetId, 'file'),
    libraryFile: (assetId) => at('assets', assetId, 'file'),
    libraryDownload: (assetId) => at('assets', assetId, 'download'),
  };
}
