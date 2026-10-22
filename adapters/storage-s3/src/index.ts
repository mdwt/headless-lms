// AWS S3 implementation of the ObjectStorage port. Private bucket; access via
// short-lived presigned URLs only. The bucket must already exist.
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  Logger,
  ObjectStorage,
  PresignDownloadInput,
  PresignedUpload,
  StoredObjectInfo,
} from "@headless-lms/core/types";

export interface S3StorageConfig {
  region: string;
  bucket: string;
  /** Omit both keys to use the default AWS credential chain (IAM role, env, profile). */
  accessKeyId?: string;
  secretAccessKey?: string;
  /** Custom endpoint for S3-compatible stores. */
  endpoint?: string;
  /** Required by most S3-compatible stores when `endpoint` is set. */
  forcePathStyle?: boolean;
  uploadExpirySeconds: number;
  downloadExpirySeconds: number;
}

export class S3StorageAdapter implements ObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;
  readonly uploadExpirySeconds: number;
  private readonly downloadExpiry: number;

  constructor(
    config: S3StorageConfig,
    private readonly logger?: Logger,
  ) {
    this.client = new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      ...(config.forcePathStyle !== undefined ? { forcePathStyle: config.forcePathStyle } : {}),
      ...(config.accessKeyId && config.secretAccessKey
        ? {
            credentials: {
              accessKeyId: config.accessKeyId,
              secretAccessKey: config.secretAccessKey,
            },
          }
        : {}),
    });
    this.bucket = config.bucket;
    this.uploadExpirySeconds = config.uploadExpirySeconds;
    this.downloadExpiry = config.downloadExpirySeconds;
  }

  async presignUpload(input: {
    key: string;
    contentType?: string;
    expiresInSeconds?: number;
  }): Promise<PresignedUpload> {
    const expiresInSeconds = input.expiresInSeconds ?? this.uploadExpirySeconds;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ...(input.contentType ? { ContentType: input.contentType } : {}),
    });
    const url = await getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
    return {
      url,
      method: "PUT",
      key: input.key,
      expiresInSeconds,
      headers: input.contentType ? { "Content-Type": input.contentType } : {},
    };
  }

  async presignDownload(input: PresignDownloadInput): Promise<string> {
    const expiresInSeconds = input.expiresInSeconds ?? this.downloadExpiry;
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ...(input.downloadFilename
        ? {
            ResponseContentDisposition: `attachment; filename="${input.downloadFilename.replace(/"/g, "")}"`,
          }
        : {}),
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async stat(key: string): Promise<StoredObjectInfo | null> {
    try {
      const s = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        key,
        size: s.ContentLength ?? 0,
        ...(s.ContentType ? { contentType: s.ContentType } : {}),
        ...(s.LastModified ? { lastModified: s.LastModified.toISOString() } : {}),
      };
    } catch (err) {
      if (isNotFound(err)) {
        return null;
      }
      throw err;
    }
  }

  async list(prefix: string): Promise<StoredObjectInfo[]> {
    const objects: StoredObjectInfo[] = [];
    let token: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ...(token ? { ContinuationToken: token } : {}),
        }),
      );
      for (const item of page.Contents ?? []) {
        if (!item.Key) {
          continue;
        }
        objects.push({
          key: item.Key,
          size: item.Size ?? 0,
          ...(item.LastModified ? { lastModified: item.LastModified.toISOString() } : {}),
        });
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return objects;
  }

  async copy(input: { from: string; to: string }): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: input.to,
        CopySource: encodeURI(`${this.bucket}/${input.from}`),
      }),
    );
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === "NotFound" || e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404;
}
