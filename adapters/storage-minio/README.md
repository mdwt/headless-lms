# @headless-lms/adapter-storage-minio

MinIO (S3-compatible) implementation of the `ObjectStorage` port from
`@headless-lms/types`. Works against MinIO or any S3-compatible store; buckets
are private, access is via short-lived presigned URLs only.

The adapter reads no environment itself — the installation's `config.ts` parses
env into a `MinioStorageConfig` and injects the constructed adapter:

```ts
import { MinioStorageAdapter } from "@headless-lms/adapter-storage-minio";

const container = await createContainer(config, {
  adapters: { storage: new MinioStorageAdapter(storageConfig) },
});
```

## Environment variables (reference installation)

| Variable                  | Required | Maps to                 | Notes                          |
| ------------------------- | -------- | ----------------------- | ------------------------------ |
| `STORAGE_ENDPOINT`        | yes      | `endPoint`              | Host only, no scheme.          |
| `STORAGE_PORT`            | yes      | `port`                  |                                |
| `STORAGE_USE_SSL`         | yes      | `useSSL`                | `"true"` / `"false"`.          |
| `STORAGE_ACCESS_KEY`      | yes      | `accessKey`             |                                |
| `STORAGE_SECRET_KEY`      | yes      | `secretKey`             |                                |
| `STORAGE_REGION`          | yes      | `region`                |                                |
| `STORAGE_BUCKET`          | yes      | `bucket`                | Created private if missing.    |
| `STORAGE_UPLOAD_EXPIRY`   | no       | `uploadExpirySeconds`   | Default 300.                   |
| `STORAGE_DOWNLOAD_EXPIRY` | no       | `downloadExpirySeconds` | Default 300.                   |
