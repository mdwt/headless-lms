// MinIO (S3-compatible) implementation of the ObjectStorage port. Private
// buckets, except the public/ prefix, which anyone may read.
import { Client, CopyDestinationOptions, CopySourceOptions } from "minio";
import {
  PUBLIC_CACHE_CONTROL,
  PUBLIC_PREFIX,
  type Logger,
  type ObjectStorage,
  type PresignDownloadInput,
  type PresignedUpload,
  type StoredObjectInfo,
} from "@headless-lms/core/types";

export interface MinioStorageConfig {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  region: string;
  bucket: string;
  publicUrl?: string;
  uploadExpirySeconds: number;
}

export class MinioStorageAdapter implements ObjectStorage {
  private readonly client: Client;
  private readonly bucket: string;
  private readonly region: string;
  private readonly publicBase: string;
  readonly uploadExpirySeconds: number;
  private ensured = false;

  constructor(
    config: MinioStorageConfig,
    private readonly logger?: Logger,
  ) {
    this.client = new Client({
      endPoint: config.endPoint,
      port: config.port,
      useSSL: config.useSSL,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
      region: config.region,
    });
    this.bucket = config.bucket;
    this.region = config.region;
    this.publicBase = (
      config.publicUrl ??
      `${config.useSSL ? "https" : "http"}://${config.endPoint}:${config.port}/${config.bucket}`
    ).replace(/\/+$/, "");
    this.uploadExpirySeconds = config.uploadExpirySeconds;
  }

  /** Create the (private) bucket if it does not exist. Call once at startup. */
  async ensureBucket(): Promise<void> {
    if (this.ensured) {
      return;
    }
    const exists = await this.client.bucketExists(this.bucket).catch(() => false);
    if (!exists) {
      await this.client.makeBucket(this.bucket, this.region);
    }
    await this.client.setBucketPolicy(this.bucket, publicReadPolicy(this.bucket));
    this.ensured = true;
  }

  async presignUpload(input: {
    key: string;
    contentType?: string;
    expiresInSeconds?: number;
  }): Promise<PresignedUpload> {
    await this.ensureBucket();
    const expiresInSeconds = input.expiresInSeconds ?? this.uploadExpirySeconds;
    const url = await this.client.presignedPutObject(this.bucket, input.key, expiresInSeconds);
    return {
      url,
      method: "PUT",
      key: input.key,
      expiresInSeconds,
      headers: input.contentType ? { "Content-Type": input.contentType } : {},
    };
  }

  async presignDownload(input: PresignDownloadInput): Promise<string> {
    await this.ensureBucket();
    const respHeaders: Record<string, string> = {
      "response-cache-control": PUBLIC_CACHE_CONTROL,
    };
    if (input.downloadFilename) {
      respHeaders["response-content-disposition"] =
        `attachment; filename="${input.downloadFilename.replace(/"/g, "")}"`;
    }
    return this.client.presignedGetObject(
      this.bucket,
      input.key,
      input.expiresInSeconds,
      respHeaders,
    );
  }

  async stat(key: string): Promise<StoredObjectInfo | null> {
    try {
      const s = await this.client.statObject(this.bucket, key);
      const contentType = s.metaData?.["content-type"];
      return {
        key,
        size: s.size,
        ...(contentType ? { contentType } : {}),
        ...(s.lastModified ? { lastModified: s.lastModified.toISOString() } : {}),
      };
    } catch {
      return null;
    }
  }

  async list(prefix: string): Promise<StoredObjectInfo[]> {
    await this.ensureBucket();
    const objects: StoredObjectInfo[] = [];
    for await (const item of this.client.listObjectsV2(this.bucket, prefix, true)) {
      if (!item.name) {
        continue;
      }
      objects.push({
        key: item.name,
        size: item.size,
        ...(item.lastModified ? { lastModified: item.lastModified.toISOString() } : {}),
      });
    }
    return objects;
  }

  async copy(input: { from: string; to: string }): Promise<void> {
    await this.ensureBucket();
    await this.client.copyObject(
      new CopySourceOptions({ Bucket: this.bucket, Object: input.from }),
      new CopyDestinationOptions({ Bucket: this.bucket, Object: input.to }),
    );
  }

  async publish(input: { from: string; to: string }): Promise<void> {
    await this.ensureBucket();
    const source = await this.client.statObject(this.bucket, input.from);
    const contentType = source.metaData?.["content-type"];
    await this.client.copyObject(
      new CopySourceOptions({ Bucket: this.bucket, Object: input.from }),
      new CopyDestinationOptions({
        Bucket: this.bucket,
        Object: input.to,
        MetadataDirective: "REPLACE",
        Headers: {
          "Cache-Control": PUBLIC_CACHE_CONTROL,
          ...(contentType ? { "Content-Type": contentType } : {}),
        },
      }),
    );
  }

  publicUrl(key: string): string {
    return `${this.publicBase}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }

  async remove(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key);
  }
}

function publicReadPolicy(bucket: string): string {
  return JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { AWS: ["*"] },
        Action: ["s3:GetObject"],
        Resource: [`arn:aws:s3:::${bucket}/${PUBLIC_PREFIX}*`],
      },
    ],
  });
}
