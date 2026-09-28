import { z } from 'zod';
import { idSchema, jsonRecordSchema } from './shared.js';

export const eventOutboxSchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    type: z.string(),
    payload: jsonRecordSchema,
    attempts: z.number().int(),
    nextAttemptAt: z.coerce.date(),
    lastError: z.string().nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    processedAt: z.coerce.date().nullable(),
  })
  .strict();
export type EventOutbox = z.output<typeof eventOutboxSchema>;
export type EventOutboxInput = z.input<typeof eventOutboxSchema>;
