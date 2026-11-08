# @headless-lms/adapter-storage-s3

AWS S3 implementation of the `ObjectStorage` port from `@headless-lms/core/types`.
The bucket must already exist. Everything in it is private except the `public/`
prefix, which holds the images the API serves publicly (profile photos and the
thumbnails and covers of published items); private files are reached through
short-lived presigned URLs. Also works against S3-compatible stores via `endpoint` + `forcePathStyle`.

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

1. Create a bucket. Let anyone read `public/*` and nothing else, either with a
   bucket policy (turn off "Block public access to buckets and objects granted
   through new public bucket policies" for this bucket only):

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": "*",
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::your-bucket/public/*"
       }
     ]
   }
   ```

   or by keeping the bucket private and serving `public/*` through a CDN such as
   CloudFront with origin access control. Point `publicBaseUrl` at whichever
   origin serves it. Public copies are written with
   `Cache-Control: public, max-age=31536000, immutable`; a new image is a new key.

2. Grant the app credentials `s3:PutObject`, `s3:GetObject`, `s3:HeadObject`,
   and `s3:DeleteObject` on `arn:aws:s3:::your-bucket/*`, and `s3:ListBucket` on
   `arn:aws:s3:::your-bucket` (the hourly sweep lists stray member uploads).
   Either an IAM user with access keys, or an IAM role when running on AWS
   (then omit the keys).
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

| Variable                   | Required | Maps to                 | Notes                                                                                                                    |
| -------------------------- | -------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `STORAGE_REGION`           | yes      | `region`                |                                                                                                                          |
| `STORAGE_BUCKET`           | yes      | `bucket`                | Must exist; kept private.                                                                                                |
| `STORAGE_ACCESS_KEY`       | no       | `accessKeyId`           | Omit for the default credential chain.                                                                                   |
| `STORAGE_SECRET_KEY`       | no       | `secretAccessKey`       | Omit for the default credential chain.                                                                                   |
| `STORAGE_ENDPOINT`         | no       | `endpoint`              | Full URL, for S3-compatible stores.                                                                                      |
| `STORAGE_FORCE_PATH_STYLE` | no       | `forcePathStyle`        | `"true"` / `"false"`.                                                                                                    |
| `STORAGE_UPLOAD_EXPIRY`    | no       | `uploadExpirySeconds`   | Default 300. Stray member uploads older than this are swept.                                                             |
| `STORAGE_DOWNLOAD_EXPIRY`  | no       | `downloadExpirySeconds` | Download lifetime when the caller names none. Default 86400. The API names `DELIVERY_URL_EXPIRY` on every URL it serves. |
| `STORAGE_PUBLIC_URL`       | yes      | `publicBaseUrl`         | Origin serving `public/*`, such as `https://cdn.example.com` or `https://your-bucket.s3.amazonaws.com`.                  |
