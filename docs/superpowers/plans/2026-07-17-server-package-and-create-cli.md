# @headless-lms/server extraction + create-headless-lms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract everything server-side out of `apps/api` into `@headless-lms/server`, leaving `apps/api` a thin reference installation, and build the `create-headless-lms` wizard that scaffolds identical installations.

**Architecture:** `packages/server` absorbs `apps/api/src/{core,adapters,reporting,http,composition}` plus the drizzle migrations, exposing `createContainer(config, { pluginsDir, adapters })` and `buildServer(config, container)`; env-reading stays installation-side. A `headless-lms` bin in the server package runs packaged migrations and seed. `packages/create-headless-lms` renders an installation from bundled templates via `@clack/prompts`.

**Tech Stack:** Node 22 ESM, TypeScript strict (NodeNext in server/api), Fastify 5, drizzle-orm/pg, tsdown builds, vitest, @clack/prompts.

**Spec:** `docs/superpowers/specs/2026-07-17-server-package-and-create-cli-design.md`

## Global Constraints

- Work happens in the `types-utils-packages` worktree; commit locally, never push, never touch `main`.
- Node `>=22`, ESM only, relative imports carry `.js` extensions (NodeNext enforces).
- tsc never emits — tsdown owns builds; `typecheck` scripts are `tsc --noEmit`.
- zod is `4.4.3` everywhere it appears.
- All workspace deps use `workspace:*`; no npm publishing anywhere in this plan.
- No AI-attribution trailers in commits (repo rule).
- After any cross-layer import change: `pnpm lint` must pass.
- Two deliberate deviations from the spec, justified here once:
  - `AdapterOverrides` covers `email` and `storage` only. `video`/`payment` adapters exist as empty stubs but are not wired into the container at all — adding override slots for unwired ports would be dead API. They join `AdapterOverrides` when the container gains those ports.
  - The installation's plugins folder is `src/plugins/` (not top-level `plugins/`), exactly as `apps/api` has it today: the standard tsdown build compiles `src/**` file-for-file, which is what keeps the loader's "index.ts from source, index.js from dist" duality working. A top-level folder would need its own build wiring for zero benefit.

---

### Task 1: Scaffold `packages/server`

**Files:**
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/tsdown.config.ts`
- Create: `packages/server/vitest.config.ts`
- Create: `packages/server/src/index.ts` (placeholder export, replaced in Task 2)
- Modify: `tsconfig.base.json` (add path mapping)

**Interfaces:**
- Produces: the workspace package `@headless-lms/server` that Tasks 2–4 fill in; path alias `@headless-lms/server` → `packages/server/src/index.ts`.

- [ ] **Step 1: Create the package manifest**

`packages/server/package.json` — runtime deps are exactly `apps/api`'s minus the plugin/workspace-consumer bits; `@faker-js/faker` becomes a runtime dep because `seed` ships in the CLI (Task 4):

```json
{
  "name": "@headless-lms/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "bin": {
    "headless-lms": "./dist/cli/index.js"
  },
  "files": ["dist", "drizzle"],
  "scripts": {
    "build": "tsdown",
    "test": "vitest run",
    "lint": "eslint src",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "db:generate": "tsx --env-file=../../.env node_modules/drizzle-kit/bin.cjs generate",
    "db:migrate": "tsx --env-file=../../.env node_modules/drizzle-kit/bin.cjs migrate"
  },
  "dependencies": {
    "@faker-js/faker": "^10.5.0",
    "@fastify/cors": "^11.2.0",
    "@fastify/swagger": "^9.7.0",
    "@fastify/swagger-ui": "^6.0.0",
    "@headless-lms/api-contract": "workspace:*",
    "@headless-lms/types": "workspace:*",
    "@headless-lms/utils": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.29.0",
    "better-auth": "^1.6.22",
    "drizzle-orm": "^0.45.2",
    "fastify": "^5.2.0",
    "fastify-type-provider-zod": "^7.0.0",
    "ksuid": "^3.0.0",
    "minio": "^8.0.7",
    "pg": "^8.13.1",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "@types/pg": "^8.11.10",
    "drizzle-kit": "^0.31.10",
    "tsdown": "^0.22.9",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create tsconfig, tsdown config, vitest config**

`packages/server/tsconfig.json` — same shape as `apps/api`'s (NodeNext, no declaration emit conflicts; tsdown's dts uses its own pipeline):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "composite": false,
    "declaration": false,
    "declarationMap": false
  },
  "include": ["src/**/*.ts"]
}
```

`packages/server/tsdown.config.ts` — the api's unbundle config, plus dts for the public entry:

```ts
import { defineConfig } from "tsdown";

export default defineConfig({
  // Transpile-only: mirror src/ into dist/ file-for-file — keeps the hexagonal
  // layout intact, keeps dist/cli/index.js as the bin target, and lets the
  // integrations loader resolve compiled plugin folders in consumers.
  unbundle: true,
  entry: ["src/**/*.ts", "!src/**/*.test.ts", "!src/**/__fixtures__/**"],
  outDir: "dist",
  format: ["esm"],
  fixedExtension: false,
  target: "node22",
  platform: "node",
  sourcemap: true,
  clean: true,
  // Public API consumers need types; per-file dts matches unbundle output.
  dts: true,
});
```

`packages/server/vitest.config.ts` — copy of `apps/api/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: false,
  },
});
```

`packages/server/src/index.ts` placeholder (Task 2 replaces it):

```ts
export {};
```

- [ ] **Step 3: Add the path alias**

In `tsconfig.base.json`, add to `compilerOptions.paths`:

```json
"@headless-lms/server": ["./packages/server/src/index.ts"]
```

- [ ] **Step 4: Install + build to verify the skeleton**

Run: `pnpm install && pnpm --filter @headless-lms/server build`
Expected: install links the new workspace; build emits `packages/server/dist/index.js` with no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/server tsconfig.base.json pnpm-lock.yaml
git commit -m "feat(server): scaffold @headless-lms/server package"
```

---

### Task 2: Move the server source into the package

The move itself. After this task the **server package** builds and its tests pass; `apps/api` is broken until Task 3 (its own test cycle covers the whole repo).

**Files:**
- Move: `apps/api/src/core` → `packages/server/src/core`
- Move: `apps/api/src/adapters` → `packages/server/src/adapters`
- Move: `apps/api/src/reporting` → `packages/server/src/reporting`
- Move: `apps/api/src/http` → `packages/server/src/http`
- Move: `apps/api/src/composition` → `packages/server/src/composition`
- Move: `apps/api/drizzle` → `packages/server/drizzle`, `apps/api/drizzle.config.ts` → `packages/server/drizzle.config.ts`
- Delete: `apps/api/src/cli/index.ts` (stub; real CLI arrives in Task 4)
- Modify: `packages/server/src/composition/container.ts`, `packages/server/src/composition/integrations.ts`, `packages/server/src/composition/config.ts` (delete), `packages/server/src/http/config.ts`, `packages/server/src/http/server.ts`, `packages/server/src/index.ts`
- Test: existing `src/**/*.test.ts` suites move with their directories; `packages/server/src/composition/integrations.test.ts` updated

