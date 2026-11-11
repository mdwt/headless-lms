---
"@headless-lms/core": minor
"@headless-lms/server": minor
"@headless-lms/sdk": minor
"@headless-lms/adapter-storage-s3": minor
"@headless-lms/adapter-storage-minio": minor
"create-headless-lms": patch
---

Files are served straight from storage. The read that returns a lesson, download, event, post, message, upload or library file now carries a signed storage link for each of its files, made after that read has checked access, instead of an API URL that redirected to one. A file costs no API request, and its link works from any host.

Links are signed for a window: every read in the same window returns the same link, so browsers and caches keep the file, and the link expires at the end of the next window. `ServerConfig.deliveryExpirySeconds` is now `deliveryWindowSeconds` (`DELIVERY_URL_EXPIRY`, default six hours). Every signed file is served with `Cache-Control: public, max-age=31536000, immutable`.

The redirect routes are gone: `getCourseThumbnail`, `getDownloadThumbnail`, `getCommunityThumbnail`, `getEventThumbnail`, `getSpaceImage`, `getActivityFile`, `getDownloadFile`, `getEventFile`, `getPostCover`, `getPostAsset`, `getMessageAttachment`, `getMemberUploadFile`, `getLibraryFile` and `downloadLibraryFile`. In core, `AssetFiles.signFile` is replaced by `fileLinks`, `FileUrls` builds public image URLs only and `createFileUrls` takes just the public URL builder, `AssetsServiceImpl` takes `linkWindowSeconds` instead of `downloadLinkExpirySeconds` and `fileUrls`, and the member report, post and chat services no longer have methods that sign a single file. A member of an unpublished community sees its images only with `communities:read`, as before.

`ObjectStorage.presignDownload` takes `signedAt` and `expiresAt` instead of `expiresInSeconds`, and the S3 and MinIO adapters no longer take `downloadExpirySeconds`. The S3 adapter takes an optional `cloudFront` (`url`, `keyPairId`, `privateKey`) to sign links for a CloudFront distribution in front of the bucket; `publicBaseUrl` defaults to its url.
