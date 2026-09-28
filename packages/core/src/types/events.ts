import type { ContractNewDomainEvent, DomainEvent, EventMetadata } from './shared.js';

export interface MakeEventInput<TData> {
  readonly orgId: string;
  readonly data: TData;
  readonly metadata?: EventMetadata | undefined;
}

export type EventParseResult<E extends DomainEvent> =
  { readonly success: true; readonly data: E } | { readonly success: false; readonly error: Error };

export interface EventDefinition<E extends DomainEvent, TMakeData = E['data']> {
  readonly type: E['type'];
  readonly version: E['version'];
  make(input: MakeEventInput<TMakeData>): ContractNewDomainEvent<E>;
  is(event: unknown): event is E;
  parse(event: unknown): E;
  safeParse(event: unknown): EventParseResult<E>;
}