**Interfaces:**
- Consumes: Task 1's package skeleton.
- Produces (the package's public API, used by Tasks 3–8):
  - `createContainer(config: ServerConfig, options?: { pluginsDir?: string; adapters?: AdapterOverrides }): Promise<Container>`
  - `buildServer(config: ServerConfig, container: Container): Promise<FastifyInstance>`
  - `loadIntegrations(dir?: string): Promise<IntegrationsRegistry>`
  - types: `ServerConfig`, `ContainerConfig`, `Container`, `AdapterOverrides`, ports `EmailSender`, `ObjectStorage`

- [ ] **Step 1: Move the trees with git mv**

```bash
cd .claude/worktrees/types-utils-packages   # if not already there
git mv apps/api/src/core packages/server/src/core
git mv apps/api/src/adapters packages/server/src/adapters
git mv apps/api/src/reporting packages/server/src/reporting
git mv apps/api/src/http packages/server/src/http
git mv apps/api/src/composition packages/server/src/composition
git mv apps/api/drizzle packages/server/drizzle
git mv apps/api/drizzle.config.ts packages/server/drizzle.config.ts
git rm -r apps/api/src/cli
```

Internal relative imports survive unchanged because the five trees moved together.

- [ ] **Step 2: Make the integrations loader take an optional dir**

In `packages/server/src/composition/integrations.ts`: delete the `PLUGINS_DIR` constant (and the now-unused `fileURLToPath` import) and change the signature — no dir means an empty registry (the package ships no plugins):

```ts
export async function loadIntegrations(dir?: string): Promise<IntegrationsRegistry> {
  if (!dir) return createIntegrationsRegistry([]);
  const entries = await readdir(dir, { withFileTypes: true });
  // ... rest of the function body unchanged ...
```

Update the file's header comment: the plugins directory is installation-owned and passed in by composition options; scanning semantics are unchanged.

- [ ] **Step 3: Thread options through the container**

In `packages/server/src/composition/container.ts`:

Add above `Config`:

```ts
import type { EmailSender, ObjectStorage } from "../core/shared/ports.js";

/** Deployment-specific ports an installation may swap. */
export interface AdapterOverrides {
  email?: EmailSender;
  storage?: ObjectStorage;
}

export interface BuildContainerOptions {
  /** Installation's plugins folder, scanned by loadIntegrations. Absent → no integrations. */
  pluginsDir?: string;
  adapters?: AdapterOverrides;
}
```

Change the `Container` interface's storage line from `storage: MinioStorageAdapter;` to:

```ts
storage: ObjectStorage;
```

Change the signature and the three wiring lines:

```ts
export async function buildContainer(
  config: Config,
  options?: BuildContainerOptions,
): Promise<Container> {
```

```ts
const email = options?.adapters?.email ?? new EmailAdapter();
const storage: ObjectStorage = options?.adapters?.storage ?? new MinioStorageAdapter(config.storage);
```

```ts
const integrationsRegistry = await loadIntegrations(options?.pluginsDir);
```

Update the comment above `loadIntegrations` (no longer "everything under src/plugins/" — it's the installation's declared folder).

- [ ] **Step 4: Strip env-reading from the package**

Delete `packages/server/src/composition/config.ts` (`git rm`). Its env-loading moves to `apps/api` in Task 3; the `Config` type it referenced already lives in `container.ts`.

Rewrite `packages/server/src/http/config.ts` to types only:

```ts
// Server-level configuration for the HTTP entry point. The package never reads
// process.env — installations build this object (typically from their .env)
// and pass it to createContainer/buildServer.
import type { Config } from "../composition/container.js";

export interface ServerConfig {
  /** TCP port to listen on. */
  port: number;
  /** Bind address. */
  host: string;
  /** The API's own origin, advertised as the OpenAPI server URL. */
  publicUrl: string;
  /** Browser app origins allowed by CORS. */
  clientOrigins: string[];
  /** Everything the composition container needs to wire adapters + services. */
  container: Config;
}
```

- [ ] **Step 5: buildServer takes the container**

In `packages/server/src/http/server.ts` — drop the default-config import and internal container build:

```ts
import Fastify, { type FastifyInstance } from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import type { Container } from "../composition/container.js";
import type { ServerConfig } from "./config.js";
import { registerCors } from "./plugins/cors.js";
import { registerOpenApi } from "./plugins/openapi.js";
import { registerAuth } from "./plugins/auth.js";
import { registerErrorHandler } from "./plugins/error-handler.js";
import { registerRoutes } from "./routes.js";

export async function buildServer(
  config: ServerConfig,
  container: Container,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  // Validate + serialize request/response bodies from the shared Zod contract.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  registerCors(app, config);
  registerOpenApi(app, config);
  registerAuth(app, container);
  registerErrorHandler(app);
  registerRoutes(app, container);

  return app;
}
```

Then find every in-package caller of `buildServer` and `buildContainer` and update it:

Run: `grep -rn "buildServer\|buildContainer\|loadServerConfig\|loadConfigFromEnv" packages/server/src`
Every hit inside http tests or main-like files must construct config explicitly. `packages/server/src/http/main.ts` is deleted (`git rm`) — the process entry belongs to installations (Task 3 recreates it in `apps/api`).

- [ ] **Step 6: The public API surface**

Replace `packages/server/src/index.ts`:

```ts
// Public surface of @headless-lms/server. Installations compose these:
//   const container = await createContainer(config, { pluginsDir, adapters })
//   const app = await buildServer(config, container)
import { buildContainer, type BuildContainerOptions, type Container } from "./composition/container.js";
import type { ServerConfig } from "./http/config.js";

export { buildServer } from "./http/server.js";
export { loadIntegrations } from "./composition/integrations.js";
export type { ServerConfig } from "./http/config.js";
export type {
  Config as ContainerConfig,
  Container,
  AdapterOverrides,
  BuildContainerOptions,
} from "./composition/container.js";
export type { EmailSender, EmailMessage, ObjectStorage } from "./core/shared/ports.js";
export type { MinioStorageConfig } from "./adapters/storage/index.js";

export async function createContainer(
  config: ServerConfig,
  options?: BuildContainerOptions,
): Promise<Container> {
  return buildContainer(config.container, options);
}
```

- [ ] **Step 7: Fix the composition integrations test**

In `packages/server/src/composition/integrations.test.ts`: the test that loaded the default directory (expecting slack/stripe) no longer applies — the package has no plugins. Replace that test with:

```ts
it("returns an empty registry when no plugins dir is given", async () => {
  const registry = await loadIntegrations();
  expect(registry.list()).toEqual([]);
});
```

(If the registry's listing method has a different name, match whatever the existing test file already calls on the registry.) The fixture-based failure tests (`must match its directory name`, `Integration port`) pass an explicit dir already — keep them unchanged.

- [ ] **Step 8: Build + test the package**

Run: `pnpm install && pnpm --filter @headless-lms/server build && pnpm --filter @headless-lms/server test && pnpm --filter @headless-lms/server typecheck`
Expected: build emits, all moved `service.test.ts` suites pass unchanged, typecheck clean. (`apps/api` is expectedly broken right now — do not run repo-wide checks yet.)

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(server): move core/adapters/reporting/http/composition into @headless-lms/server"
```

---

### Task 3: Thin `apps/api` into the reference installation

**Files:**
- Create: `apps/api/src/config.ts` (env → ServerConfig)
- Create: `apps/api/src/main.ts`
- Modify: `apps/api/package.json`, `apps/api/scripts/gen-openapi.ts`, `apps/api/src/plugins/integrations.test.ts`, `apps/api/tsdown.config.ts` (only if entry globs need it — they don't; verify)
- Modify: `.eslintrc.cjs`, root `package.json`
- Delete: `apps/api/scripts/seed.ts` moves in Task 4 — leave it untouched here

**Interfaces:**
- Consumes: `createContainer`, `buildServer`, `loadIntegrations`, `ServerConfig`, `ContainerConfig` from `@headless-lms/server` (Task 2).
- Produces: the installation contract other tasks template from — `src/config.ts` exporting `loadServerConfig(): ServerConfig` and `parseClientOrigins(): string[]`; `src/main.ts` as the process entry; `src/plugins/` unchanged on disk.

- [ ] **Step 1: Write the installation config module**

`apps/api/src/config.ts` — the merged content of the old `composition/config.ts` + `http/config.ts` loaders (this exact file is also the wizard's `config.ts` template):

```ts
// Reads all runtime configuration from the environment and builds the
// ServerConfig that @headless-lms/server consumes. The only file that
// touches process.env.
import type { ServerConfig, ContainerConfig } from "@headless-lms/server";

/** Browser app origins from CLIENT_ORIGIN (comma-separated). */
export function parseClientOrigins(): string[] {
  return (process.env.CLIENT_ORIGIN ?? "http://localhost:8001,http://localhost:8002")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

function loadContainerConfig(): ContainerConfig {
  const clientOrigins = parseClientOrigins();
  const apiOrigin = process.env.BETTER_AUTH_URL ?? "http://localhost:8000";
  const trustedOrigins = [...new Set([...clientOrigins, apiOrigin])];
  return {
    databaseUrl: process.env.DATABASE_URL ?? "",
    authBaseURL: apiOrigin,
    authSecret: process.env.BETTER_AUTH_SECRET ?? "",
    trustedOrigins,
    mcpLoginPage: process.env.MCP_LOGIN_PAGE ?? "http://localhost:8001/login",
    credentialStoreKey: process.env.CREDENTIAL_STORE_KEY ?? "",
    storage: {
      endPoint: process.env.STORAGE_ENDPOINT ?? "localhost",
      port: Number(process.env.STORAGE_PORT ?? 8006),
      useSSL: (process.env.STORAGE_USE_SSL ?? "false") === "true",
      accessKey: process.env.STORAGE_ACCESS_KEY ?? "minioadmin",
      secretKey: process.env.STORAGE_SECRET_KEY ?? "minioadmin",
      region: process.env.STORAGE_REGION ?? "us-east-1",
      bucket: process.env.STORAGE_BUCKET ?? "headless-lms",
      uploadExpirySeconds: Number(process.env.STORAGE_UPLOAD_EXPIRY ?? 300),
      downloadExpirySeconds: Number(process.env.STORAGE_DOWNLOAD_EXPIRY ?? 300),
    },
  };
}

export function loadServerConfig(): ServerConfig {
  const container = loadContainerConfig();
  return {
    port: Number(process.env.PORT ?? 8000),
    host: process.env.HOST ?? "0.0.0.0",
    // BETTER_AUTH_URL is the API's own origin; reuse it so the public URL
    // can never drift from what better-auth is configured with.
    publicUrl: container.authBaseURL,
    clientOrigins: parseClientOrigins(),
    container,
  };
}
```

- [ ] **Step 2: Write the installation entry point**

`apps/api/src/main.ts` (also the wizard's `main.ts` template):

```ts
// Process entry point: env → config → container → server → listen.
import { fileURLToPath } from "node:url";
import { createContainer, buildServer } from "@headless-lms/server";
import { loadServerConfig } from "./config.js";

const config = loadServerConfig();
const container = await createContainer(config, {
  // One folder per integration (directory name = integration id). Compiled
  // to dist/plugins/ by the standard build, so this resolves in dev and prod.
  pluginsDir: fileURLToPath(new URL("./plugins/", import.meta.url)),
});
const app = await buildServer(config, container);

app.listen({ port: config.port, host: config.host }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Rewire apps/api package.json**

Replace `apps/api/package.json`'s `main`, `scripts`, and `dependencies` (devDeps: drop `drizzle-kit`, `@faker-js/faker`, `@types/pg`; keep the rest):

```json
"main": "dist/main.js",
"scripts": {
  "dev": "tsx watch --env-file=../../.env src/main.ts",
  "build": "tsdown",
  "start": "node --env-file=../../.env dist/main.js",
  "gen:openapi": "tsx --env-file=../../.env scripts/gen-openapi.ts",
  "test": "vitest run",
  "lint": "eslint src",
  "typecheck": "tsc -p tsconfig.json --noEmit"
},
"dependencies": {
  "@headless-lms/plugin-slack": "workspace:*",
  "@headless-lms/server": "workspace:*",
  "@headless-lms/types": "workspace:*",
  "@headless-lms/utils": "workspace:*",
  "zod": "4.4.3"
}
```

(`seed`/`db:migrate` return in Task 4 as CLI delegations. `src/plugins/` stays exactly where it is — slack re-export, stripe, and its `integrations.test.ts`.)

- [ ] **Step 4: Fix gen-openapi**

`apps/api/scripts/gen-openapi.ts` — swap the imports and construct explicitly (paths from `apps/api/scripts/` to repo root are unchanged):

```ts
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createContainer, buildServer } from "@headless-lms/server";
import { loadServerConfig } from "../src/config.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const outPath = join(repoRoot, "packages", "sdk", "openapi.json");

const config = loadServerConfig();
const app = await buildServer(config, await createContainer(config));
await app.ready();
const document = app.swagger();
writeFileSync(outPath, `${JSON.stringify(document, null, 2)}\n`);
await app.close();
console.log(`Wrote ${outPath}`);
```

- [ ] **Step 5: Point the plugins test at the local dir**

`apps/api/src/plugins/integrations.test.ts`: change its `loadIntegrations` import to `@headless-lms/server`, and every call that relied on the old default directory now passes this dir explicitly:

```ts
import { fileURLToPath } from "node:url";
import { loadIntegrations } from "@headless-lms/server";

const pluginsDir = fileURLToPath(new URL("./", import.meta.url));
// e.g.: const registry = await loadIntegrations(pluginsDir);
```

Assertions (slack + stripe load, ids match folders) stay as they are.

- [ ] **Step 6: Repoint ESLint boundaries and root scripts**

`.eslintrc.cjs` — three mechanical substitutions:
1. In `boundaries/include`: `["apps/api/src/**/*"]` → `["packages/server/src/**/*", "apps/api/src/**/*"]`
2. In every `boundaries/elements` pattern except `plugins`: replace prefix `apps/api/src/` with `packages/server/src/` (core, reporting, adapters, composition, http, cli, workers, cron). The `plugins` element keeps `apps/api/src/plugins/*`.
3. In `settings["import/resolver"].typescript.project`: add `"packages/server/tsconfig.json"`.

Root `package.json` scripts:

```json
"db:generate": "pnpm --filter @headless-lms/server db:generate",
"db:migrate": "pnpm --filter @headless-lms/server db:migrate",
```

- [ ] **Step 7: Full repo verification**

Run: `pnpm install && pnpm build && pnpm test && pnpm typecheck && pnpm lint`
Expected: all green.

Run (needs docker db up: `docker compose -f docker/docker-compose.yml up -d`): `pnpm --filter @headless-lms/api dev`
Expected: Fastify boots, logs listening on 8000. Then `curl -s localhost:8000/docs/json | head -c 200` returns OpenAPI JSON. Ctrl-C.

Run: `pnpm gen:sdk`
Expected: regenerates `packages/sdk/openapi.json` + generated client with no diff beyond timestamps (commit any legitimate diff).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(api): apps/api becomes the thin reference installation"
```

---

### Task 4: The `headless-lms` CLI (migrate + seed)

**Files:**
- Create: `packages/server/src/cli/index.ts`, `packages/server/src/cli/migrate.ts`
- Move: `apps/api/scripts/seed.ts` → `packages/server/src/cli/seed.ts`
- Modify: `packages/server/src/cli/seed.ts` imports, `apps/api/package.json`, root `package.json` (no change needed — verify), `packages/server/package.json` (bin already declared in Task 1)
- Test: `packages/server/src/cli/migrate.test.ts`

**Interfaces:**
- Consumes: `packages/server/drizzle/` migrations folder (Task 2), `createDb`/schema internals.
- Produces: bin `headless-lms` with subcommands `migrate` and `seed`, resolvable in any workspace package that depends on `@headless-lms/server` (and in scaffolded installations via node_modules/.bin).

- [ ] **Step 1: Write the failing migrate test**

`packages/server/src/cli/migrate.test.ts` — tests the pure bits: the migrations folder resolves and the missing-URL error is clear (no DB needed):

```ts
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { migrationsFolder, runMigrations } from "./migrate.js";

describe("cli migrate", () => {
  it("resolves the packaged migrations folder", () => {
    expect(existsSync(migrationsFolder())).toBe(true);
  });

  it("fails with a clear message when DATABASE_URL is missing", async () => {
    await expect(runMigrations("")).rejects.toThrow(/DATABASE_URL/);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm --filter @headless-lms/server vitest run src/cli/migrate.test.ts`
Expected: FAIL — `Cannot find module './migrate.js'`

- [ ] **Step 3: Implement migrate**

`packages/server/src/cli/migrate.ts`:

```ts
// Runs the drizzle migrations shipped inside this package against the
// installation's database. Fails loudly and legibly — this is the first
// command every new installation runs.
import { fileURLToPath } from "node:url";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

/** drizzle/ sits at the package root: ../../drizzle from src/cli AND dist/cli. */
export function migrationsFolder(): string {
  return fileURLToPath(new URL("../../drizzle/", import.meta.url));
}

export async function runMigrations(databaseUrl: string): Promise<void> {
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not set. Put it in your .env (e.g. postgres://postgres:postgres@localhost:8005/headless_lms) and re-run.",
    );
  }
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: migrationsFolder() });
  } catch (err) {
    throw new Error(
      `Migration failed against ${databaseUrl.replace(/\/\/.*@/, "//***@")}: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  } finally {
    await pool.end();
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @headless-lms/server vitest run src/cli/migrate.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Move seed into the CLI**

```bash
git mv apps/api/scripts/seed.ts packages/server/src/cli/seed.ts
```

Edit `packages/server/src/cli/seed.ts`:
1. Imports change from script-relative to package-relative:
   - `from "../src/adapters/db/index.js"` → `from "../adapters/db/index.js"`
   - `from "../src/core/shared/id.js"` → `from "../core/shared/id.js"`
2. Replace the module-level `const db = createDb(process.env.DATABASE_URL ?? "");` and the trailing `main()` invocation with an exported entry (the whole faker graph body stays inside untouched, now parameterized by `db`):

```ts
export async function runSeed(databaseUrl: string): Promise<void> {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set. Put it in your .env and re-run.");
  }
  const db = createDb(databaseUrl);
  await main(db);
}
```

(Change `async function main()` to `async function main(db: ReturnType<typeof createDb>)` and delete any top-level `main()` call / `process.exit` footer the script had — check the file tail when editing.)

- [ ] **Step 6: The bin entry**

`packages/server/src/cli/index.ts`:

```ts
#!/usr/bin/env node
// The installation CLI: `headless-lms <command>`.
// Loads ./.env from the cwd if present (Node 22 native), so installations
// don't need --env-file gymnastics.
import { runMigrations } from "./migrate.js";
import { runSeed } from "./seed.js";

try {
  process.loadEnvFile();
} catch {
  // no .env in cwd — fine, env may come from the environment itself
}

const command = process.argv[2];

switch (command) {
  case "migrate":
    await runMigrations(process.env.DATABASE_URL ?? "");
    console.log("Migrations applied.");
    break;
  case "seed":
    await runSeed(process.env.DATABASE_URL ?? "");
    console.log("Seed complete.");
    break;
  default:
    console.error(`Usage: headless-lms <migrate|seed>\nUnknown command: ${command ?? "(none)"}`);
    process.exit(1);
}
```

- [ ] **Step 7: Delegate the api scripts**

In `apps/api/package.json` scripts, add:

```json
"seed": "headless-lms seed",
"db:migrate": "headless-lms migrate"
```

(pnpm resolves the bin from the workspace dependency. Root `db:migrate` already points at the server package's drizzle-kit script from Task 3 — both paths work; installations use the CLI.)

- [ ] **Step 8: End-to-end verify against docker Postgres**

```bash
docker compose -f docker/docker-compose.yml up -d
pnpm --filter @headless-lms/server build
cd apps/api && node --env-file=../../.env ../../packages/server/dist/cli/index.js migrate && cd ../..
pnpm --filter @headless-lms/api seed
```

Expected: "Migrations applied." then "Seed complete." — plus `pnpm --filter @headless-lms/server test` still green.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(server): headless-lms CLI with migrate and seed"
```

---

### Task 5: Scaffold `packages/create-headless-lms` + templates

**Files:**
- Create: `packages/create-headless-lms/package.json`, `tsconfig.json`, `tsdown.config.ts`, `vitest.config.ts`
- Create: `packages/create-headless-lms/templates/` (all files below)

**Interfaces:**
- Produces: the template set Task 6's `scaffold()` renders. Placeholder syntax is `{{KEY}}`; keys: `NAME`, `PORT`, `CLIENT_ORIGINS`, `DATABASE_URL`, `BETTER_AUTH_SECRET`, `CREDENTIAL_STORE_KEY`, plus the storage block keys `STORAGE_ENV` (pre-rendered block) — see `.env.tmpl`.

- [ ] **Step 1: Package skeleton**

`packages/create-headless-lms/package.json`:

```json
{
  "name": "create-headless-lms",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "bin": { "create-headless-lms": "./dist/index.js" },
  "files": ["dist", "templates"],
  "scripts": {
    "build": "tsdown",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@clack/prompts": "^0.11.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "tsdown": "^0.22.9",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

`tsconfig.json` — same as `packages/server/tsconfig.json` (NodeNext variant, `include: ["src/**/*.ts"]`). `tsdown.config.ts`:

```ts
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  fixedExtension: false,
  target: "node22",
  platform: "node",
  dts: false,
  sourcemap: true,
  clean: true,
});
```

`vitest.config.ts`: identical to `packages/server/vitest.config.ts`.

- [ ] **Step 2: Templates — project files**

`templates/package.json.tmpl` (real semver range so publishing changes nothing but availability):

```json
{
  "name": "{{NAME}}",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "dist/main.js",
  "scripts": {
    "dev": "tsx watch --env-file=.env src/main.ts",
    "build": "tsdown",
    "start": "node --env-file=.env dist/main.js",
    "migrate": "headless-lms migrate",
    "seed": "headless-lms seed",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@headless-lms/server": "^0.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "tsdown": "^0.22.9",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2"
  }
}
```

`templates/src/main.ts` and `templates/src/config.ts`: byte-for-byte copies of `apps/api/src/main.ts` and `apps/api/src/config.ts` from Task 3 (no placeholders needed — everything is env-driven).

`templates/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

`templates/tsdown.config.ts`: copy of `apps/api/tsdown.config.ts` (unbundle, `entry: ["src/**/*.ts", "!src/**/*.test.ts"]`).

`templates/gitignore` (renamed to `.gitignore` on scaffold — npm strips dotfiles from packages):

```
node_modules/
dist/
.env
```

`templates/src/plugins/README.md`:

```markdown
# plugins/

One folder per integration; the **directory name is the integration id**. Each
folder's `index.ts` default-exports an object satisfying the `Integration`
contract from `@headless-lms/types`. Loaded once at startup — a malformed
plugin fails the boot, not a request.

Two ways to add one:

1. **Published integration** — install it and re-export:
   `pnpm add @headless-lms/plugin-slack`, then `plugins/slack/index.ts`:
   `export { default } from "@headless-lms/plugin-slack";`
2. **Custom integration** — write the folder directly, depending only on
   `@headless-lms/types` (+ `@headless-lms/utils` for the zod helpers).
```

`templates/README.md`:

```markdown
# {{NAME}}

A Headless LMS installation.

## Run

    docker compose up -d      # if you chose the bundled Postgres/MinIO
    pnpm install
    pnpm migrate
    pnpm dev                  # API on http://localhost:{{PORT}}, docs at /docs

## Layout

- `src/main.ts` — entry point: config → container → server
- `src/config.ts` — reads .env into the ServerConfig
- `src/plugins/` — integrations (see its README)
- `.env` — secrets and runtime config (never commit)
```

- [ ] **Step 3: Templates — env + compose**

`templates/env.tmpl` (written as both `.env` filled and `.env.example` blanked; `{{STORAGE_ENV}}` is a pre-rendered block, see Task 6):

```
PORT={{PORT}}
BETTER_AUTH_URL=http://localhost:{{PORT}}
CLIENT_ORIGIN={{CLIENT_ORIGINS}}

DATABASE_URL={{DATABASE_URL}}

BETTER_AUTH_SECRET={{BETTER_AUTH_SECRET}}
CREDENTIAL_STORE_KEY={{CREDENTIAL_STORE_KEY}}
{{STORAGE_ENV}}
```

`templates/docker-compose.yml.tmpl` — mirrors `docker/docker-compose.yml` defaults (Postgres on 8005, MinIO on 8006/8007); `{{COMPOSE_SERVICES}}` is assembled from these two blocks by `scaffold()`:

```yaml
name: {{NAME}}
services:
{{COMPOSE_SERVICES}}
```

Postgres block (indent two spaces when composing):

```yaml
  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: {{DB_NAME}}
    ports:
      - "8005:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
```

MinIO block:

```yaml
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "8006:9000"
      - "8007:9001"
    volumes:
      - miniodata:/data
```

Volumes footer: `volumes:` + `pgdata:`/`miniodata:` for whichever services were included.

- [ ] **Step 4: Build check + commit**

Run: `pnpm install && pnpm --filter create-headless-lms build`
Expected: emits `dist/` (index.ts doesn't exist yet — create `src/index.ts` with `export {};` placeholder so the build passes; Task 7 replaces it).

```bash
git add packages/create-headless-lms pnpm-lock.yaml
git commit -m "feat(create): scaffold create-headless-lms package with templates"
```

---

### Task 6: `scaffold()` — answers to files (TDD)

**Files:**
- Create: `packages/create-headless-lms/src/scaffold.ts`, `src/answers.ts`
- Test: `packages/create-headless-lms/src/scaffold.test.ts`

**Interfaces:**
- Consumes: Task 5's templates.
- Produces (used by Task 7 and the E2E in Task 8):
  - `type Answers = { name: string; db: { mode: "docker" } | { mode: "url"; url: string }; storage: { mode: "minio" } | { mode: "s3"; endPoint: string; port: number; useSSL: boolean; accessKey: string; secretKey: string; region: string; bucket: string } | { mode: "skip" }; port: number; clientOrigins: string; }`
  - `defaultAnswers(name: string): Answers`
  - `scaffold(answers: Answers, targetDir: string): Promise<string[]>` — returns written paths, throws if `targetDir` exists non-empty, removes a partially-written dir on failure

- [ ] **Step 1: Write the failing tests**

`packages/create-headless-lms/src/scaffold.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scaffold } from "./scaffold.js";
import { defaultAnswers } from "./answers.js";

let dirs: string[] = [];
async function scratch(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), "chl-test-"));
  dirs.push(d);
  return d;
}
afterEach(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  dirs = [];
});

describe("scaffold", () => {
  it("writes the full installation with defaults", async () => {
    const target = join(await scratch(), "my-lms");
    await scaffold(defaultAnswers("my-lms"), target);
    for (const f of [
      "package.json",
      "tsconfig.json",
      "tsdown.config.ts",
      ".gitignore",
      ".env",
      ".env.example",
      "docker-compose.yml",
      "README.md",
      "src/main.ts",
      "src/config.ts",
      "src/plugins/README.md",
    ]) {
      expect(existsSync(join(target, f)), f).toBe(true);
    }
  });

  it("generates real secrets in .env and blanks them in .env.example", async () => {
    const target = join(await scratch(), "my-lms");
    await scaffold(defaultAnswers("my-lms"), target);
    const env = await readFile(join(target, ".env"), "utf8");
    const example = await readFile(join(target, ".env.example"), "utf8");
    const secret = env.match(/^BETTER_AUTH_SECRET=(.+)$/m)?.[1] ?? "";
    const storeKey = env.match(/^CREDENTIAL_STORE_KEY=(.+)$/m)?.[1] ?? "";
    // 32 random bytes, base64 → 44 chars ending in "="
    expect(secret).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(storeKey).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(secret).not.toBe(storeKey);
    expect(example).toMatch(/^BETTER_AUTH_SECRET=$/m);
    expect(example).toMatch(/^CREDENTIAL_STORE_KEY=$/m);
  });

  it("docker db answer produces matching DATABASE_URL and compose service", async () => {
    const target = join(await scratch(), "my-lms");
    await scaffold(defaultAnswers("my-lms"), target);
    const env = await readFile(join(target, ".env"), "utf8");
    expect(env).toContain("DATABASE_URL=postgres://postgres:postgres@localhost:8005/my_lms");
    const compose = await readFile(join(target, "docker-compose.yml"), "utf8");
    expect(compose).toContain("postgres:17");
    expect(compose).toContain("minio/minio");
  });

  it("url db + skip storage: no compose file, no STORAGE_ vars", async () => {
    const target = join(await scratch(), "my-lms");
    const answers = {
      ...defaultAnswers("my-lms"),
      db: { mode: "url" as const, url: "postgres://u:p@db.example.com:5432/lms" },
      storage: { mode: "skip" as const },
    };
    await scaffold(answers, target);
    expect(existsSync(join(target, "docker-compose.yml"))).toBe(false);
    const env = await readFile(join(target, ".env"), "utf8");
    expect(env).toContain("DATABASE_URL=postgres://u:p@db.example.com:5432/lms");
    expect(env).not.toContain("STORAGE_ENDPOINT");
  });

  it("refuses a non-empty target directory", async () => {
    const target = join(await scratch(), "occupied");
    await mkdir(target, { recursive: true });
    await writeFile(join(target, "keep.txt"), "x");
    await expect(scaffold(defaultAnswers("occupied"), target)).rejects.toThrow(/not empty/);
    expect(existsSync(join(target, "keep.txt"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter create-headless-lms vitest run src/scaffold.test.ts`
Expected: FAIL — `Cannot find module './scaffold.js'`

- [ ] **Step 3: Implement answers.ts**

`packages/create-headless-lms/src/answers.ts`:

```ts
export type DbAnswer = { mode: "docker" } | { mode: "url"; url: string };
export type StorageAnswer =
  | { mode: "minio" }
  | {
      mode: "s3";
      endPoint: string;
      port: number;
      useSSL: boolean;
      accessKey: string;
      secretKey: string;
      region: string;
      bucket: string;
    }
  | { mode: "skip" };

export interface Answers {
  name: string;
  db: DbAnswer;
  storage: StorageAnswer;
  port: number;
  clientOrigins: string;
}

export function defaultAnswers(name: string): Answers {
  return {
    name,
    db: { mode: "docker" },
    storage: { mode: "minio" },
    port: 8000,
    clientOrigins: "http://localhost:8001,http://localhost:8002",
  };
}

/** my-lms → my_lms: the docker Postgres database name. */
export function dbName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase();
}
```

- [ ] **Step 4: Implement scaffold.ts**

`packages/create-headless-lms/src/scaffold.ts`:

```ts
// Renders the bundled templates into a new installation directory.
// Pure with respect to prompts: everything variable comes in via Answers.
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { type Answers, dbName } from "./answers.js";

/** templates/ sits at the package root: ../templates from src/ AND dist/. */
const TEMPLATES = fileURLToPath(new URL("../templates/", import.meta.url));

function render(content: string, vars: Record<string, string>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = vars[key];
    if (v === undefined) throw new Error(`template variable {{${key}}} has no value`);
    return v;
  });
}

const POSTGRES_SERVICE = `  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: {{DB_NAME}}
    ports:
      - "8005:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data`;

const MINIO_SERVICE = `  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "8006:9000"
      - "8007:9001"
    volumes:
      - miniodata:/data`;

const MINIO_ENV = `
STORAGE_ENDPOINT=localhost
STORAGE_PORT=8006
STORAGE_USE_SSL=false
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin
STORAGE_REGION=us-east-1
STORAGE_BUCKET={{DB_NAME}}
`;

function s3Env(s: Extract<Answers["storage"], { mode: "s3" }>): string {
  return `
STORAGE_ENDPOINT=${s.endPoint}
STORAGE_PORT=${s.port}
STORAGE_USE_SSL=${s.useSSL}
STORAGE_ACCESS_KEY=${s.accessKey}
STORAGE_SECRET_KEY=${s.secretKey}
STORAGE_REGION=${s.region}
STORAGE_BUCKET=${s.bucket}
`;
}

export async function scaffold(answers: Answers, targetDir: string): Promise<string[]> {
  try {
    const existing = await readdir(targetDir);
    if (existing.length > 0) throw new Error(`target directory ${targetDir} is not empty`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  const written: string[] = [];
  try {
    const name = dbName(answers.name);
    const databaseUrl =
      answers.db.mode === "docker"
        ? `postgres://postgres:postgres@localhost:8005/${name}`
        : answers.db.url;
    const storageEnv =
      answers.storage.mode === "minio"
        ? render(MINIO_ENV, { DB_NAME: name })
        : answers.storage.mode === "s3"
          ? s3Env(answers.storage)
          : "";

    const vars: Record<string, string> = {
      NAME: answers.name,
      DB_NAME: name,
      PORT: String(answers.port),
      CLIENT_ORIGINS: answers.clientOrigins,
      DATABASE_URL: databaseUrl,
      BETTER_AUTH_SECRET: randomBytes(32).toString("base64"),
      CREDENTIAL_STORE_KEY: randomBytes(32).toString("base64"),
      STORAGE_ENV: storageEnv,
    };

    await mkdir(join(targetDir, "src", "plugins"), { recursive: true });

    const write = async (rel: string, content: string) => {
      await writeFile(join(targetDir, rel), content);
      written.push(rel);
    };
    const fromTemplate = async (tmpl: string, rel: string, extra?: Record<string, string>) =>
      write(rel, render(await readFile(join(TEMPLATES, tmpl), "utf8"), { ...vars, ...extra }));

    await fromTemplate("package.json.tmpl", "package.json");
    await fromTemplate("README.md", "README.md");
    await fromTemplate("env.tmpl", ".env");
    await fromTemplate("env.tmpl", ".env.example", {
      BETTER_AUTH_SECRET: "",
      CREDENTIAL_STORE_KEY: "",
      DATABASE_URL: answers.db.mode === "docker" ? databaseUrl : "",
    });
    await cp(join(TEMPLATES, "tsconfig.json"), join(targetDir, "tsconfig.json"));
    await cp(join(TEMPLATES, "tsdown.config.ts"), join(targetDir, "tsdown.config.ts"));
    await cp(join(TEMPLATES, "gitignore"), join(targetDir, ".gitignore"));
    await cp(join(TEMPLATES, "src/main.ts"), join(targetDir, "src/main.ts"));
    await cp(join(TEMPLATES, "src/config.ts"), join(targetDir, "src/config.ts"));
    await cp(join(TEMPLATES, "src/plugins/README.md"), join(targetDir, "src/plugins/README.md"));
    written.push("tsconfig.json", "tsdown.config.ts", ".gitignore", "src/main.ts", "src/config.ts", "src/plugins/README.md");

    const services: string[] = [];
    const volumes: string[] = [];
    if (answers.db.mode === "docker") {
      services.push(render(POSTGRES_SERVICE, { DB_NAME: name }));
      volumes.push("  pgdata:");
    }
    if (answers.storage.mode === "minio") {
      services.push(MINIO_SERVICE);
      volumes.push("  miniodata:");
    }
    if (services.length > 0) {
      const compose = `name: ${answers.name}\nservices:\n${services.join("\n")}\nvolumes:\n${volumes.join("\n")}\n`;
      await write("docker-compose.yml", compose);
    }

    return written;
  } catch (err) {
    // Leave no half-written project behind.
    await rm(targetDir, { recursive: true, force: true });
    throw err;
  }
}
```

Note the non-empty-dir guard sits **before** the try/catch cleanup — a pre-existing non-empty dir must never be deleted (the test's `keep.txt` assertion catches this).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter create-headless-lms vitest run src/scaffold.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/create-headless-lms/src
git commit -m "feat(create): scaffold() renders installations from templates"
```

---

### Task 7: The wizard entry (prompts + --yes)

**Files:**
- Create: `packages/create-headless-lms/src/index.ts` (replaces the placeholder), `src/args.ts`
- Test: `packages/create-headless-lms/src/args.test.ts`

**Interfaces:**
- Consumes: `scaffold`, `defaultAnswers`, `Answers` (Task 6).
- Produces: bin `create-headless-lms [name] [--yes]`.

- [ ] **Step 1: Failing test for arg parsing + name validation**

`packages/create-headless-lms/src/args.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseArgs, validateName } from "./args.js";

describe("parseArgs", () => {
  it("extracts name and --yes", () => {
    expect(parseArgs(["my-lms", "--yes"])).toEqual({ name: "my-lms", yes: true });
    expect(parseArgs([])).toEqual({ name: undefined, yes: false });
  });
});

describe("validateName", () => {
  it("accepts npm-safe names", () => {
    expect(validateName("my-lms")).toBeUndefined();
  });
  it("rejects invalid names with a reason", () => {
    expect(validateName("My LMS!")).toMatch(/lowercase/);
    expect(validateName("")).toMatch(/required/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter create-headless-lms vitest run src/args.test.ts`
Expected: FAIL — `Cannot find module './args.js'`

- [ ] **Step 3: Implement args.ts**

```ts
export interface CliArgs {
  name: string | undefined;
  yes: boolean;
}

export function parseArgs(argv: string[]): CliArgs {
  const yes = argv.includes("--yes") || argv.includes("-y");
  const name = argv.find((a) => !a.startsWith("-"));
  return { name, yes };
}

/** Returns an error message, or undefined when valid (npm package name rules, the subset we need). */
export function validateName(name: string): string | undefined {
  if (!name) return "project name is required";
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(name))
    return "use lowercase letters, digits, ., _ and - (must start with a letter or digit)";
  if (name.length > 214) return "name too long (npm limit is 214)";
  return undefined;
}
```

- [ ] **Step 4: Verify pass**

Run: `pnpm --filter create-headless-lms vitest run src/args.test.ts`
Expected: PASS

- [ ] **Step 5: The wizard itself**

`packages/create-headless-lms/src/index.ts`:

```ts
#!/usr/bin/env node
// npm create headless-lms → this. Walks the prompts (or --yes for defaults),
// scaffolds the installation, then offers install + migrate.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import * as p from "@clack/prompts";
import { parseArgs, validateName } from "./args.js";
import { defaultAnswers, type Answers, type StorageAnswer } from "./answers.js";
import { scaffold } from "./scaffold.js";

const args = parseArgs(process.argv.slice(2));

function bail(message = "Cancelled."): never {
  p.cancel(message);
  process.exit(1);
}
/** Unwrap a clack result, exiting cleanly on ctrl-c. */
function got<T>(value: T | symbol): T {
  if (p.isCancel(value)) bail();
  return value as T;
}

p.intro("create-headless-lms");

let name = args.name;
if (!name) {
  if (args.yes) bail("--yes needs a project name: create-headless-lms <name> --yes");
  name = got(
    await p.text({
      message: "Project name",
      placeholder: "my-lms",
      validate: (v) => validateName(v ?? ""),
    }),
  );
}
const nameError = validateName(name);
if (nameError) bail(nameError);

let answers: Answers = defaultAnswers(name);

if (!args.yes) {
  const dbMode = got(
    await p.select({
      message: "Database",
      options: [
        { value: "docker", label: "Postgres via docker-compose (recommended)" },
        { value: "url", label: "I have a connection string" },
      ],
    }),
  );
  const db =
    dbMode === "url"
      ? { mode: "url" as const, url: got(await p.text({ message: "DATABASE_URL", placeholder: "postgres://user:pass@host:5432/db" })) }
      : { mode: "docker" as const };

  const storageMode = got(
    await p.select({
      message: "File storage",
      options: [
        { value: "minio", label: "Bundled MinIO via docker-compose (recommended)" },
        { value: "s3", label: "Existing S3-compatible storage" },
        { value: "skip", label: "Skip for now" },
      ],
    }),
  );
  let storage: StorageAnswer = { mode: "minio" };
  if (storageMode === "skip") storage = { mode: "skip" };
  if (storageMode === "s3") {
    storage = {
      mode: "s3",
      endPoint: got(await p.text({ message: "Endpoint host", placeholder: "s3.amazonaws.com" })),
      port: Number(got(await p.text({ message: "Port", initialValue: "443" }))),
      useSSL: got(await p.confirm({ message: "Use SSL?", initialValue: true })),
      accessKey: got(await p.text({ message: "Access key" })),
      secretKey: got(await p.text({ message: "Secret key" })),
      region: got(await p.text({ message: "Region", initialValue: "us-east-1" })),
      bucket: got(await p.text({ message: "Bucket", initialValue: name })),
    };
  }

  const port = Number(got(await p.text({ message: "API port", initialValue: "8000" })));
  const clientOrigins = got(
    await p.text({
      message: "Client origins (comma-separated, for CORS + auth)",
      initialValue: "http://localhost:8001,http://localhost:8002",
    }),
  );

  answers = { name, db, storage, port, clientOrigins };
}

const targetDir = resolve(process.cwd(), name);
const s = p.spinner();
s.start(`Scaffolding ${name}`);
try {
  await scaffold(answers, targetDir);
  s.stop(`Created ${name}/`);
} catch (err) {
  s.stop("Scaffold failed");
  bail(err instanceof Error ? err.message : String(err));
}

const run = (cmd: string, argv: string[]) =>
  spawnSync(cmd, argv, { cwd: targetDir, stdio: "inherit" });

if (!args.yes && got(await p.confirm({ message: "Run pnpm install now?", initialValue: true }))) {
  run("pnpm", ["install"]);
  if (got(await p.confirm({ message: "Run migrations now? (database must be reachable)", initialValue: false }))) {
    run("pnpm", ["migrate"]);
  }
}

p.note(
  [
    `cd ${name}`,
    ...(answers.db.mode === "docker" || answers.storage.mode === "minio" ? ["docker compose up -d"] : []),
    "pnpm install        # if you skipped it",
    "pnpm migrate",
    "pnpm dev",
  ].join("\n"),
  "Next steps",
);
p.outro(`API will listen on http://localhost:${answers.port} — docs at /docs`);
```

- [ ] **Step 6: Full package check + manual smoke**

Run: `pnpm --filter create-headless-lms build && pnpm --filter create-headless-lms test && pnpm --filter create-headless-lms typecheck`
Expected: green.

Manual smoke (from the scratchpad, NOT inside the repo):
Run: `cd $(mktemp -d) && node <worktree>/packages/create-headless-lms/dist/index.js smoke-lms --yes && ls -la smoke-lms`
Expected: full file set scaffolded, `.env` has two distinct 44-char secrets. Delete the scratch dir after.

- [ ] **Step 7: Commit**

```bash
git add packages/create-headless-lms
git commit -m "feat(create): interactive wizard with --yes escape hatch"
```

---

### Task 8: E2E — scaffolded installation actually runs

**Files:**
- Create: `packages/create-headless-lms/scripts/e2e.sh`

**Interfaces:**
- Consumes: everything. This is the spec's end-to-end proof: pack the server, scaffold, install against the tarball, migrate, boot, hit the API.

- [ ] **Step 1: Write the E2E script**

`packages/create-headless-lms/scripts/e2e.sh`:

```bash
#!/usr/bin/env bash
# E2E: prove a scaffolded installation runs against a packed @headless-lms/server.
# Prereq: docker compose -f <repo>/docker/docker-compose.yml up -d  (Postgres on 8005)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "==> packing @headless-lms/server"
pnpm --filter @headless-lms/server build
TARBALL="$(cd "$ROOT/packages/server" && pnpm pack --pack-destination "$WORK" | tail -1)"

echo "==> scaffolding into $WORK"
pnpm --filter create-headless-lms build
(cd "$WORK" && node "$ROOT/packages/create-headless-lms/dist/index.js" e2e-lms --yes)

echo "==> installing with the packed server"
(cd "$WORK/e2e-lms" && npm pkg set "dependencies.@headless-lms/server=file:$TARBALL" && pnpm install)

echo "==> migrate (docker Postgres on 8005 must be up; scaffold already set db name e2e_lms)"
docker compose -f "$ROOT/docker/docker-compose.yml" exec -T postgres \
  psql -U postgres -c 'CREATE DATABASE e2e_lms' 2>/dev/null || true
(cd "$WORK/e2e-lms" && pnpm migrate)

echo "==> boot + probe"
(cd "$WORK/e2e-lms" && pnpm build && (pnpm start & echo $! > server.pid) && sleep 3 && \
  curl -sf http://localhost:8000/docs/json > /dev/null && echo "API is up" ; \
  kill "$(cat server.pid)" 2>/dev/null || true)

echo "E2E OK"
```

`chmod +x packages/create-headless-lms/scripts/e2e.sh`

- [ ] **Step 2: Run it**

Run: `docker compose -f docker/docker-compose.yml up -d && bash packages/create-headless-lms/scripts/e2e.sh`
Expected: ends with `API is up` and `E2E OK`. If `curl` fails, check the booted server's log output above it — the usual suspects are DATABASE_URL (db name mismatch) and port 8000 already in use (stop the dev api first).

- [ ] **Step 3: Final full-repo verification**

Run: `pnpm build && pnpm test && pnpm typecheck && pnpm lint && pnpm gen:sdk && git status --short`
Expected: all green; `git status` shows only intentional changes (commit any regenerated SDK output).

- [ ] **Step 4: Commit**

```bash
git add packages/create-headless-lms/scripts
git commit -m "test(create): E2E — scaffold, install packed server, migrate, boot"
```
