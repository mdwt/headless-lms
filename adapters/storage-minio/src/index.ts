// MinIO (S3-compatible) implementation of the ObjectStorage port. Private
// buckets; access via short-lived presigned URLs only.
import { Client, CopyDestinationOptions, CopySourceOptions } from "minio";
import type {
  Logger,
  ObjectStorage,
  PresignDownloadInput,
  PresignedUpload,
  StoredObjectInfo,
} from "@headless-lms/core/types";

export interface MinioStorageConfig {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  region: string;
  bucket: string;
  uploadExpirySeconds: number;
  downloadExpirySeconds: number;
}

export class MinioStorageAdapter implements ObjectStorage {
  private readonly client: Client;
  private readonly bucket: string;
  private readonly region: string;
  readonly uploadExpirySeconds: number;
  private readonly downloadExpiry: number;
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
    this.uploadExpirySeconds = config.uploadExpirySeconds;
    this.downloadExpiry = config.downloadExpirySeconds;
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
    const expiresInSeconds = input.expiresInSeconds ?? this.downloadExpiry;
    const respHeaders: Record<string, string> = {};
    if (input.downloadFilename) {
      respHeaders["response-content-disposition"] =
        `attachment; filename="${input.downloadFilename.replace(/"/g, "")}"`;
    }
    return this.client.presignedGetObject(this.bucket, input.key, expiresInSeconds, respHeaders);
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

  async remove(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key);
  }
}
