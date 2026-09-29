# @headless-lms/server

The Fastify HTTP layer plus the composition root that wires `@headless-lms/core`
(the hexagonal domain) to its adapters (`@headless-lms/adapter-db`,
`-auth`, `-defaults`, and whatever an installation passes in). An installation
(e.g. `apps/api`) composes it and owns only its config, entry point, and
integration plugins. The `headless-lms` bin lives in `@headless-lms/cli`.

## Usage

```ts
import { createContainer, buildServer } from '@headless-lms/server';

const container = await createContainer(config, {
  pluginsDir, // one folder per integration (directory name = integration id)
});
const app = await buildServer(config, container);
await app.listen({ port: config.port, host: config.host });
```

Public surface (`src/index.ts`): `createContainer`, `buildServer`,
`loadIntegrations`, the operational function `runMigrations` (re-exported from
`@headless-lms/adapter-db`, which ships the `drizzle/` migration assets;
`@headless-lms/cli` wraps it as `headless-lms migrate`), and the types
installations need (`ServerConfig`, `Container`, `AdapterOverrides`, shared ports
like `EmailSender` / `ObjectStorage` / `WebhookSender`). Everything else is internal.

## Layout

```
src/
  app/          container.ts — wires adapters into core's services; integration
                loader
  http/         Fastify server; routes validated against the Zod schemas in
                http/schemas — the source of truth for the OpenAPI spec and SDK
```

The domain lives in `@headless-lms/core` and the infrastructure in
`adapters/*`; this package holds neither. Import boundaries between the packages
are enforced by ESLint (`pnpm lint`).

## Develop

```bash
pnpm --filter @headless-lms/server test        # vitest
pnpm --filter @headless-lms/server typecheck   # tsc --noEmit (tsdown owns the build)
pnpm db:generate                               # drizzle-kit generate in @headless-lms/adapter-db
```
