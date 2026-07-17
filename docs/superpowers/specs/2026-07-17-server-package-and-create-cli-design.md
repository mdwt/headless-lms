# Server package extraction + `create-headless-lms` wizard

**Date:** 2026-07-17
**Status:** Approved design, pending implementation plan

## Context

Headless LMS currently lives entirely inside a private pnpm monorepo. Everything server-side — domain (`core/`), infra (`adapters/`), read layer (`reporting/`), HTTP (`http/`), wiring (`composition/`) — sits in `apps/api`, so there is no way to run an *installation* of the product separate from the library's source. The goal is the Medusa/Payload model: the product ships as npm packages, and an installation is a thin project folder — entry file, config, env, extension folders — scaffolded by an `npm create` wizard. `apps/api` becomes the reference installation and stays the day-to-day dev environment.

Backend only for now: `apps/admin` and `apps/student` are untouched by this work (deferring them was an explicit decision, not an oversight). Publishing to npm is likewise a later, separate step — until then everything resolves via `workspace:*`.

## Target structure

```
packages/
  server                @headless-lms/server        core/ + adapters/ + reporting/ + http/ + composition/
  create-headless-lms   create-headless-lms         the scaffolding wizard (`npm create headless-lms`)
  api-contract          @headless-lms/api-contract  unchanged
  sdk                   @headless-lms/sdk           unchanged
  shared-types          @headless-lms/shared-types  unchanged
apps/
  api                   reference installation (thin), depends on @headless-lms/server via workspace:*
  admin / student       untouched
```

## `@headless-lms/server`

Absorbs `apps/api/src/{core,adapters,reporting,http,composition}` unchanged in internal layout. The hexagonal layer rules move with the code: the ESLint boundary config for these paths now targets `packages/server`.

### Public API

```ts
createContainer(config: ServerConfig, overrides?: AdapterOverrides): Container
buildServer(config: ServerConfig, container: Container): Promise<FastifyInstance>
loadIntegrations(dir: string): Promise<Integration[]>
// + the ServerConfig / AdapterOverrides / Integration types, and the outbound
//   port interfaces needed to implement overrides (EmailSender, StorageClient, …)
```

Composition stays **inside** the package: `createContainer` wires all default Drizzle adapters into services. Installations do not own wiring — they extend it. `AdapterOverrides` starts minimal, covering only the ports that are stubs or deployment-specific today: `email`, `storage`, `video`, `payment`. Repositories, auth, and events remain internal.

### Migrations + CLI

Drizzle schema and generated migration files ship inside the package. The package exposes a bin:

```
headless-lms migrate   # runs packaged drizzle migrations against DATABASE_URL
headless-lms seed      # current scripts/seed.ts behavior
```

The empty `apps/api/src/cli/index.ts` stub is replaced by this real CLI, living in the server package. `drizzle.config.ts` (for `db:generate` during library development) moves into `packages/server`.

### Integrations rename

`plugins/` is renamed to `integrations/` everywhere: the folder only ever contains implementations of the core `Integration` port (directory name = integration id), loaded by `loadIntegrations`. The composition option is named `integrationsDir`. The bundled `stripe/` and `slack/` implementations move to the reference installation's `integrations/` folder (`apps/api/integrations/`), proving the extension mechanism works from outside the package.

## The installation contract (what `apps/api` becomes, and what the wizard generates)

```
my-lms/
  src/main.ts          ~10 lines: loadConfig → createContainer(config, overrides?) → buildServer → listen
  integrations/        Integration implementations, one folder per integration id
  .env                 all runtime config, secrets included
  .env.example         same keys, secrets blanked
  docker-compose.yml   Postgres + MinIO (if chosen in the wizard)
  package.json         depends on @headless-lms/server; scripts: dev, start, migrate, seed
  tsconfig.json / .gitignore / README.md
```

`apps/api` keeps its existing npm scripts (`dev`, `start`, `db:migrate`, `seed`, `gen:openapi`) but they delegate to the server package / CLI, so the root-level dev loop (`pnpm dev`, `pnpm db:migrate`, `pnpm gen:sdk`) is unchanged. Config continues to be plain env → `ServerConfig` (the current `composition/config.ts` + `http/config.ts` env-reading moves to the installation side; the package receives a validated config object, never reads `process.env` itself).

## `create-headless-lms` (the wizard)

Separate package; `npm create headless-lms` resolves it by npm convention (bin: `create-headless-lms`). Prompt library: `@clack/prompts`.

### Prompts (every one has a default; Enter-through yields a working local setup)

1. **Project name** → target folder + package name
2. **Database** — `docker-compose Postgres` (default; emits compose service + matching `DATABASE_URL`) or `existing connection string` (prompts for it)
3. **Storage** — `bundled MinIO` (default, same compose file), `existing S3` (prompts for endpoint/keys/bucket), or `skip`
4. **Ports/origins** — API port (default 8000), client origins (default `http://localhost:8001,http://localhost:8002`)

Secrets are never prompted: `BETTER_AUTH_SECRET` and `CREDENTIAL_STORE_KEY` are generated with `crypto.randomBytes(32).toString("base64")` and written straight into `.env` (blank in `.env.example`).

### Behavior

- Scaffolds the installation contract above from templates bundled in the package, answers interpolated.
- Refuses to write into a non-empty directory.
- Offers (y/n each) to run `pnpm install` and `headless-lms migrate` at the end; prints next-step instructions either way (`docker compose up -d`, `pnpm dev`).
- Non-interactive escape hatch: `--yes` accepts all defaults (needed for CI testing of the wizard itself).

### Constraint until publishing

A generated project's `@headless-lms/server` dependency only resolves inside this workspace. The wizard is developed and E2E-tested by scaffolding into a temp dir with the dependency pointed at a locally packed tarball (`pnpm pack` of the server package). The generated `package.json` template carries a real semver range so nothing changes at publish time except availability.

## Error handling

- Wizard: validate project name (npm-safe), fail fast on non-empty target dir, clean up the target dir on mid-scaffold failure.
- CLI `migrate`: fail with a clear message when `DATABASE_URL` is missing/unreachable rather than drizzle's raw stack.
- `loadIntegrations`: unchanged behavior; a folder not satisfying the `Integration` port fails startup with the folder name in the error.

## Testing

- Existing `service.test.ts` suites move with `core/` into the package and must pass unchanged (`pnpm test`).
- `pnpm lint` verifies the relocated boundary rules; `pnpm typecheck` and `pnpm gen:sdk` verify the api app still composes and the OpenAPI/SDK pipeline is intact.
- Wizard: unit tests for prompt→file mapping (run with `--yes` + flags), plus an E2E test that scaffolds into a temp dir against a packed server tarball, runs `migrate` against the docker Postgres, and boots the server.
