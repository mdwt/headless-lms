---
"@headless-lms/core": minor
"@headless-lms/server": minor
"@headless-lms/adapter-storage-s3": minor
"@headless-lms/adapter-storage-minio": minor
"create-headless-lms": patch
---

A file link is signed when the read is made and expires `deliveryExpirySeconds` after, with no signing window. `ServerConfig.deliveryWindowSeconds` is `deliveryExpirySeconds` again, `AssetsServiceImpl` takes `downloadLinkExpirySeconds` instead of `linkWindowSeconds`, and `ObjectStorage.presignDownload` takes `expiresInSeconds` instead of `signedAt` and `expiresAt`.
