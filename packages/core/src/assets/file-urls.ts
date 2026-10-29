export type ThumbnailOwner = 'course' | 'download' | 'community';

/** Stable, access-checked URLs on the API for every file a response refers to.
 *  Each one is answered by a route that checks access, then redirects to a
 *  signed storage URL; none of them expires. */
export interface FileUrls {
  thumbnail(owner: ThumbnailOwner, ownerId: string): string;
  activityAsset(activityId: string, assetId: string): string;
  downloadFile(downloadId: string, assetId: string): string;
  postCover(postId: string): string;
  messageAttachment(chatId: string, messageId: string, assetId: string): string;
  personImage(orgUserId: string): string;
  memberUpload(assetId: string): string;
  libraryFile(assetId: string): string;
  libraryDownload(assetId: string): string;
}

const THUMBNAIL_PATHS: Record<ThumbnailOwner, string> = {
  course: 'courses',
  download: 'downloads',
  community: 'communities',
};

export function createFileUrls(apiUrl: string): FileUrls {
  const base = apiUrl.replace(/\/+$/, '');
  const at = (...segments: string[]) =>
    `${base}/api/${segments.map((s) => encodeURIComponent(s)).join('/')}`;
  return {
    thumbnail: (owner, ownerId) => at('member', THUMBNAIL_PATHS[owner], ownerId, 'thumbnail'),
    activityAsset: (activityId, assetId) =>
      at('member', 'activities', activityId, 'assets', assetId),
    downloadFile: (downloadId, assetId) => at('member', 'downloads', downloadId, 'assets', assetId),
    postCover: (postId) => at('member', 'posts', postId, 'cover'),
    messageAttachment: (chatId, messageId, assetId) =>
      at('member', 'chats', chatId, 'messages', messageId, 'attachments', assetId),
    personImage: (orgUserId) => at('member', 'people', orgUserId, 'image'),
    memberUpload: (assetId) => at('member', 'uploads', assetId, 'file'),
    libraryFile: (assetId) => at('assets', assetId, 'file'),
    libraryDownload: (assetId) => at('assets', assetId, 'download'),
  };
}
