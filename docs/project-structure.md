# Project structure

pnpm-workspace monorepo. Node 22, ESM, strict TypeScript.

```
apps/
  api/          this repo's installation of @headless-lms/server (config, entry, plugins)
  admin/        Next.js back-office
  student/      Next.js student course UI
  website/      Next.js marketing site + fumadocs public docs
packages/
  core/         @headless-lms/core — the domain: bounded contexts, reporting, type surface, zod schemas
  server/       @headless-lms/server — composition root (app/) + Fastify HTTP layer (http/)
  cli/          @headless-lms/cli — the headless-lms bin (migrate)
  create-headless-lms/  npm create headless-lms — installation scaffolder
  editor/       @headless-lms/editor — the React-bound activity editor contract
  sdk/          @headless-lms/sdk — client generated off the OpenAPI spec
plugins/
  slack/          @headless-lms/plugin-slack — the Slack integration
  content-plate/  @headless-lms/content-plate — the Plate implementation of the editor contract
adapters/
  db/                @headless-lms/adapter-db — drizzle schema (incl. the better-auth `ba_*`
                     tables), the repositories, unit of work, migrations + runMigrations
  auth/              @headless-lms/adapter-auth — Better Auth
  defaults/          @headless-lms/adapter-defaults — in-process event bus + outbox relay, pino
                     logging, inline workflow engine, fetch webhook sender, fail-loud
                     email/storage/template stubs
  email-resend/      @headless-lms/adapter-email-resend — EmailSender via Resend
  email-templates/   @headless-lms/adapter-email-templates — TemplateRenderer via React Email
  storage-minio/     @headless-lms/adapter-storage-minio — ObjectStorage via MinIO/S3
  workflow-hatchet/  @headless-lms/adapter-workflow-hatchet — AutomationEngine via Hatchet
```

`@headless-lms/adapter-db` owns `drizzle.config.ts`, the generated `drizzle/`
migrations and `check-sql.mts` (an ad-hoc script that runs the repository queries
against a live database by hand). The root `db:generate` / `db:migrate` scripts
filter to this package.

`@headless-lms/core` exposes subpaths only — one per context (`@headless-lms/core/content`),
plus `/shared/*`, `/reporting/*`, `/types` and `/schemas`. There is no root entry, so a
context's internals are unreachable from outside it.

## Builds

Everything with a build step builds with **tsdown** (`tsdown.config.ts` per
workspace). Two shapes:

- **Bundled per entry**, to `dist/` with `.d.ts` — `utils`, `editor`, `plugins/slack`,
  and the four leaf adapters (`email-resend`, `email-templates`, `storage-minio`,
  `workflow-hatchet`). The cli bundles to a single bin.
- **Transpiled file-for-file** (`unbundle: true`) — `core`, the three db-backed
  adapters (`db`, `auth`, `defaults`), the server, the api installation and the
  scaffolder's project template (`create-headless-lms/templates`). Core and the
  adapters so each subpath export resolves to its own file, the server so its
  integrations loader can resolve compiled plugin folders, the api and the template
  so `dist/main.js` stays the process entry.

`dts` is on everywhere something is imported as a package, and off for the four
process-entry builds nothing imports: the api installation, the project template,
the cli and the scaffolder.

Two workspaces have no build step at all and are consumed as TypeScript source:
`@headless-lms/sdk` (its `exports` point at `src/`; `pnpm gen:sdk` regenerates
`src/generated/` off the OpenAPI spec) and `plugins/content-plate`.

`tsc` never emits — it is the typechecker (`pnpm typecheck`).

## Type ownership

`@headless-lms/core/types` declares, once, the types an integration (or any
consumer) needs: domain entities and DTOs, the event machinery (`DomainEvent`,
`NewDomainEvent`, `EventDefinition`), and the integration contract (`Integration`,
`Action`, `ActionContext`, `Validation`). It is pure type declarations — no runtime
code — organised one file per bounded context, mirroring the contexts alongside it
in `packages/core/src/`, plus `shared.ts`, `events.ts`, `ports.ts` and
`email-templates.ts`. The zod schemas live under it (`types/schemas/`) and are
published as `@headless-lms/core/schemas`.

The contexts do not re-declare the entity types: each context's `model.ts`/
`types.ts` re-exports from `../types/` (its `index.js`, or `schemas/` for the
zod-derived shapes). Runtime domain code (error classes, the roles matrix) stays
in the context.

Domain events are the exception — each context **owns** its events. A context's
`events.ts` declares them with `defineEvent` and exports both the runtime
definitions and the derived types (`entitlements/events.ts` →
`entitlementEvents`, `EntitlementCreated`, `EntitlementEvent`), re-exported from
that context's `index.ts`. So an event type comes from
`@headless-lms/core/entitlements`, not from `/types`.

The deployment-swappable ports (`Logger`, `EmailSender`, `ObjectStorage`) are
declared in `types/ports.ts` (`TemplateRenderer` in `types/email-templates.ts`) and
re-exported by `@headless-lms/core/shared/ports` alongside the ports that only
exist at runtime (`EventBus`, `OutboxStore`, `OutboxRelay`, `UnitOfWork`,
`CredentialStore`, `Clock`), so adapter packages implement them without depending
on the server.

## Writing an adapter

An `adapters/*` package implements a deployment port from `@headless-lms/core/types`.
A new leaf adapter typically needs nothing beyond `@headless-lms/core` and its vendor
SDK; an adapter may also depend on another adapter (`adapter-auth` and
`adapter-defaults` both build on `adapter-db`). The installation parses the
adapter's env in its `config.ts`, constructs the adapter, and injects it:

```ts
const container = await createContainer(config, {
  adapters: { email: new ResendEmailAdapter(emailConfig) },
});
```

A slot left absent falls back to the default from `@headless-lms/adapter-defaults`
— for email, storage and templates, a stub that fails loudly on use; for workflows,
the in-process `InlineAutomationEngine`; for webhooks, `FetchWebhookSender`. `apps/api/src/config.ts` is the only file
on the backend that touches `process.env`; `adapters/email-resend`,
`storage-minio` and `workflow-hatchet` each carry a README for the env they expect.

`@headless-lms/core/integrations` holds the code that must exist at runtime — the
zod adapters (`zodConfig`, `zodSecrets`, `zodAction`) that turn zod schemas into
the contract's JSON-Schema getters and validators.

## Writing an integration

Depend on `@headless-lms/core`, never on the server — `/types` for the contract,
`/integrations` for the zod adapters, plus whichever context subpaths carry the
events you react to. Default-export an `Integration`; the server loads it from the
installation's plugins dir (`pluginsDir`, e.g. `apps/api/src/plugins/` — directory
name = integration id). A plugin folder may be a thin re-export of a workspace
package (see `plugins/slack`).

```ts
import type { Integration } from "@headless-lms/core/types";
import type { EntitlementCreated } from "@headless-lms/core/entitlements";
import { zodAction } from "@headless-lms/core/integrations";
```
