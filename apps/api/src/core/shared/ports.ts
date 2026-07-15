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

// --- Secure credential store -------------------------------------------------
// Org-scoped storage for secrets (integration credentials, API keys, tokens).
// Values are JSON documents, encrypted at rest and decrypted only when a
// caller `reveal`s them at point of use — the store (de)serializes internally,
// so callers pass and receive plain objects. Domains hold the returned ref,
// never the secrets. Implemented by the Drizzle credential store adapter
// (AES-256-GCM).

export interface CredentialStore {
  /** Encrypt and persist an org's secrets. Returns the ref the domain stores. */
  store(orgId: string, secrets: Record<string, unknown>): Promise<string>;
  /** Decrypt secrets at point of use, or null if the ref doesn't exist in the org. */
  reveal(orgId: string, ref: string): Promise<Record<string, unknown> | null>;
  /** Replace stored secrets in place (e.g. reconnect / token refresh). */
  update(orgId: string, ref: string, secrets: Record<string, unknown>): Promise<void>;
  /** Permanently delete stored secrets (e.g. disconnect). */
  destroy(orgId: string, ref: string): Promise<void>;
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
