# Project structure

pnpm-workspace monorepo. Node 22, ESM, strict TypeScript.

```
apps/
  api/          Fastify + Drizzle/Postgres backend (hexagonal — see architecture.md)
  admin/        Next.js back-office
  student/      Next.js student course UI
  web/          older Vite student UI (overlaps student)
packages/
  types/        @headless-lms/types — the published type surface
  utils/        @headless-lms/utils — runtime helpers for integrations
  api-contract/ Zod schemas, source of truth for the HTTP API
  sdk/          @headless-lms/sdk — client generated off the OpenAPI spec
  plugin-slack/ @headless-lms/plugin-slack — the Slack integration
```

## Type ownership

`@headless-lms/types` declares, once, every type an integration (or any consumer)
needs: domain entities and DTOs, domain events (`enrollment.created`, …), and the
integration contract (`Integration`, `Action`, `ActionContext`, `Validation`).
It is pure type declarations — no runtime code, no dependencies — organised one
file per bounded context, mirroring `apps/api/src/core/`.

The api's core does not re-declare these: each context's `model.ts`/`types.ts`/
`events.ts` re-exports from `@headless-lms/types`. Runtime domain code (error
classes, the roles matrix) stays in core.

`@headless-lms/utils` holds the code that must exist at runtime — the zod
adapters (`zodConfig`, `zodSecrets`, `zodAction`) that turn zod schemas into the
contract's JSON-Schema getters and validators. `zod` is a peer dependency.

## Writing an integration

Depend on `@headless-lms/types` (+ `@headless-lms/utils`), never on the api.
Default-export an `Integration`; the api loads it via a folder in
`apps/api/src/plugins/` (directory name = integration id), which may be a thin
re-export of a workspace package (see `packages/plugin-slack`).

```ts
import type { Integration, EnrollmentCreated } from "@headless-lms/types";
import { zodAction } from "@headless-lms/utils";
```
