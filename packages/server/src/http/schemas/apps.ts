import { z } from 'zod';
import { appNameSchema, appSlugSchema, domainSchema } from '@headless-lms/core/schemas';
import type { App as StoredApp } from '@headless-lms/core/types';

const APP_NAME = "The app's name; `GET /api/app` returns it to the frontend on its domain";
const APP_SLUG = "A short identifier, unique among the organization's apps";
const APP_DOMAIN =
  'The origin the app is reached at, such as https://learn.example.com: an http or https scheme, a domain and an optional port, with nothing else. It is stored as that origin, so a trailing slash or a default port is dropped';
const APP_COURSES = 'Whether the app serves courses and downloads';
const APP_COMMUNITY = 'Whether the app serves communities and events';

export const App = z.object({
  id: z.string(),
  name: z.string().describe(APP_NAME),
  slug: z.string().describe(APP_SLUG),
  domain: z.string().describe(APP_DOMAIN),
  courses: z.boolean().describe(APP_COURSES),
  community: z.boolean().describe(APP_COMMUNITY),
});
export type App = z.infer<typeof App>;

export function appView(app: StoredApp): App {
  return {
    id: app.id,
    name: app.name,
    slug: app.slug,
    domain: app.domain,
    courses: app.courses,
    community: app.community,
  };
}

export const AppList = z.array(App);
export type AppList = z.infer<typeof AppList>;

export const CreateApp = z.object({
  name: appNameSchema.describe(APP_NAME),
  slug: appSlugSchema.describe(APP_SLUG),
  domain: domainSchema.describe(APP_DOMAIN),
  courses: z.boolean().describe(APP_COURSES),
  community: z.boolean().describe(APP_COMMUNITY),
});
export type CreateApp = z.infer<typeof CreateApp>;

export const UpdateApp = z.object({
  name: appNameSchema.optional().describe(APP_NAME),
  slug: appSlugSchema.optional().describe(APP_SLUG),
  domain: domainSchema.optional().describe(APP_DOMAIN),
  courses: z.boolean().optional().describe(APP_COURSES),
  community: z.boolean().optional().describe(APP_COMMUNITY),
});
export type UpdateApp = z.infer<typeof UpdateApp>;

export const AppIdParam = z.object({ appId: z.string().describe("The app's id") });
export type AppIdParam = z.infer<typeof AppIdParam>;

export const AppLookup = z.object({
  organization: z.object({ name: z.string().describe("The organization's name") }),
  app: z.object({
    name: z.string().describe("The app's name"),
    courses: z.boolean().describe(APP_COURSES),
    community: z.boolean().describe(APP_COMMUNITY),
  }),
});
export type AppLookup = z.infer<typeof AppLookup>;
