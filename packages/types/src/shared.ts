export interface DomainEvent {
  readonly type: string;
  /** Stable event identity (genId("event")) — the consumer idempotency key. */
  readonly id: string;
  readonly orgId: string;
  readonly createdAt: string;
}

export type NewDomainEvent<E extends DomainEvent = DomainEvent> = Omit<E, "id" | "createdAt">;

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}
