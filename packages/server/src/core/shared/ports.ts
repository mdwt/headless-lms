// Deployment-swappable ports live in @headless-lms/types; re-exported so core
// keeps one import site for every port.
import type {
  DomainEvent,
  NewDomainEvent,
  Logger,
  EmailContent,
  EmailMessage,
  EmailSender,
  EmailTemplateId,
  EmailTemplateParams,
  ObjectStorage,
  PresignedUpload,
  StoredObjectInfo,
  PresignDownloadInput,
  TemplateContext,
  TemplateRenderer,
} from '@headless-lms/types';

export type {
  DomainEvent,
  NewDomainEvent,
  Logger,
  EmailContent,
  EmailMessage,
  EmailSender,
  EmailTemplateId,
  EmailTemplateParams,
  ObjectStorage,
  PresignedUpload,
  StoredObjectInfo,
  PresignDownloadInput,
  TemplateContext,
  TemplateRenderer,
};

export interface Clock {
  now(): Date;
}

export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
  subscribe(type: string, handler: (event: DomainEvent) => Promise<void>): void;
  /** Runs for every published event, regardless of type — after the
   *  type-specific handlers for that event. */
  subscribeAll(handler: (event: DomainEvent) => Promise<void>): void;
}

// --- Transactional outbox ----------------------------------------------------
// Producer side: services append events inside a UnitOfWork — the append and
// the domain write commit in ONE transaction. Relay side: the poller drains
// committed rows, publishes them to the EventBus (the only publish caller),
// and stamps them processed. Core never calls the relay-side ports; they live
// here like EmailSender, used by adapters.

/** Appends domain events to the transactional outbox. A tx-bound member of a
 *  UnitOfWork scope, so the append shares that transaction — the event
 *  becomes visible to the relay only when the surrounding write commits. */
export interface OutboxAppender {
  append<E extends NewDomainEvent>(events: E[]): Promise<void>;
}

/** Runs a callback atomically: every port in the scope executes in one
 *  database transaction; a thrown error rolls all of it back. */
export interface UnitOfWork<Scope> {
  run<T>(fn: (scope: Scope) => Promise<T>): Promise<T>;
}

export interface OutboxMessage {
  id: string;
  /** Prior failed dispatch count — input to the relay's backoff. */
  attempts: number;
  payload: DomainEvent;
}

export interface OutboxStore {
  /** Due, unexhausted, unprocessed messages in id order; claims them for this reader. */
  fetchBatch(limit: number): Promise<OutboxMessage[]>;
  /** Published to the EventBus — stamps processedAt. */
  markProcessed(id: string): Promise<void>;
  /** Dispatch failed — increments attempts, records the error, schedules the retry. */
  markFailed(id: string, error: string, nextAttemptAt: Date): Promise<void>;
}

/** The relay mechanism — how committed outbox rows become dispatched events.
 *  Swappable: same-process poller today; LISTEN/NOTIFY or an external worker
 *  later, without touching producers or subscribers. */
export interface OutboxRelay {
  start(): void;
  /** Graceful: resolves after the in-flight batch finishes. Safe if never started. */
  stop(): Promise<void>;
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
