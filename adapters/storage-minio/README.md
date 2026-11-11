# @headless-lms/adapter-storage-minio

MinIO (S3-compatible) implementation of the `ObjectStorage` port from
`@headless-lms/core/types`. Works against MinIO or any S3-compatible store. The bucket
is private except the `public/` prefix: on startup the adapter sets a bucket policy that
lets anyone read `public/*`, where the API publishes profile photos and the thumbnails
and covers of published items with `Cache-Control: public, max-age=31536000, immutable`.
Private files are reached through short-lived presigned URLs.

The adapter reads no environment itself — the installation's `config.ts` parses
env into a `MinioStorageConfig` and injects the constructed adapter:

```ts
import { MinioStorageAdapter } from "@headless-lms/adapter-storage-minio";

const container = await createContainer(config, {
  adapters: { storage: new MinioStorageAdapter(storageConfig) },
});
```

## Environment variables (reference installation)

| Variable                | Required | Maps to               | Notes                                                                                     |
| ----------------------- | -------- | --------------------- | ----------------------------------------------------------------------------------------- |
| `STORAGE_ENDPOINT`      | yes      | `endPoint`            | Host only, no scheme.                                                                     |
| `STORAGE_PORT`          | yes      | `port`                |                                                                                           |
| `STORAGE_USE_SSL`       | yes      | `useSSL`              | `"true"` / `"false"`.                                                                     |
| `STORAGE_ACCESS_KEY`    | yes      | `accessKey`           |                                                                                           |
| `STORAGE_SECRET_KEY`    | yes      | `secretKey`           |                                                                                           |
| `STORAGE_REGION`        | yes      | `region`              |                                                                                           |
| `STORAGE_BUCKET`        | yes      | `bucket`              | Created private if missing.                                                               |
| `STORAGE_UPLOAD_EXPIRY` | no       | `uploadExpirySeconds` | Default 300. Stray member uploads older than this are swept.                              |
| `STORAGE_PUBLIC_URL`    | no       | `publicUrl`           | Origin serving `public/*`, such as a CDN. Default `http(s)://<endpoint>:<port>/<bucket>`. |
