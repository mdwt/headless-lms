import { z } from 'zod';
import type {
  ContractNewDomainEvent,
  DomainEvent,
  EventDefinition,
  EventMetadata,
  EventParseResult,
  JsonValue,
  MakeEventInput,
} from '../types/index.js';

export class InvalidDomainEventError extends Error {
  constructor(type: string, detail: string) {
    super(`invalid ${type} event: ${detail}`);
    this.name = 'InvalidDomainEventError';
  }
}

export const eventIdSchema: z.ZodString = z.string().trim().min(1);

export const eventJsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.array(eventJsonValueSchema),
    z.record(z.string(), eventJsonValueSchema),
  ]),
);

export const eventMetadataSchema: z.ZodType<EventMetadata> = z.record(
  z.string(),
  eventJsonValueSchema,
);

export type VersionedDomainEvent<
  TData = unknown,
  TType extends string = string,
  TVersion extends number = number,
> = DomainEvent<TData, TType, TVersion> & {
  readonly version: TVersion;
  readonly occurredAt: string;
  readonly data: TData;
};

export interface RuntimeEventDefinition<
  E extends VersionedDomainEvent,
  TMakeData = E['data'],
> extends EventDefinition<E, TMakeData> {
  readonly dataSchema: z.ZodType;
  readonly eventSchema: z.ZodType<E>;
}

export type EventOf<TDefinition extends EventDefinition<DomainEvent, unknown>> =
  TDefinition extends EventDefinition<infer E, unknown> ? E : never;

export type EventOfValues<
  TDefinitions extends Record<string, EventDefinition<DomainEvent, unknown>>,
> = EventOf<TDefinitions[keyof TDefinitions]>;

export interface DefineEventInput<
  TType extends string,
  TVersion extends number,
  TDataSchema extends z.ZodType,
> {
  readonly type: TType;
  readonly version: TVersion;
  readonly data: TDataSchema;
}

export function defineEvent<
  const TType extends string,
  const TVersion extends number,
  TDataSchema extends z.ZodType,
>(
  input: DefineEventInput<TType, TVersion, TDataSchema>,
): RuntimeEventDefinition<
  VersionedDomainEvent<z.output<TDataSchema>, TType, TVersion>,
  z.input<TDataSchema>
> {
  type Event = VersionedDomainEvent<z.output<TDataSchema>, TType, TVersion>;
  const makeInputSchema = z
    .object({
      orgId: eventIdSchema,
      data: input.data,
      metadata: eventMetadataSchema.optional(),
    })
    .strict();
  const eventSchema = z
    .object({
      type: z.literal(input.type),
      version: z.literal(input.version),
      id: eventIdSchema,
      orgId: eventIdSchema,
      occurredAt: z.string().trim().min(1),
      data: input.data,
      metadata: eventMetadataSchema.optional(),
    })
    .strict();

  return {
    type: input.type,
    version: input.version,
    dataSchema: input.data,
    eventSchema: eventSchema as unknown as z.ZodType<Event>,
    make(value: MakeEventInput<z.input<TDataSchema>>) {
      const result = makeInputSchema.safeParse(value);
      if (!result.success) {
        throw invalidEvent(input.type, result.error);
      }
      return {
        type: input.type,
        version: input.version,
        ...result.data,
      } as ContractNewDomainEvent<Event>;
    },
    is(event: unknown): event is Event {
      return eventSchema.safeParse(event).success;
    },
    parse(event: unknown) {
      const result = eventSchema.safeParse(event);
      if (!result.success) {
        throw invalidEvent(input.type, result.error);
      }
      return result.data as Event;
    },
    safeParse(event: unknown): EventParseResult<Event> {
      const result = eventSchema.safeParse(event);
      if (!result.success) {
        return { success: false, error: invalidEvent(input.type, result.error) };
      }
      return { success: true, data: result.data as Event };
    },
  };
}

function invalidEvent(type: string, error: z.ZodError): InvalidDomainEventError {
  return new InvalidDomainEventError(
    type,
    error.issues.map((issue) => `${issue.path.join('.') || 'event'}: ${issue.message}`).join('; '),
  );
}

export type { EventDefinition, EventParseResult, MakeEventInput };
