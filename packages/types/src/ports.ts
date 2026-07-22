// Deployment-swappable ports, implemented by @headless-lms/adapter-* packages.

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  /** A logger whose every entry carries `bindings` (call-site meta wins on key clash). */
  child(bindings: Record<string, unknown>): Logger;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Optional rendered HTML body; transports fall back to text when absent. */
  html?: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

// --- Object storage (S3-compatible, opaque keys) ----------------------------

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
