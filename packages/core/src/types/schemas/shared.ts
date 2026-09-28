import { z } from 'zod';
import type { DomainEvent, EventMetadata, JsonValue } from '../shared.js';

export const idSchema: z.ZodString = z.string().trim().min(1);

// The default z.email() pattern uses lookaheads, which RE2-based OpenAPI
// consumers (Go, linters) reject. The HTML5 pattern is lookahead-free.
export const emailSchema: z.ZodEmail = z.email({ pattern: z.regexes.html5Email });

export const isoDateStringSchema = z.string().trim().min(1);

export const serializableDateSchema = z.union([
  z.coerce.date().transform((value) => value.toISOString()),
  isoDateStringSchema,
]);

export const jsonValueSchema: z.ZodType<JsonValue, unknown> = z.lazy(() =>
  z.union([
    z.null(),
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);
// Recursive schemas serialize to JSON Schema as a $ref; without a registered
// id the ref gets an auto-name ("schema0") that OpenAPI tooling can't resolve.
z.globalRegistry.add(jsonValueSchema, { id: 'JsonValue' });

export const jsonRecordSchema = z.record(z.string(), jsonValueSchema);

export const eventMetadataSchema: z.ZodType<EventMetadata> = z.record(z.string(), jsonValueSchema);

export const domainEventSchema: z.ZodType<DomainEvent> = z
  .object({
    type: z.string().trim().min(1),
    version: z.number().int().positive(),
    id: idSchema,
    orgId: idSchema,
    occurredAt: isoDateStringSchema,
    data: jsonValueSchema,
    metadata: eventMetadataSchema.optional(),
  })
  .strict();
