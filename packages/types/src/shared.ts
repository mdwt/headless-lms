// Cross-context shapes shared by every bounded context.

/**
 * Base shape of every domain event on the platform. `id` and `occurredAt` are
 * stamped by the transactional OutboxAppender at append time — producers
 * construct events WITHOUT them (see NewDomainEvent); consumers key
 * idempotency on `id`.
 */
export interface DomainEvent {
  readonly type: string;
  /** Stable event identity (genId("event")) — the consumer idempotency key. */
  readonly id: string;
  /** ISO-8601 timestamp, stamped when the event is appended to the outbox. */
  readonly occurredAt: string;
}

/** A domain event as a producer constructs it — before the appender stamps it. */
export type NewDomainEvent<E extends DomainEvent = DomainEvent> = Omit<E, "id" | "occurredAt">;

/** One page of a paginated listing. */
export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}
