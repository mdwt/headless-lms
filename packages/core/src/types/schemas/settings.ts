import { z } from 'zod';
import { idSchema, jsonRecordSchema } from './shared.js';

export const settingSchema = z
  .object({
    orgId: idSchema,
    namespace: z.string(),
    scopeId: idSchema,
    value: jsonRecordSchema,
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type Setting = z.output<typeof settingSchema>;
export type SettingInput = z.input<typeof settingSchema>;
