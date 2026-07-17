// Cross-context shapes shared by every bounded context.

/** Base shape of every event published on the platform's event bus. */
export interface DomainEvent {
  readonly type: string;
}

/** One page of a paginated listing. */
export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}
