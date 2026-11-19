// Organization resource schemas. Org creation is served by the API's own
// `/api/organizations` route (which drives Better Auth under the hood), so the
// created org is part of the typed contract and SDK — not the auth namespace.
import { z } from 'zod';
import { appNameSchema, appSlugSchema, domainSchema } from '@headless-lms/core/schemas';

export const Organization = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.string(),
});
export type Organization = z.infer<typeof Organization>;

export const CreateOrganization = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers, and hyphens only')
    .describe(
      "Unique. The organization's first app takes this slug, and its domain is the slug under the platform host.",
    ),
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
});
export type UpdateOrganization = z.infer<typeof UpdateOrganization>;

const APP_DOMAIN = 'The origin the app is reached at, such as https://learn.example.com';
const APP_COURSES = 'Whether the app serves courses and downloads';
const APP_COMMUNITY = 'Whether the app serves communities and events';

export const App = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  domain: z.string().describe(APP_DOMAIN),
  courses: z.boolean().describe(APP_COURSES),
  community: z.boolean().describe(APP_COMMUNITY),
});
export type App = z.infer<typeof App>;

export const AppList = z.array(App);
export type AppList = z.infer<typeof AppList>;

export const CreateApp = z.object({
  name: appNameSchema,
  slug: appSlugSchema.describe("Unique among the organization's apps"),
  domain: domainSchema.describe(APP_DOMAIN),
  courses: z.boolean().describe(APP_COURSES),
  community: z.boolean().describe(APP_COMMUNITY),
});
export type CreateApp = z.infer<typeof CreateApp>;

export const UpdateApp = z.object({
  name: appNameSchema.optional(),
  slug: appSlugSchema.optional(),
  domain: domainSchema.optional().describe(APP_DOMAIN),
  courses: z.boolean().optional().describe(APP_COURSES),
  community: z.boolean().optional().describe(APP_COMMUNITY),
});
export type UpdateApp = z.infer<typeof UpdateApp>;

export const AppIdParam = z.object({ appId: z.string() });
export type AppIdParam = z.infer<typeof AppIdParam>;

export const AppLookup = z.object({
  organization: z.object({ name: z.string() }),
  app: z.object({
    name: z.string(),
    courses: z.boolean().describe(APP_COURSES),
    community: z.boolean().describe(APP_COMMUNITY),
  }),
});
export type AppLookup = z.infer<typeof AppLookup>;
