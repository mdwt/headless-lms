// AWS S3 implementation of the ObjectStorage port. Private bucket except the
// public/ prefix; private files are reached by signed URLs, from CloudFront when
// it is configured and from S3 otherwise. The bucket must already exist.
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl as signCloudFrontUrl } from "@aws-sdk/cloudfront-signer";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  PUBLIC_CACHE_CONTROL,
  type Logger,
  type ObjectStorage,
  type PresignDownloadInput,
  type PresignedUpload,
  type StoredObjectInfo,
} from "@headless-lms/core/types";

export interface CloudFrontSigningConfig {
  /** Origin of the distribution in front of the bucket, e.g. https://media.example.com. */
  url: string;
  /** Id of a public key in the distribution's trusted key group. */
  keyPairId: string;
  /** PEM private key of that public key. */
  privateKey: string;
}

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
  /** Origin public files are served from. Defaults to the CloudFront url. */
  publicBaseUrl?: string;
  /** Sign private file links for CloudFront instead of presigning them on S3. */
  cloudFront?: CloudFrontSigningConfig;
  uploadExpirySeconds: number;
}

export class S3StorageAdapter implements ObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBase: string | null;
  private readonly cloudFront: CloudFrontSigningConfig | null;
  readonly uploadExpirySeconds: number;

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
    this.cloudFront = config.cloudFront
      ? { ...config.cloudFront, url: config.cloudFront.url.replace(/\/+$/, "") }
      : null;
    const publicBase = config.publicBaseUrl ?? config.cloudFront?.url;
    this.publicBase = publicBase ? publicBase.replace(/\/+$/, "") : null;
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
    const disposition = input.downloadFilename
      ? `attachment; filename="${input.downloadFilename.replace(/"/g, "")}"`
      : null;
    if (this.cloudFront) {
      const query = [
        `response-cache-control=${encodeURIComponent(PUBLIC_CACHE_CONTROL)}`,
        ...(disposition ? [`response-content-disposition=${encodeURIComponent(disposition)}`] : []),
      ].join("&");
      return signCloudFrontUrl({
        url: `${this.cloudFront.url}/${encodeKey(input.key)}?${query}`,
        keyPairId: this.cloudFront.keyPairId,
        privateKey: this.cloudFront.privateKey,
        dateLessThan: input.expiresAt,
      });
    }
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ResponseCacheControl: PUBLIC_CACHE_CONTROL,
      ...(disposition ? { ResponseContentDisposition: disposition } : {}),
    });
    return getSignedUrl(this.client, command, {
      signingDate: input.signedAt,
      expiresIn: Math.round((input.expiresAt.getTime() - input.signedAt.getTime()) / 1000),
    });
  }

  async stat(key: string): Promise<StoredObjectInfo | null> {
    try {
      const s = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
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

  async publish(input: { from: string; to: string }): Promise<void> {
    const source = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: input.from }),
    );
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: input.to,
        CopySource: encodeURI(`${this.bucket}/${input.from}`),
        MetadataDirective: "REPLACE",
        CacheControl: PUBLIC_CACHE_CONTROL,
        ...(source.ContentType ? { ContentType: source.ContentType } : {}),
      }),
    );
  }

  publicUrl(key: string): string {
    if (!this.publicBase) {
      throw new Error("S3 storage has no publicBaseUrl, so it cannot serve public files");
    }
    return `${this.publicBase}/${encodeKey(key)}`;
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

function encodeKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === "NotFound" || e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404;
}
