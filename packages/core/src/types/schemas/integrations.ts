import { z } from 'zod';
import { idSchema, jsonRecordSchema } from './shared.js';

export const validationSchema = z.union([
  z.object({ ok: z.literal(true) }).strict(),
  z.object({ ok: z.literal(false), errors: z.array(z.string()) }).strict(),
]);
export type Validation = z.infer<typeof validationSchema>;

export const connectionSchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    integrationId: idSchema,
    config: jsonRecordSchema,
    active: z.boolean(),
    credentialRef: idSchema,
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type Connection = z.output<typeof connectionSchema>;
export type ConnectionInput = z.input<typeof connectionSchema>;

export const connectInputSchema = z
  .object({
    integrationId: idSchema,
    secrets: jsonRecordSchema,
    config: jsonRecordSchema.optional(),
  })
  .strict();
export type ConnectInput = z.output<typeof connectInputSchema>;

export const configureInputSchema = z
  .object({
    config: jsonRecordSchema.optional(),
    active: z.boolean().optional(),
  })
  .strict();
export type ConfigureInput = z.output<typeof configureInputSchema>;
