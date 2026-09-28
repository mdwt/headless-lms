import { z } from 'zod';
import { idSchema } from './shared.js';

export const credentialSchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    ciphertext: z.string(),
    keyVersion: z.number().int(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type Credential = z.output<typeof credentialSchema>;
export type CredentialInput = z.input<typeof credentialSchema>;
