import { z } from 'zod';
import type { App as StoredApp } from '@headless-lms/core/types';
import { App, AppIdParam, AppList, CreateApp, UpdateApp } from '../../schemas/index.js';
import { defineTool, noInput, type Tool } from '../tool.js';

function appView(app: StoredApp) {
  return {
    id: app.id,
    name: app.name,
    slug: app.slug,
    domain: app.domain,
    courses: app.courses,
    community: app.community,
  };
}

export const appTools: Tool[] = [
  defineTool({
    name: 'list_apps',
    title: 'List apps',
    description:
      "The organization's apps: the frontends it runs, each with its domain and whether it serves courses, the community, or both.",
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: noInput,
    output: z.object({ apps: AppList }),
    call: async (_input, { container, caller }) => ({
      apps: (await container.apps.list(caller.actor)).map(appView),
    }),
  }),
  defineTool({
    name: 'create_app',
    title: 'Create app',
    description:
      'Add an app on a domain no other app has. An organization has at most one app that serves courses and one that serves the community.',
    kind: 'write',
    idempotent: false,
    openWorld: false,
    input: CreateApp,
    output: App,
    call: async (input, { container, caller }) =>
      appView(await container.apps.create(input, caller.actor)),
  }),
  defineTool({
    name: 'update_app',
    title: 'Update app',
    description:
      "Change an app's name, slug, domain or what it serves. Links use the new domain from then on.",
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: UpdateApp.extend(AppIdParam.shape),
    output: App,
    call: async ({ appId, ...input }, { container, caller }) =>
      appView(await container.apps.update(appId, input, caller.actor)),
  }),
  defineTool({
    name: 'delete_app',
    title: 'Delete app',
    description: 'Delete an app. Its domain stops reaching the organization.',
    kind: 'destructive',
    idempotent: false,
    openWorld: false,
    input: AppIdParam,
    call: ({ appId }, { container, caller }) => container.apps.delete(appId, caller.actor),
  }),
];
