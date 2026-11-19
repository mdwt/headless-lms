import { z } from 'zod';
import { appNameSchema, appSlugSchema, domainSchema } from '@headless-lms/core/schemas';

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
