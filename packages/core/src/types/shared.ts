export type JsonValue =
  null | string | number | boolean | JsonValue[] | { readonly [key: string]: JsonValue };

export type EventMetadata = Readonly<Record<string, JsonValue>>;

export interface DomainEvent<
  TData = unknown,
  TType extends string = string,
  TVersion extends number = number,
> {
  readonly type: TType;
  readonly id: string;
  readonly orgId: string;
  readonly version: TVersion;
  readonly occurredAt: string;
  readonly data: TData;
  readonly metadata?: EventMetadata | undefined;
}

export type ContractNewDomainEvent<E extends DomainEvent = DomainEvent> = Omit<
  E,
  'id' | 'occurredAt'
>;

export type NewDomainEvent<E extends DomainEvent = DomainEvent> = ContractNewDomainEvent<E>;

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}
