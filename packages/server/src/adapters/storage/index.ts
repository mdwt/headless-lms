// Object storage adapter backed by MinIO (S3-compatible). Implements the
// ObjectStorage core port. Buckets are created private; access is granted only
// through short-lived presigned URLs.
import { Client } from 'minio';
import type {
  Logger,
  ObjectStorage,
  PresignDownloadInput,
  PresignedUpload,
  StoredObjectInfo,
} from '../../core/shared/ports.js';
import { noopLogger } from '../../core/shared/logger.js';

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
  private readonly uploadExpiry: number;
  private readonly downloadExpiry: number;
  private ensured = false;

  constructor(
    config: MinioStorageConfig,
    private readonly logger: Logger = noopLogger,
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
    this.uploadExpiry = config.uploadExpirySeconds;
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
    const expiresInSeconds = input.expiresInSeconds ?? this.uploadExpiry;
    const url = await this.client.presignedPutObject(this.bucket, input.key, expiresInSeconds);
    return {
      url,
      method: 'PUT',
      key: input.key,
      expiresInSeconds,
      headers: input.contentType ? { 'Content-Type': input.contentType } : {},
    };
  }

  async presignDownload(input: PresignDownloadInput): Promise<string> {
    await this.ensureBucket();
    const expiresInSeconds = input.expiresInSeconds ?? this.downloadExpiry;
    const respHeaders: Record<string, string> = {};
    if (input.downloadFilename) {
      respHeaders['response-content-disposition'] =
        `attachment; filename="${input.downloadFilename.replace(/"/g, '')}"`;
    }
    return this.client.presignedGetObject(this.bucket, input.key, expiresInSeconds, respHeaders);
  }

  async stat(key: string): Promise<StoredObjectInfo | null> {
    try {
      const s = await this.client.statObject(this.bucket, key);
      const contentType = s.metaData?.['content-type'];
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

  async remove(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key);
  }
}
