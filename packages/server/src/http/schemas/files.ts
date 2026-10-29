// File proxy schemas. Every file is fetched from a stable URL that checks access
// on each request and answers 302 with a signed storage URL.
import { z } from 'zod';

export const CourseThumbnailParams = z.object({ courseId: z.string() });
export type CourseThumbnailParams = z.infer<typeof CourseThumbnailParams>;

export const DownloadThumbnailParams = z.object({ downloadId: z.string() });
export type DownloadThumbnailParams = z.infer<typeof DownloadThumbnailParams>;

export const CommunityThumbnailParams = z.object({ communityId: z.string() });
export type CommunityThumbnailParams = z.infer<typeof CommunityThumbnailParams>;

export const ActivityFileParams = z.object({ activityId: z.string(), assetId: z.string() });
export type ActivityFileParams = z.infer<typeof ActivityFileParams>;

export const DownloadFileParams = z.object({ downloadId: z.string(), assetId: z.string() });
export type DownloadFileParams = z.infer<typeof DownloadFileParams>;

export const PostCoverParams = z.object({ postId: z.string() });
export type PostCoverParams = z.infer<typeof PostCoverParams>;

export const MessageAttachmentParams = z.object({
  chatId: z.string(),
  messageId: z.string(),
  assetId: z.string(),
});
export type MessageAttachmentParams = z.infer<typeof MessageAttachmentParams>;

export const PersonImageParams = z.object({ orgUserId: z.string() });
export type PersonImageParams = z.infer<typeof PersonImageParams>;

export const UploadFileParams = z.object({ id: z.string() });
export type UploadFileParams = z.infer<typeof UploadFileParams>;
