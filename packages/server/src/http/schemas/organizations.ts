// Organization resource schemas. Org creation is served by the API's own
// `/api/organizations` route (which drives Better Auth under the hood), so the
// created org is part of the typed contract and SDK — not the auth namespace.
import { z } from 'zod';
import { hostSchema } from '@headless-lms/core/schemas';

export const OrganizationHosts = z.object({
  courses: z
    .string()
    .describe(
      'Origin of the app that shows courses and downloads, such as https://learn.example.com',
    ),
  community: z
    .string()
    .describe(
      'Origin of the app that shows communities and events, such as https://club.example.com',
    ),
});
export type OrganizationHosts = z.infer<typeof OrganizationHosts>;

export const Organization = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.string(),
  hosts: OrganizationHosts.describe(
    "Where the organization's member apps are reached. Links in emails, invites and calendar files use them.",
  ),
});
export type Organization = z.infer<typeof Organization>;

export const CreateOrganization = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers, and hyphens only')
    .describe("Unique. The organization's first host is this slug under the platform host."),
});
export type CreateOrganization = z.infer<typeof CreateOrganization>;

// Update the active organization's profile. Slug must stay URL-safe (Better Auth
// enforces uniqueness); both fields are sent together from the settings form.
export const UpdateOrganization = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers, and hyphens only'),
  hosts: z
    .object({
      courses: hostSchema.describe(OrganizationHosts.shape.courses.description ?? ''),
      community: hostSchema.describe(OrganizationHosts.shape.community.description ?? ''),
    })
    .optional()
    .describe('Both hosts, replacing the current ones. Left out, the hosts stay as they are.'),
});
export type UpdateOrganization = z.infer<typeof UpdateOrganization>;
