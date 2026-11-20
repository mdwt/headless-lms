import { z } from 'zod';
import { idSchema } from './shared.js';

const HOST_NAME = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;
const HOST_IPV6 = /^\[[0-9a-f:.]+\]$/;

function originOf(value: string): string | null {
  if (!URL.canParse(value)) {
    return null;
  }
  const url = new URL(value);
  const web = url.protocol === 'https:' || url.protocol === 'http:';
  const bare = url.pathname === '/' && url.search === '' && url.hash === '';
  const plain = url.username === '' && url.password === '';
  const named = HOST_NAME.test(url.hostname) || HOST_IPV6.test(url.hostname);
  return web && bare && plain && named ? url.origin : null;
}

export const domainSchema = z
  .string()
  .trim()
  .refine((value) => originOf(value) !== null, {
    message: 'Use an origin such as https://learn.example.com, without a path',
  })
  .transform((value) => originOf(value) ?? value);

export const appSchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    name: z.string(),
    slug: z.string(),
    domain: z.string(),
    courses: z.boolean(),
    community: z.boolean(),
  })
  .strict();
export type App = z.infer<typeof appSchema>;

export const appNameSchema = z.string().trim().min(1).max(100);
export const appSlugSchema = z
  .string()
  .min(1)
  .max(50)
  .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers, and hyphens only');

export const createAppInputSchema = z
  .object({
    name: appNameSchema,
    slug: appSlugSchema,
    domain: domainSchema,
    courses: z.boolean(),
    community: z.boolean(),
  })
  .strict();
export type CreateAppInput = z.infer<typeof createAppInputSchema>;

export const updateAppInputSchema = z
  .object({
    name: appNameSchema.optional(),
    slug: appSlugSchema.optional(),
    domain: domainSchema.optional(),
    courses: z.boolean().optional(),
    community: z.boolean().optional(),
  })
  .strict();
export type UpdateAppInput = z.infer<typeof updateAppInputSchema>;
