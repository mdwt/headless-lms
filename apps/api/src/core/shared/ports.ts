// Cross-cutting ports shared by all contexts. Framework-free, runtime-free.

export interface Clock {
  now(): Date;
}

export interface DomainEvent {
  readonly type: string;
}

export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
  subscribe(type: string, handler: (event: DomainEvent) => Promise<void>): void;
}

export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

// --- Object storage (uploads + content) ------------------------------------
// Outbound port for an S3-compatible object store. Operates on opaque keys;
// callers (e.g. the uploads context) build org-scoped keys and authorize
// access. Implemented by the MinIO adapter.

/** A presigned URL the browser uses to PUT a file straight to the store. */
export interface PresignedUpload {
  url: string;
  method: "PUT";
  key: string;
  expiresInSeconds: number;
  /** Headers the client must send on the PUT (e.g. Content-Type). */
  headers: Record<string, string>;
}

export interface StoredObjectInfo {
  key: string;
  size: number;
  contentType?: string;
  lastModified?: string;
}

export interface PresignDownloadInput {
  key: string;
  expiresInSeconds?: number;
  /** Force a download with this filename (Content-Disposition: attachment). */
  downloadFilename?: string;
}

export interface ObjectStorage {
  /** Presigned URL for a direct browser upload (temporary, expiring). */
  presignUpload(input: {
    key: string;
    contentType?: string;
    expiresInSeconds?: number;
  }): Promise<PresignedUpload>;
  /** Presigned URL to fetch/serve a private object (temporary, expiring). */
  presignDownload(input: PresignDownloadInput): Promise<string>;
  /** Object metadata, or null if it does not exist. */
  stat(key: string): Promise<StoredObjectInfo | null>;
  /** Permanently remove an object. */
  remove(key: string): Promise<void>;
}
