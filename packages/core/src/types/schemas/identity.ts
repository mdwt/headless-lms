import { z } from 'zod';
import { idSchema, emailSchema } from './shared.js';

export const userSchema = z
  .object({
    id: idSchema,
    externalId: idSchema.nullable(),
    email: emailSchema,
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type User = z.output<typeof userSchema>;
export type UserInput = z.input<typeof userSchema>;

export const createUserInputSchema = z
  .object({
    id: idSchema.optional(),
    externalId: idSchema.optional(),
    email: emailSchema,
    firstName: z.string().optional(),
    lastName: z.string().optional(),
  })
  .strict();
export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const provisionUserInputSchema = z
  .object({
    email: emailSchema,
    firstName: z.string().optional(),
    lastName: z.string().optional(),
  })
  .strict();
export type ProvisionUserInput = z.infer<typeof provisionUserInputSchema>;

export const updateUserInputSchema = z
  .object({
    externalId: idSchema.optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: emailSchema.optional(),
  })
  .strict();
export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;
