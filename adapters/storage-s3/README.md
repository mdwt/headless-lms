# @headless-lms/adapter-storage-s3

AWS S3 implementation of the `ObjectStorage` port from `@headless-lms/core/types`.
The bucket is private and must already exist; access is via short-lived presigned
URLs only. Also works against S3-compatible stores via `endpoint` + `forcePathStyle`.

The adapter reads no environment itself — the installation's `config.ts` parses
env into an `S3StorageConfig` and injects the constructed adapter:

```ts
import { S3StorageAdapter } from "@headless-lms/adapter-storage-s3";

const container = await createContainer(config, {
  adapters: { storage: new S3StorageAdapter(storageConfig) },
});
```

Omit `accessKeyId`/`secretAccessKey` to use the default AWS credential chain
(IAM role, env vars, shared profile).

## Bucket setup

The adapter never creates buckets — bucket creation needs `s3:CreateBucket`
permissions and region constraints the app credentials should not have. Create
the bucket once (console, CLI, or IaC); everything the app does is object-level.

1. Create a bucket and keep Block Public Access on (the default). No bucket
   policy is needed — access is via presigned URLs only.
2. Grant the app credentials `s3:PutObject`, `s3:GetObject`, `s3:HeadObject`,
   and `s3:DeleteObject` on `arn:aws:s3:::your-bucket/*`. Either an IAM user
   with access keys, or an IAM role when running on AWS (then omit the keys).
3. Add a CORS rule — browsers upload directly to the presigned URL:

   ```json
   [
     {
       "AllowedOrigins": ["https://your-app.com"],
       "AllowedMethods": ["PUT", "GET"],
       "AllowedHeaders": ["Content-Type"],
       "MaxAgeSeconds": 3000
     }
   ]
   ```

4. Set `STORAGE_REGION`, `STORAGE_BUCKET`, and optionally the keys. Leave
   `STORAGE_ENDPOINT` and `STORAGE_FORCE_PATH_STYLE` unset for real AWS.

## Path style

S3 has two URL formats: virtual-hosted style (`https://bucket.s3.amazonaws.com/key`,
the AWS default) and path style (`https://s3.amazonaws.com/bucket/key`).
S3-compatible stores typically run on one hostname with no per-bucket DNS, so
the bucket name cannot be a subdomain — they need path style. Set
`STORAGE_FORCE_PATH_STYLE=true` only in that case.

## Environment variables (reference installation)

| Variable                   | Required | Maps to                 | Notes                                 |
| -------------------------- | -------- | ----------------------- | ------------------------------------- |
| `STORAGE_REGION`           | yes      | `region`                |                                       |
| `STORAGE_BUCKET`           | yes      | `bucket`                | Must exist; kept private.             |
| `STORAGE_ACCESS_KEY`       | no       | `accessKeyId`           | Omit for the default credential chain.|
| `STORAGE_SECRET_KEY`       | no       | `secretAccessKey`       | Omit for the default credential chain.|
| `STORAGE_ENDPOINT`         | no       | `endpoint`              | Full URL, for S3-compatible stores.   |
| `STORAGE_FORCE_PATH_STYLE` | no       | `forcePathStyle`        | `"true"` / `"false"`.                 |
| `STORAGE_UPLOAD_EXPIRY`    | no       | `uploadExpirySeconds`   | Default 300.                          |
| `STORAGE_DOWNLOAD_EXPIRY`  | no       | `downloadExpirySeconds` | Default 86400.                        |
