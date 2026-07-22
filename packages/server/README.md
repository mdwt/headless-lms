# @headless-lms/server

The LMS backend as a library: the hexagonal core (bounded contexts), adapters
(Drizzle/Postgres, better-auth, MinIO, …), and the Fastify HTTP layer. An
installation (e.g. `apps/api`) composes it and owns only its config, entry
point, and integration plugins. The `headless-lms` bin lives in
`@headless-lms/cli`.

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
`loadIntegrations`, the operational functions `runMigrations` / `runSeed`
(the `drizzle/` migration assets ship with the package; `@headless-lms/cli`
wraps them as `headless-lms migrate|seed`), and the types installations need
(`ServerConfig`, `Container`, `AdapterOverrides`, shared ports like
`EmailSender` / `ObjectStorage`). Everything else is internal.

## Layout

```
src/
  core/         framework-free domain, one folder per bounded context
  reporting/    cross-context read layer (students, dashboard)
  adapters/     outbound infra: db, auth, email, events, storage, video…
  composition/  container.ts — wires adapters into services; integration
                loader; migrate + seed
  http/         Fastify server, routes validated against @headless-lms/api-contract
```

Import boundaries between these layers are enforced by ESLint (`pnpm lint`).

## Develop

```bash
pnpm --filter @headless-lms/server test        # vitest
pnpm --filter @headless-lms/server typecheck   # tsc --noEmit (tsdown owns the build)
pnpm --filter @headless-lms/server db:generate # drizzle-kit generate (reads root .env)
```
