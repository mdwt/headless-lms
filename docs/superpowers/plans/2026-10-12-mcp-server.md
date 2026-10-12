# MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let ChatGPT, Claude and other MCP clients manage one organization of the LMS through a stateless `/mcp` endpoint on the existing API. Better Auth is the OAuth 2.1 authorization server. Every tool is one call to an existing core service method and needs one fine-grained scope.

**Architecture:** Better Auth 1.7.7 gains `jwt()`, `mcp()`, `cimd()` and `apiKey()`. It issues org-bound JWT access tokens (audience `<api>/mcp`) carrying the scopes the person ticked on the consent page. API keys carry the same scopes as Better Auth key permissions. The Fastify server verifies the credential and resolves the same `OrgScope` REST uses. It then builds a per-request MCP server holding only the tools whose scope was granted and whose role permission the person still holds. A tool is data plus one service call. The shared runner does input parsing, not-found and error mapping for every tool alike. The admin app supplies the login, org picker, consent (with a scope picker), connected-apps and API-key pages.

**Tech Stack:** Fastify 5.9, Better Auth 1.7.7 (`@better-auth/mcp`, `@better-auth/cimd`, `@better-auth/oauth-provider`, `@better-auth/api-key`), `@modelcontextprotocol/server` 2.3.1 + `@modelcontextprotocol/node` 2.1.1, zod 4, Drizzle/Postgres, Next.js admin, vitest.

**Spec:** https://claude.ai/code/artifact/858d7c65-3fc8-476c-a169-ad82f2cbbc6a (Headless LMS — MCP server design). The spec's Requirements section is binding: one scope per tool, tools have no functionality, the minimum tool set, delete off by default, never more than the role, activity content is never written.

## Global Constraints

- No code comments (AGENTS.md). Existing comments stay as they are, except one that a change makes false, which is corrected in as few words as possible.
- No `Co-Authored-By`, "Generated with", or any other AI attribution in commits.
- `@headless-lms/core` depends only on `zod` and `ksuid`. Core never imports Better Auth or the MCP SDK.
- A context imports another context only through its `index.ts`. `organizations` imports `identity`, so `identity` never imports `organizations`. Run `pnpm lint` after changing imports across layers.
- Server stays `app/` + `http/` only. MCP code lives under `packages/server/src/http/mcp/`.
- **A tool contains no logic.** Its `call` is one call to one existing core service method. It passes `scope.orgId` and the parsed input, and takes the inviter or comment actor from the scope. The one literal is `role: 'student'` in `invite_student`. No branching, no second call, no mapping, no validation, no new service method. Input schemas are existing schemas from `packages/server/src/http/schemas`, extended only with existing path-param schemas.
- **Scopes:** the 21 in `ACCESS_SCOPES` (`packages/core/src/organizations/access-scopes.ts`), plus `offline_access` on the authorization server only. `lms:read` and `lms:write` do not exist.
- **Delete scopes** (`*:delete`) are never preselected, and a connection without one does not see its tools.
- **Role ceiling:** a tool is usable only if `roleHoldsScope(scope.role, tool.scope)`. `'assigned'` capabilities count as not held.
- Better Auth version `1.7.7` everywhere it is listed (`adapters/auth`, `packages/server`, `apps/admin`, `apps/student`). The `@better-auth/*` plugins are at `1.7.7`.
- MCP SDK: `@modelcontextprotocol/server@2.3.1`, `@modelcontextprotocol/node@2.1.1`, handler option `legacy: 'stateless'`.
- Access token TTL 900 seconds. Org claim name `org_id`.
- Endpoints derive from existing config only: resource `${authBaseURL}/mcp`, issuer `${authBaseURL}/api/auth`, login `${adminAppUrl}/login`, consent `${adminAppUrl}/oauth/consent`, org picker `${adminAppUrl}/onboarding/select-organization`. OAuth is on only when the resource is https or loopback.
- Activity content is never written by a tool. Activity data reaches a tool only where an existing read already carries it: workflow run events (`list_automation_runs`, `rerun_automation_run`), the activity title on comment rows, and the activity titles in course analytics. Secrets never pass through tools: no webhook creation or secret reveal/rotate, no integration connect/configure/reconnect/list/invoke, no uploads. Staff management and organization rename/delete are not tools.
- Admin UI follows `apps/admin/AGENTS.md` (read it before any `.tsx`): no `Card`, semantic tokens only, named React imports (`import { useState } from "react"`).
- The worktree uses the isolated database `headless_lms_mcp`, API port 8100 and admin origin 8101. Never touch the main checkout or the `headless_lms` database.
- Tests: run single files with the exact command each task gives, from the repo root. Full checks: `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm --filter admin lint` (the root lint ignores `apps/admin`).

## Review Focus

1. **A connection without a delete scope can see or run a delete tool.** Expected: the tool is not listed, and a call to it does not run. Pinned in Task 5 (`hides delete tools unless their scope was granted`, `does not run a tool outside the list`) and Task 13.
2. **An instructor's connection or API key carries write scopes.** Expected: the instructor still gets only the read tools, and asking for a write scope on an API key is refused with 403. Pinned in Task 1 (`scopesForRole`), Task 5 (`never lists a tool the role cannot hold`), Task 10 (instructor `courses:write` → 403) and Task 13.
3. **`update_course` or `update_download` with only `status` blanks the description and category.** Expected: only `status` changes. Pinned in Task 4 and the `update_course`/`update_download` cases of Tasks 6–7.
4. **One tool's input schema fails JSON Schema conversion**, which breaks `tools/list` for every client. Expected: all 54 list, with dates as `date-time` strings. Pinned in Task 5 (`input-schema.test.ts`), Task 8 (`grant_access`) and Task 9 (registry lists all 54).
5. **A token for another audience or issuer, a revoked consent, or a removed member keeps working.** Expected: 401 on the next call. Pinned in Task 2 (wrong `aud`/`iss`, consent lookup), Task 5 (non-staff → 401) and Task 13 (revoke, wrong audience).

---

## File Structure

```
packages/core/src/organizations/access-scopes.ts   ACCESS_SCOPES, AccessScope, SCOPE_PERMISSION, isAccessScope, isDeleteScope,
                                                    roleHoldsScope, scopesForRole, scopeOptions, assertRoleHoldsScopes
packages/core/src/organizations/index.ts            re-export access-scopes
packages/core/src/identity/access.ts                ORG_CLAIM, ACCESS_TOKEN_TTL_SECONDS
packages/core/src/types/identity.ts                 HeaderBag, AccessGrant, AccessRequest, AccessTokenVerifier, ConnectedApp,
                                                    ApiKeySummary, CreatedApiKey, NewApiKey, AppAccessAdmin

adapters/db/src/schema/better-auth.ts               1.7.7 OAuth, JWKS and API key tables
adapters/db/drizzle/0003_*.sql (+ meta)             migration

adapters/auth/src/better-auth.ts                    plugins; verifyAccess; connected apps; API keys (server-side create with permissions)
adapters/auth/src/access-grant.ts                   pure helpers incl. scopesToPermissions, permissionsToScopes
adapters/auth/src/types.ts                          McpAuthOptions

packages/server/src/app/mcp-endpoints.ts            McpEndpoints, mcpEndpoints()
packages/server/src/app/container.ts                container.mcp; auth gets the mcp options
packages/server/src/http/errors.ts                  classifyError() shared by REST and MCP
packages/server/src/http/scope.ts                   resolveScopeFor()
packages/server/src/http/well-known.ts              protected-resource and authorization-server metadata
packages/server/src/http/web-bridge.ts              Fastify ⇄ web Request/Response on the public origin
packages/server/src/http/plugins/auth.ts            form-urlencoded parser for OAuth posts
packages/server/src/http/schemas/content.ts         UpdateCourse without create defaults
packages/server/src/http/schemas/downloads.ts       UpdateDownload without create defaults
packages/server/src/http/mcp/challenge.ts           unauthorized()
packages/server/src/http/mcp/tool.ts                Tool, defineTool, noInput, runTool, toToolResult, toolError
packages/server/src/http/mcp/input-schema.ts        toolInputSchema()
packages/server/src/http/mcp/server.ts              createToolServer()
packages/server/src/http/mcp/route.ts               registerMcp(): verify, resolve scope, filter tools, serve
packages/server/src/http/mcp/test-support.ts        fakes and helpers for MCP tests
packages/server/src/http/mcp/tools/index.ts         TOOLS (54, spec order)
packages/server/src/http/mcp/tools/courses.ts       10 tools
packages/server/src/http/mcp/tools/catalog.ts       17 tools
packages/server/src/http/mcp/tools/people.ts        12 tools
packages/server/src/http/mcp/tools/automations.ts   10 tools
packages/server/src/http/mcp/tools/comments.ts      5 tools
packages/server/src/http/routes/access.ts           scopes, connected apps, API keys
packages/server/src/http/schemas/access.ts          their schemas

packages/sdk/*                                      regenerated (Access.*)

apps/admin/src/lib/auth/oauth-flow.ts               OAuth flow + scope presentation helpers
apps/admin/src/components/forms/scope-picker.tsx     shared scope picker
apps/admin/src/app/(auth)/oauth/consent/*           consent page with the scope picker
apps/admin/src/app/(auth)/login/*                   OAuth-aware login
apps/admin/src/app/onboarding/select-organization/* OAuth continuation
apps/admin/src/app/(dashboard)/settings/connected-apps/*
apps/admin/src/app/(dashboard)/settings/api-keys/*
```

## Tasks

1. Scope catalogue, Better Auth 1.7.7 with the OAuth, MCP, CIMD and API-key plugins, and the database schema
2. Credential verification and app-access admin in the auth adapter
3. Server plumbing: endpoints, shared error classification, scope resolution, metadata routes, web bridge, form posts
4. Update schemas stop applying create defaults
5. The `/mcp` route, the tool definition and the tool runner
6. Course tools
7. Download, bundle and media tools
8. Student, access and analytics tools
9. Workflow, webhook and comment tools, and the registry check
10. REST routes for scopes, connected apps and API keys; SDK regeneration
11. Admin: OAuth sign-in continuation, org picker and the consent page with the scope picker
12. Admin: connected apps and API keys settings
13. End-to-end verification against the isolated database

---

### Task 1: Scope catalogue, Better Auth 1.7.7 with the OAuth, MCP, CIMD and API-key plugins, and the database schema

**Files:**
- Create: `packages/core/src/organizations/access-scopes.ts`
- Test: `packages/core/src/organizations/access-scopes.test.ts`
- Modify: `packages/core/src/organizations/index.ts`
- Create: `packages/core/src/identity/access.ts`
- Modify: `packages/core/src/identity/index.ts`
- Modify: `packages/core/src/types/identity.ts`
- Modify: `adapters/auth/package.json`, `packages/server/package.json`, `apps/admin/package.json`, `apps/student/package.json`, `pnpm-lock.yaml`
- Modify: `adapters/auth/src/types.ts`
- Create: `adapters/auth/src/access-grant.ts`
- Test: `adapters/auth/src/access-grant.test.ts`
- Modify: `adapters/auth/src/index.ts`
- Modify: `adapters/auth/src/better-auth.ts`
- Test: `adapters/auth/src/schema-parity.test.ts`
- Modify: `adapters/db/src/schema/better-auth.ts`
- Create (generated by drizzle-kit, then one line hand-edited): `adapters/db/drizzle/0003_clever_captain_cross.sql`, `adapters/db/drizzle/meta/0003_snapshot.json`; Modify (generated): `adapters/db/drizzle/meta/_journal.json`
- Create: `packages/server/src/app/mcp-endpoints.ts`
- Test: `packages/server/src/app/mcp-endpoints.test.ts`
- Modify: `packages/server/src/app/container.ts`

**Interfaces:**
- Consumes (existing on `main`): `capability`, `isStaffRole`, `Permission`, `Role` from `packages/core/src/organizations/roles.ts`; `ForbiddenError` from `packages/core/src/shared/errors.ts` (constructor `(message: string)`); `config.authBaseURL`, `config.adminAppUrl` in `buildContainer`.
- Produces from `@headless-lms/core/organizations`: `ACCESS_SCOPES` (the 21 scopes, `as const`), `type AccessScope`, `SCOPE_PERMISSION: Record<AccessScope, Permission | null>`, `type ScopeOption = { scope: AccessScope; allowed: boolean }`, `isAccessScope(value: string): value is AccessScope`, `isDeleteScope(scope: AccessScope): boolean`, `roleHoldsScope(role: Role, scope: AccessScope): boolean`, `scopesForRole(role: Role): AccessScope[]`, `scopeOptions(role: Role): ScopeOption[]`, `assertRoleHoldsScopes(role: Role, scopes: readonly AccessScope[]): void` (throws `ForbiddenError`).
- Produces from `@headless-lms/core/identity`: `ORG_CLAIM = 'org_id'`, `ACCESS_TOKEN_TTL_SECONDS = 900`.
- Produces from `@headless-lms/core/types`: `HeaderBag`, `AccessGrant`, `AccessRequest`, `AccessTokenVerifier`, `ConnectedApp`, `ApiKeySummary` (with `scopes`), `CreatedApiKey`, `NewApiKey`, `AppAccessAdmin` (with `createApiKey(input: NewApiKey)`), exactly as in the contract.
- Produces from `@headless-lms/adapter-auth`: `interface McpAuthOptions { oauthEnabled: boolean; resource: string; loginPage: string; consentPage: string; orgPickerPage: string }`; `CreateAuthOptions.mcp: McpAuthOptions`; `buildAuthOptions(opts: CreateAuthOptions)` (the Better Auth options object, `satisfies BetterAuthOptions`); `createAuth(opts)` = `betterAuth(buildAuthOptions(opts))`; `type Auth`; `needsOrgChoice(activeOrgId: string | null, memberOrgIds: () => Promise<readonly string[]>): Promise<boolean>`.
- Produces from `packages/server/src/app`: `interface McpEndpoints extends McpAuthOptions { issuer: string; resourceMetadataUrl: string }`, `mcpEndpoints(config: { authBaseURL: string; adminAppUrl: string }): McpEndpoints`, `Container.mcp: McpEndpoints`, and the single `BETTER_AUTH_URL` warning when OAuth is off.
- Produces in Postgres: Better Auth 1.7.7 tables `ba_oauth_*` (altered), `ba_jwks` (altered), `ba_oauth_resource`, `ba_oauth_client_resource`, `ba_oauth_client_assertion`, `ba_apikey`.

No test in this task needs Postgres: the auth tests build their schema from the options, and the core and server tests are pure. Only Step 19 (`pnpm db:migrate`) needs the Postgres from `docker/docker-compose.yml` running and the worktree's `.env` `DATABASE_URL` pointing at `headless_lms_mcp`.

- [ ] **Step 1: Write the failing scope-catalogue test**

`packages/core/src/organizations/access-scopes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ForbiddenError } from '../shared/errors.js';
import {
  ACCESS_SCOPES,
  assertRoleHoldsScopes,
  isAccessScope,
  isDeleteScope,
  scopeOptions,
  scopesForRole,
} from './access-scopes.js';

describe('access scopes', () => {
  it('lets owners and admins hold all 21 scopes', () => {
    expect(ACCESS_SCOPES).toHaveLength(21);
    expect(scopesForRole('owner')).toEqual([...ACCESS_SCOPES]);
    expect(scopesForRole('admin')).toEqual([...ACCESS_SCOPES]);
  });

  it('lets an instructor hold only the scopes that need no permission', () => {
    expect(scopesForRole('instructor')).toEqual([
      'courses:read',
      'downloads:read',
      'bundles:read',
      'media:read',
      'automations:read',
      'comments:read',
    ]);
  });

  it('gives a student no scope', () => {
    expect(scopesForRole('student')).toEqual([]);
    expect(scopeOptions('student').some((option) => option.allowed)).toBe(false);
  });

  it('lists every scope with whether the role may grant it', () => {
    const options = scopeOptions('instructor');
    expect(options.map((option) => option.scope)).toEqual([...ACCESS_SCOPES]);
    expect(options.find((option) => option.scope === 'courses:read')?.allowed).toBe(true);
    expect(options.find((option) => option.scope === 'courses:write')?.allowed).toBe(false);
  });

  it('refuses a scope the role cannot grant', () => {
    expect(() => assertRoleHoldsScopes('instructor', ['courses:write'])).toThrow(ForbiddenError);
    expect(() => assertRoleHoldsScopes('instructor', ['courses:read'])).not.toThrow();
  });

  it('marks exactly the four delete scopes', () => {
    expect(ACCESS_SCOPES.filter((scope) => isDeleteScope(scope))).toEqual([
      'courses:delete',
      'downloads:delete',
      'bundles:delete',
      'automations:delete',
    ]);
  });

  it('recognises only catalogue scopes', () => {
    expect(isAccessScope('courses:read')).toBe(true);
    expect(isAccessScope('offline_access')).toBe(false);
    expect(isAccessScope('courses:publish')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @headless-lms/core exec vitest run src/organizations/access-scopes.test.ts`
Expected: FAIL with "Failed to load url ./access-scopes.js".

- [ ] **Step 3: Write the scope catalogue and export it from the organizations context**

`packages/core/src/organizations/access-scopes.ts`:

```ts
import { ForbiddenError } from '../shared/errors.js';
import { capability, isStaffRole, type Permission, type Role } from './roles.js';

export const ACCESS_SCOPES = [
  'courses:read',
  'courses:write',
  'courses:delete',
  'downloads:read',
  'downloads:write',
  'downloads:delete',
  'bundles:read',
  'bundles:write',
  'bundles:delete',
  'media:read',
  'students:read',
  'students:write',
  'students:invite',
  'access:read',
  'access:write',
  'analytics:read',
  'automations:read',
  'automations:write',
  'automations:delete',
  'comments:read',
  'comments:moderate',
] as const;

export type AccessScope = (typeof ACCESS_SCOPES)[number];

export const SCOPE_PERMISSION: Record<AccessScope, Permission | null> = {
  'courses:read': null,
  'courses:write': 'create_course',
  'courses:delete': 'create_course',
  'downloads:read': null,
  'downloads:write': 'create_course',
  'downloads:delete': 'create_course',
  'bundles:read': null,
  'bundles:write': 'create_course',
  'bundles:delete': 'create_course',
  'media:read': null,
  'students:read': 'view_student_progress',
  'students:write': 'manage_users',
  'students:invite': 'manage_users',
  'access:read': 'view_student_progress',
  'access:write': 'manage_users',
  'analytics:read': 'view_student_progress',
  'automations:read': null,
  'automations:write': 'manage_org_settings',
  'automations:delete': 'manage_org_settings',
  'comments:read': null,
  'comments:moderate': 'edit_assigned_course',
};

export type ScopeOption = { scope: AccessScope; allowed: boolean };

export function isAccessScope(value: string): value is AccessScope {
  return (ACCESS_SCOPES as readonly string[]).includes(value);
}

export function isDeleteScope(scope: AccessScope): boolean {
  return scope.endsWith(':delete');
}

export function roleHoldsScope(role: Role, scope: AccessScope): boolean {
  if (!isStaffRole(role)) {
    return false;
  }
  const permission = SCOPE_PERMISSION[scope];
  return permission === null || capability(role, permission) === true;
}

export function scopesForRole(role: Role): AccessScope[] {
  return ACCESS_SCOPES.filter((scope) => roleHoldsScope(role, scope));
}

export function scopeOptions(role: Role): ScopeOption[] {
  return ACCESS_SCOPES.map((scope) => ({ scope, allowed: roleHoldsScope(role, scope) }));
}

export function assertRoleHoldsScopes(role: Role, scopes: readonly AccessScope[]): void {
  const missing = scopes.filter((scope) => !roleHoldsScope(role, scope));
  if (missing.length > 0) {
    throw new ForbiddenError(`Your role cannot grant ${missing.join(', ')}`);
  }
}
```

Append as the last line of `packages/core/src/organizations/index.ts`:

```ts
export * from './access-scopes.js';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @headless-lms/core exec vitest run src/organizations/access-scopes.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Add the org claim and token lifetime to the identity context**

`packages/core/src/identity/access.ts`:

```ts
export const ORG_CLAIM = 'org_id';
export const ACCESS_TOKEN_TTL_SECONDS = 900;
```

Append as the last line of `packages/core/src/identity/index.ts`:

```ts
export * from './access.js';
```

`identity` must not import `organizations` (organizations imports identity), which is why the scope catalogue lives in `organizations` and only these two constants live here.

- [ ] **Step 6: Add the app-access port types**

In `packages/core/src/types/identity.ts`, the file currently ends with:

```ts
export type UserId = string;
```

Replace that line with:

```ts
export type UserId = string;

export type HeaderBag = Record<string, string | string[] | undefined>;

export type AccessGrant = {
  userId: string;
  orgId: string;
  scopes: string[];
  clientId: string;
};

export type AccessRequest = {
  method: string;
  url: string;
  headers: HeaderBag;
};

export interface AccessTokenVerifier {
  verifyAccess(request: AccessRequest): Promise<AccessGrant | null>;
}

export type ConnectedApp = {
  clientId: string;
  name: string;
  iconUrl: string | null;
  scopes: string[];
  connectedAt: Date;
};

export type ApiKeySummary = {
  id: string;
  name: string | null;
  start: string | null;
  scopes: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
};

export type CreatedApiKey = ApiKeySummary & { key: string };

export type NewApiKey = {
  authUserId: string;
  orgId: string;
  name: string;
  scopes: string[];
};

export interface AppAccessAdmin {
  listConnectedApps(headers: HeaderBag, orgId: string): Promise<ConnectedApp[]>;
  revokeConnectedApp(headers: HeaderBag, orgId: string, clientId: string): Promise<void>;
  listApiKeys(headers: HeaderBag, orgId: string): Promise<ApiKeySummary[]>;
  createApiKey(input: NewApiKey): Promise<CreatedApiKey>;
  deleteApiKey(headers: HeaderBag, orgId: string, keyId: string): Promise<void>;
}
```

`packages/core/src/types/index.ts` already has `export * from './identity.js';`, so nothing else changes there. `orgId` in `AppAccessAdmin` is the Better Auth organization id (`scope.authOrgId`).

- [ ] **Step 7: Check and commit the core part**

Run: `pnpm --filter @headless-lms/core typecheck && pnpm lint`
Expected: both exit 0 with no errors.

```bash
git add packages/core/src/organizations/access-scopes.ts packages/core/src/organizations/access-scopes.test.ts packages/core/src/organizations/index.ts packages/core/src/identity/access.ts packages/core/src/identity/index.ts packages/core/src/types/identity.ts
git commit -m "feat(core): access scope catalogue and app access ports"
```

- [ ] **Step 8: Upgrade Better Auth and add the plugins**

Run from the repo root:

```bash
pnpm --filter @headless-lms/adapter-auth add -E --config.package-import-method=copy better-auth@1.7.7 @better-auth/mcp@1.7.7 @better-auth/cimd@1.7.7 @better-auth/oauth-provider@1.7.7 @better-auth/api-key@1.7.7 @better-auth/utils@0.4.2 zod@4.6.6
pnpm --filter @headless-lms/server add -E --config.package-import-method=copy better-auth@1.7.7
pnpm --filter admin add -E --config.package-import-method=copy better-auth@1.7.7 @better-auth/oauth-provider@1.7.7
pnpm --filter student add -E --config.package-import-method=copy better-auth@1.7.7
pnpm install --config.package-import-method=copy
```

The result in `adapters/auth/package.json` `dependencies` is exactly:

```json
    "@better-auth/api-key": "1.7.7",
    "@better-auth/cimd": "1.7.7",
    "@better-auth/mcp": "1.7.7",
    "@better-auth/oauth-provider": "1.7.7",
    "@better-auth/utils": "0.4.2",
    "@headless-lms/adapter-db": "workspace:*",
    "@headless-lms/core": "workspace:*",
    "better-auth": "1.7.7",
    "drizzle-orm": "^0.45.2",
    "zod": "4.6.6"
```

`packages/server/package.json` and `apps/student/package.json`: `"better-auth": "1.7.7"` (was `^1.6.25`). `apps/admin/package.json`: `"better-auth": "1.7.7"` plus `"@better-auth/oauth-provider": "1.7.7"`. Every version is exact (no `^`).

Why the two extra pins in the adapter: without `@better-auth/utils@0.4.2` the plugins peer-resolve `@better-auth/utils@0.5.0`, which creates a second `@better-auth/core` type identity and every plugin then fails `satisfies BetterAuthOptions`; without `zod@4.6.6` the adapter's declaration build fails with TS2742 (a Better Auth type is not nameable without it).

Run: `pnpm --filter @headless-lms/adapter-auth --filter @headless-lms/server --filter admin --filter student list better-auth`
Expected: `better-auth 1.7.7` under each of the four packages.

- [ ] **Step 9: Write the failing adapter and endpoint tests**

`adapters/auth/src/schema-parity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getSchema } from "better-auth/db";
import { getTableColumns } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as authSchema from "@headless-lms/adapter-db/schema/better-auth";
import { buildAuthOptions } from "./better-auth.js";
import type { CreateAuthOptions } from "./types.js";

const noop = async () => undefined;
const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, child: () => logger };

const options: CreateAuthOptions = {
  db: {} as NodePgDatabase,
  baseUrl: "http://localhost:8100",
  secret: "a".repeat(32),
  trustedOrigins: [],
  logger: logger as unknown as CreateAuthOptions["logger"],
  hooks: {
    beforeUserCreate: noop,
    sendResetPassword: noop,
    onPasswordReset: noop,
    sendMagicLink: noop,
  } as unknown as CreateAuthOptions["hooks"],
  mcp: {
    oauthEnabled: true,
    resource: "http://localhost:8100/mcp",
    loginPage: "http://localhost:8101/login",
    consentPage: "http://localhost:8101/oauth/consent",
    orgPickerPage: "http://localhost:8101/onboarding/select-organization",
  },
};

describe("better-auth drizzle schema", () => {
  const models = getSchema(buildAuthOptions(options));

  for (const [model, definition] of Object.entries(models)) {
    it(`maps every ${model} field`, () => {
      const table = (authSchema as Record<string, PgTable | undefined>)[model];
      expect(table, `no export named ${model} in schema/better-auth.ts`).toBeDefined();
      const columns = getTableColumns(table as PgTable);
      for (const field of Object.keys(definition.fields)) {
        expect(columns, `${model}.${field}`).toHaveProperty(field);
      }
    });
  }
});

describe("mcp oauth off", () => {
  const off: CreateAuthOptions = {
    ...options,
    baseUrl: "http://api.internal:8000",
    mcp: {
      ...options.mcp,
      oauthEnabled: false,
      resource: "http://api.internal:8000/mcp",
    },
  };

  it("builds options for a plain-http public url without the oauth plugins", () => {
    const ids = (built: ReturnType<typeof buildAuthOptions>) => built.plugins.map((p) => p.id);
    const enabled = ids(buildAuthOptions(options));
    const disabled = ids(buildAuthOptions(off));
    const oauthOnly = enabled.filter((id) => !disabled.includes(id));
    expect(oauthOnly.length).toBeGreaterThan(0);
    expect(disabled).toEqual(enabled.filter((id) => !oauthOnly.includes(id)));
    expect(getSchema(buildAuthOptions(off))).not.toHaveProperty("oauthClient");
  });

  it("refuses to build the oauth plugins for that url", () => {
    expect(() => buildAuthOptions({ ...off, mcp: { ...off.mcp, oauthEnabled: true } })).toThrow(
      /HTTPS/,
    );
  });
});
```

`adapters/auth/src/access-grant.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { needsOrgChoice } from "./access-grant.js";

describe("needsOrgChoice", () => {
  const members = async () => ["org_a", "org_b"];

  it("asks for an org when the session has none", async () => {
    expect(await needsOrgChoice(null, members)).toBe(true);
  });
  it("asks for an org when the active org is not one of the user's memberships", async () => {
    expect(await needsOrgChoice("org_student_portal", members)).toBe(true);
    expect(await needsOrgChoice("org_a", async () => [])).toBe(true);
  });
  it("keeps an active org the user is a member of", async () => {
    expect(await needsOrgChoice("org_b", members)).toBe(false);
  });
});
```

`packages/server/src/app/mcp-endpoints.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mcpEndpoints } from './mcp-endpoints.js';

describe('mcpEndpoints', () => {
  it('derives every MCP url from the api and admin origins', () => {
    expect(
      mcpEndpoints({ authBaseURL: 'https://api.example.com/', adminAppUrl: 'https://admin.example.com' }),
    ).toEqual({
      oauthEnabled: true,
      resource: 'https://api.example.com/mcp',
      resourceMetadataUrl: 'https://api.example.com/.well-known/oauth-protected-resource/mcp',
      issuer: 'https://api.example.com/api/auth',
      loginPage: 'https://admin.example.com/login',
      consentPage: 'https://admin.example.com/oauth/consent',
      orgPickerPage: 'https://admin.example.com/onboarding/select-organization',
    });
  });

  it('enables oauth for https and loopback api urls only', () => {
    const enabled = (authBaseURL: string) =>
      mcpEndpoints({ authBaseURL, adminAppUrl: 'https://admin.example.com' }).oauthEnabled;
    expect(enabled('https://api.example.com')).toBe(true);
    expect(enabled('https://10.0.0.5:8443')).toBe(true);
    expect(enabled('http://localhost:8100')).toBe(true);
    expect(enabled('http://127.0.0.1:8100')).toBe(true);
    expect(enabled('http://127.4.5.6')).toBe(true);
    expect(enabled('http://[::1]:8100')).toBe(true);
    expect(enabled('http://api.example.com')).toBe(false);
    expect(enabled('http://api:8000')).toBe(false);
    expect(enabled('http://10.0.0.5:8000')).toBe(false);
    expect(enabled('http://localhost.example.com')).toBe(false);
    expect(enabled('http://128.0.0.1')).toBe(false);
  });
});
```

- [ ] **Step 10: Run the tests to verify they fail**

Run: `pnpm --filter @headless-lms/adapter-auth exec vitest run src/schema-parity.test.ts src/access-grant.test.ts`
Expected: FAIL — `schema-parity.test.ts` with "buildAuthOptions is not a function", `access-grant.test.ts` with "Failed to load url ./access-grant.js".

Run: `pnpm --filter @headless-lms/server exec vitest run src/app/mcp-endpoints.test.ts`
Expected: FAIL with "Failed to load url ./mcp-endpoints.js".

- [ ] **Step 11: Add the MCP options to the adapter types**

In `adapters/auth/src/types.ts`, replace:

```ts
export interface CreateAuthOptions {
```

with:

```ts
export interface McpAuthOptions {
  oauthEnabled: boolean;
  resource: string;
  loginPage: string;
  consentPage: string;
  orgPickerPage: string;
}

export interface CreateAuthOptions {
```

and in the same interface replace:

```ts
  hooks: Hooks;
```

with:

```ts
  hooks: Hooks;
  mcp: McpAuthOptions;
```

- [ ] **Step 12: Add the org-choice helper and export it**

`adapters/auth/src/access-grant.ts`:

```ts
export async function needsOrgChoice(
  activeOrgId: string | null,
  memberOrgIds: () => Promise<readonly string[]>,
): Promise<boolean> {
  if (activeOrgId === null) {
    return true;
  }
  return !(await memberOrgIds()).includes(activeOrgId);
}
```

`adapters/auth/src/index.ts` (whole file):

```ts
export * from "./better-auth.js";
export * from "./types.js";
export * from "./access-grant.js";
```

- [ ] **Step 13: Split option building out of `createAuth` and register the plugins**

In `adapters/auth/src/better-auth.ts`, replace everything from the first line of the file down to and including `export type Auth = ReturnType<typeof createAuth>;` (lines 1–151 on `main`) with the block below. The `BetterAuth` class that follows stays exactly as it is in this task.

```ts
import type {
  ActiveSession,
  Logger,
  NewOrganizationInput,
  SessionVerifier,
} from "@headless-lms/core/types";
import type { IncomingHttpHeaders } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { APIError, betterAuth, type BetterAuthOptions, type BetterAuthPlugin } from "better-auth";
import type { CreateAuthOptions } from "./types.js";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import * as authSchema from "@headless-lms/adapter-db/schema/better-auth";
import { prefixId } from "@headless-lms/core/shared/id";
import { customSession, jwt, magicLink, organization } from "better-auth/plugins";
import { mcp } from "@better-auth/mcp";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { apiKey } from "@better-auth/api-key";
import { eq } from "drizzle-orm";
import { ac, roles } from "./access.js";
import { needsOrgChoice } from "./access-grant.js";
import {
  ACCESS_SCOPES,
  type AuthHeaders,
  type AuthOrganization,
  type MemberWriteContext,
  type OrgAdmin,
  OrganizationRuleError,
  parseRole,
  type Role,
  type UpdateOrganizationInput,
} from "@headless-lms/core/organizations";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  ORG_CLAIM,
  type SessionAdmin,
} from "@headless-lms/core/identity";

function activeOrgOf(session: unknown): string | null {
  const value = (session as { activeOrganizationId?: string | null } | null)?.activeOrganizationId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function memberOrgIds(db: CreateAuthOptions["db"], userId: string): Promise<string[]> {
  const rows = await db
    .select({ organizationId: authSchema.member.organizationId })
    .from(authSchema.member)
    .where(eq(authSchema.member.userId, userId));
  return rows.map((row) => row.organizationId);
}

function mcpOAuthPlugins(opts: CreateAuthOptions): BetterAuthPlugin[] {
  return [
    mcp({
      resource: opts.mcp.resource,
      loginPage: opts.mcp.loginPage,
      consentPage: opts.mcp.consentPage,
      scopes: [...ACCESS_SCOPES, "offline_access"],
      clientRegistrationDefaultScopes: [...ACCESS_SCOPES, "offline_access"],
      accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      postLogin: {
        page: opts.mcp.orgPickerPage,
        shouldRedirect: ({ session, user }) =>
          needsOrgChoice(activeOrgOf(session), () => memberOrgIds(opts.db, user.id)),
        consentReferenceId: ({ session }) => activeOrgOf(session) ?? undefined,
      },
      customAccessTokenClaims: ({ referenceId }) =>
        referenceId ? { [ORG_CLAIM]: referenceId } : {},
    }) as BetterAuthPlugin,
    cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }) as BetterAuthPlugin,
  ];
}

export function buildAuthOptions(opts: CreateAuthOptions) {
  const {
    sendResetPassword,
    onPasswordReset,
    sendMagicLink,
    beforeUserCreate,
    beforeCreateSession,
  } = opts.hooks;
  const detached =
    <A extends unknown[]>(name: string, hook: (...args: A) => Promise<void>) =>
    async (...args: A): Promise<void> => {
      void hook(...args).catch((err: unknown) =>
        opts.logger.error(`auth hook ${name} failed`, { err }),
      );
    };

  return {
    baseURL: opts.baseUrl,
    secret: opts.secret,
    trustedOrigins: opts.trustedOrigins,
    session: {
      // Signed short-lived cookie cache: avoids a Postgres session lookup on
      // every request. The BFF verifies the session per request (each API call
      // + every SSR getSession), so without this each one is a DB round-trip.
      // The cache holds for maxAge; sign-out / expiry still invalidate it.
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    advanced: {
      database: {
        // Prefixed, KSUID-bodied ids for every better-auth table (usr_, org_, …).
        generateId: () => prefixId("id"),
      },
      // Cross-subdomain shared session cookie for admin/api/web on one parent
      // domain (e.g. `.example.com` in prod). Left unset in local dev so the
      // host-only `localhost` cookie is used, which is already shared across
      // ports (cookies are not port-scoped).
      crossSubDomainCookies: {
        enabled: true,
        domain: opts.cookieDomain || undefined,
      },
      // Same-site cookie for the shared-parent-domain plan. Only switch to
      // `sameSite: "none"` + `secure` if admin and api are genuinely cross-site
      // (different registrable domains).
      defaultCookieAttributes: {
        sameSite: "lax",
        secure: opts.secureCookies ?? false,
        httpOnly: true,
      },
    },
    database: drizzleAdapter(opts.db, {
      provider: "pg",
      schema: authSchema,
    }),
    emailAndPassword: {
      enabled: true,
      // Detached so send time can't reveal which emails have accounts, and a failed notice can't fail the reset.
      sendResetPassword: detached("sendResetPassword", sendResetPassword),
      onPasswordReset: detached("onPasswordReset", onPasswordReset),
      revokeSessionsOnPasswordReset: true,
    },
    plugins: [
      magicLink({
        disableSignUp: true,
        sendMagicLink,
      }),
      organization({
        ac,
        roles,
        creatorRole: "owner",
        organizationHooks: opts.hooks,
      }),
      jwt({ disableSettingJwtHeader: true }) as BetterAuthPlugin,
      ...(opts.mcp.oauthEnabled ? mcpOAuthPlugins(opts) : []),
      apiKey({ enableMetadata: true, rateLimit: { enabled: false } }) as BetterAuthPlugin,
      // Enrich get-session with the caller's memberships (role + org) so BFFs
      // resolve auth in one call instead of fanning out to get-active-member /
      // get-full-organization / organization/list. Custom fields bypass the
      // cookie cache, so this costs one indexed query per get-session.
      customSession(async ({ user, session }) => {
        const memberships = await opts.db
          .select({
            role: authSchema.member.role,
            id: authSchema.organization.id,
            name: authSchema.organization.name,
            slug: authSchema.organization.slug,
          })
          .from(authSchema.member)
          .innerJoin(
            authSchema.organization,
            eq(authSchema.member.organizationId, authSchema.organization.id),
          )
          .where(eq(authSchema.member.userId, user.id));
        const activeOrgId =
          (session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null;
        const active = memberships.find((m) => m.id === activeOrgId) ?? null;
        return {
          user,
          session,
          activeMemberRole: active?.role ?? null,
          activeOrganization: active
            ? { id: active.id, name: active.name, slug: active.slug }
            : null,
          organizations: memberships.map(({ id, name, slug }) => ({ id, name, slug })),
        };
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          before: beforeUserCreate,
        },
      },
      session: {
        create: {
          before: beforeCreateSession,
        },
      },
    },
  } satisfies BetterAuthOptions;
}

export function createAuth(opts: CreateAuthOptions) {
  return betterAuth(buildAuthOptions(opts));
}

export type Auth = ReturnType<typeof createAuth>;
```

What this does, so a reviewer can check it against the code:
- The comments inside the options object are `main`'s existing comments from `createAuth`, moved unchanged; the new code adds none.
- `buildAuthOptions` returns the same options `createAuth` built on `main`, plus `jwt`, then (only when `opts.mcp.oauthEnabled`) `mcp` and `cimd`, then `apiKey`; `customSession` stays last. The tests build a Better Auth instance from these options, so they must be exported separately from `createAuth`.
- `mcp` advertises and accepts `[...ACCESS_SCOPES, "offline_access"]`, and registers clients with the same default scopes. `offline_access` is only ever an authorization-server scope; it is never part of an `AccessGrant`.
- `postLogin.shouldRedirect` sends the person to the org picker when the session has no active org or the active org is not one of their memberships (a student-portal org, for example); `consentReferenceId` stamps the chosen org on the consent, and `customAccessTokenClaims` copies it into the token as `org_id`.
- Every plugin except `magicLink`, `organization` and `customSession` is cast to `BetterAuthPlugin`. Without the casts the adapter's declaration build (`tsdown`, step 20) fails with TS7056 ("the inferred type of this node exceeds the maximum length the compiler will serialize"). The consequence is that `auth.api` has no typed endpoints from `jwt`, `mcp`, `cimd` or `apiKey`; Task 2 reaches them through a local typed accessor. Organization, `getSession` and `customSession` typing is unchanged, so the existing `BetterAuth` class still compiles.
- With OAuth off, `mcp` and `cimd` are not registered at all; the second `schema-parity` test pins that, and that `mcp()` itself throws for a non-loopback `http` resource.

- [ ] **Step 14: Update the Drizzle schema to the Better Auth 1.7.7 tables**

In `adapters/db/src/schema/better-auth.ts`, replace the import line:

```ts
import { pgTable, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
```

with:

```ts
import { pgTable, text, timestamp, boolean, index, integer, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
```

Then replace everything from the line `// --- OAuth 2.1 provider tables (MCP). Owned by @better-auth/oauth-provider. ---` to the end of the file (the two OAuth section comments, `oauthClient`, `oauthRefreshToken`, `oauthAccessToken`, `oauthConsent`, the `// better-auth's jwt plugin` comment and `jwks`) with:

```ts
export const oauthClient = pgTable(
  "ba_oauth_client",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull().unique(),
    clientSecret: text("client_secret"),
    clientDiscoveryId: text("client_discovery_id"),
    disabled: boolean("disabled").default(false),
    skipConsent: boolean("skip_consent"),
    enableEndSession: boolean("enable_end_session"),
    subjectType: text("subject_type"),
    scopes: text("scopes").array(),
    clientCredentialsScopes: text("client_credentials_scopes").array().default([]),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    name: text("name"),
    uri: text("uri"),
    icon: text("icon"),
    contacts: text("contacts").array(),
    tos: text("tos"),
    policy: text("policy"),
    softwareId: text("software_id"),
    softwareVersion: text("software_version"),
    softwareStatement: text("software_statement"),
    redirectUris: text("redirect_uris").array().notNull(),
    postLogoutRedirectUris: text("post_logout_redirect_uris").array(),
    backchannelLogoutUri: text("backchannel_logout_uri"),
    backchannelLogoutSessionRequired: boolean("backchannel_logout_session_required"),
    tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
    applicationType: text("application_type"),
    jwks: text("jwks"),
    jwksUri: text("jwks_uri"),
    grantTypes: text("grant_types").array(),
    responseTypes: text("response_types").array(),
    requirePKCE: boolean("require_pkce"),
    dpopBoundAccessTokens: boolean("dpop_bound_access_tokens").default(false),
    referenceId: text("reference_id"),
    metadata: jsonb("metadata"),
  },
  (t) => [index("ba_oauth_client_user_id_idx").on(t.userId)],
);

export const oauthRefreshToken = pgTable(
  "ba_oauth_refresh_token",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => session.id, { onDelete: "set null" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: text("resources").array(),
    requestedUserInfoClaims: text("requested_user_info_claims").array(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }),
    revoked: timestamp("revoked", { withTimezone: true }),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
    rotationReplayResponse: text("rotation_replay_response"),
    rotationReplayExpiresAt: timestamp("rotation_replay_expires_at", { withTimezone: true }),
    authTime: timestamp("auth_time", { withTimezone: true }),
    confirmation: jsonb("confirmation"),
    scopes: text("scopes").array().notNull(),
  },
  (t) => [
    index("ba_oauth_refresh_token_client_id_idx").on(t.clientId),
    index("ba_oauth_refresh_token_session_id_idx").on(t.sessionId),
    index("ba_oauth_refresh_token_user_id_idx").on(t.userId),
    index("ba_oauth_refresh_token_authorization_code_id_idx").on(t.authorizationCodeId),
  ],
);

export const oauthAccessToken = pgTable(
  "ba_oauth_access_token",
  {
    id: text("id").primaryKey(),
    token: text("token").unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => session.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: text("resources").array(),
    requestedUserInfoClaims: text("requested_user_info_claims").array(),
    refreshId: text("refresh_id").references(() => oauthRefreshToken.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }),
    revoked: timestamp("revoked", { withTimezone: true }),
    confirmation: jsonb("confirmation"),
    scopes: text("scopes").array().notNull(),
  },
  (t) => [
    index("ba_oauth_access_token_client_id_idx").on(t.clientId),
    index("ba_oauth_access_token_session_id_idx").on(t.sessionId),
    index("ba_oauth_access_token_user_id_idx").on(t.userId),
    index("ba_oauth_access_token_refresh_id_idx").on(t.refreshId),
    index("ba_oauth_access_token_authorization_code_id_idx").on(t.authorizationCodeId),
  ],
);

export const oauthConsent = pgTable(
  "ba_oauth_consent",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    resources: text("resources").array(),
    requestedUserInfoClaims: text("requested_user_info_claims").array(),
    scopes: text("scopes").array().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (t) => [
    index("ba_oauth_consent_client_id_idx").on(t.clientId),
    index("ba_oauth_consent_user_id_idx").on(t.userId),
  ],
);

export const oauthResource = pgTable("ba_oauth_resource", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull().unique(),
  name: text("name").notNull(),
  accessTokenTtl: integer("access_token_ttl"),
  refreshTokenTtl: integer("refresh_token_ttl"),
  signingAlgorithm: text("signing_algorithm"),
  signingKeyId: text("signing_key_id"),
  allowedScopes: text("allowed_scopes").array(),
  customClaims: jsonb("custom_claims"),
  dpopBoundAccessTokensRequired: boolean("dpop_bound_access_tokens_required").default(false),
  disabled: boolean("disabled").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  policyVersion: integer("policy_version").default(1),
  metadata: jsonb("metadata"),
});

export const oauthClientResource = pgTable(
  "ba_oauth_client_resource",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    resourceId: text("resource_id")
      .notNull()
      .references(() => oauthResource.identifier, { onDelete: "cascade" }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }),
  },
  (t) => [
    index("ba_oauth_client_resource_client_id_idx").on(t.clientId),
    index("ba_oauth_client_resource_resource_id_idx").on(t.resourceId),
    uniqueIndex("ba_oauth_client_resource_client_resource_uidx").on(t.clientId, t.resourceId),
  ],
);

export const oauthClientAssertion = pgTable("ba_oauth_client_assertion", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const jwks = pgTable("ba_jwks", {
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  alg: text("alg"),
  crv: text("crv"),
});

export const apikey = pgTable(
  "ba_apikey",
  {
    id: text("id").primaryKey(),
    configId: text("config_id").notNull().default("default"),
    name: text("name"),
    start: text("start"),
    referenceId: text("reference_id").notNull(),
    prefix: text("prefix"),
    key: text("key").notNull(),
    refillInterval: integer("refill_interval"),
    refillAmount: integer("refill_amount"),
    lastRefillAt: timestamp("last_refill_at", { withTimezone: true }),
    enabled: boolean("enabled").default(true),
    rateLimitEnabled: boolean("rate_limit_enabled").default(true),
    rateLimitTimeWindow: integer("rate_limit_time_window").default(86400000),
    rateLimitMax: integer("rate_limit_max").default(10),
    requestCount: integer("request_count").default(0),
    remaining: integer("remaining"),
    lastRequest: timestamp("last_request", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    permissions: text("permissions"),
    metadata: text("metadata"),
  },
  (t) => [
    index("ba_apikey_config_id_idx").on(t.configId),
    index("ba_apikey_reference_id_idx").on(t.referenceId),
    index("ba_apikey_key_idx").on(t.key),
  ],
);
```

Everything above that line (`user`, `session`, `account`, `verification`, `organization`, `member`, `invitation` and their comments) is unchanged. Note the property rename `requirePkce` → `requirePKCE` (same `require_pkce` column), the removal of `public` and `type`, and `metadata` becoming `jsonb` on `oauthClient`.

- [ ] **Step 15: Derive the MCP endpoints from the existing config**

`packages/server/src/app/mcp-endpoints.ts`:

```ts
import type { McpAuthOptions } from '@headless-lms/adapter-auth';

export interface McpEndpoints extends McpAuthOptions {
  issuer: string;
  resourceMetadataUrl: string;
}

const trimSlash = (url: string) => url.replace(/\/+$/, '');

const LOOPBACK_IPV4 = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

function oauthEligible(resource: string): boolean {
  const { protocol, hostname } = new URL(resource);
  if (protocol === 'https:') {
    return true;
  }
  return (
    protocol === 'http:' &&
    (hostname === 'localhost' || hostname === '[::1]' || LOOPBACK_IPV4.test(hostname))
  );
}

export function mcpEndpoints(config: { authBaseURL: string; adminAppUrl: string }): McpEndpoints {
  const api = trimSlash(config.authBaseURL);
  const admin = trimSlash(config.adminAppUrl);
  return {
    oauthEnabled: oauthEligible(`${api}/mcp`),
    resource: `${api}/mcp`,
    resourceMetadataUrl: `${api}/.well-known/oauth-protected-resource/mcp`,
    issuer: `${api}/api/auth`,
    loginPage: `${admin}/login`,
    consentPage: `${admin}/oauth/consent`,
    orgPickerPage: `${admin}/onboarding/select-organization`,
  };
}
```

- [ ] **Step 16: Wire the endpoints into the container**

In `packages/server/src/app/container.ts`, make these four replacements.

Replace:

```ts
import { loadIntegrations } from './integrations.js';
import { registerNotificationSubscribers } from './notifications.js';
```

with:

```ts
import { loadIntegrations } from './integrations.js';
import { mcpEndpoints, type McpEndpoints } from './mcp-endpoints.js';
import { registerNotificationSubscribers } from './notifications.js';
```

Replace:

```ts
export interface Container {
  auth: BetterAuth;
```

with:

```ts
export interface Container {
  auth: BetterAuth;
  mcp: McpEndpoints;
```

Replace:

```ts
  const auth = new BetterAuth({
    db,
    baseUrl: config.authBaseURL,
```

with:

```ts
  const mcp = mcpEndpoints(config);
  if (!mcp.oauthEnabled) {
    authLogger.warn(
      'MCP OAuth is off: BETTER_AUTH_URL must be https or a loopback host; /mcp accepts API keys only',
      { authBaseURL: config.authBaseURL },
    );
  }
  const auth = new BetterAuth({
    db,
    baseUrl: config.authBaseURL,
    mcp: {
      oauthEnabled: mcp.oauthEnabled,
      resource: mcp.resource,
      loginPage: mcp.loginPage,
      consentPage: mcp.consentPage,
      orgPickerPage: mcp.orgPickerPage,
    },
```

Replace:

```ts
  return {
    auth,
    identity,
```

with:

```ts
  return {
    auth,
    mcp,
    identity,
```

- [ ] **Step 17: Run the tests to verify they pass**

Run: `pnpm --filter @headless-lms/adapter-auth exec vitest run src/schema-parity.test.ts src/access-grant.test.ts`
Expected: PASS (`schema-parity.test.ts` 18 tests — one per Better Auth model plus the two OAuth-off tests; `access-grant.test.ts` 3 tests).

Run: `pnpm --filter @headless-lms/server exec vitest run src/app/mcp-endpoints.test.ts`
Expected: PASS (2 tests).

If `schema-parity.test.ts` names a field that is not in the schema, add it with the same rule (camelCase property, snake_case column, nullable unless Better Auth marks it required) and re-run.

- [ ] **Step 18: Generate the migration**

drizzle-kit asks, for each new `ba_oauth_client` column, whether it is created or renamed from the dropped `public`/`type` columns. These prompts need a TTY (without one drizzle-kit exits with "Interactive prompts require a TTY terminal"), so give it one with `script` and press Enter (the default, "create column") for every prompt. That is how the old branch generated this migration. The command uses the BSD/macOS `script` syntax; `db:generate` loads the worktree's `.env` (`tsx --env-file=../../.env`), so that file must exist, but it does not connect to the database. Run from the repo root:

```bash
(for i in $(seq 1 60); do printf '\r'; sleep 0.4; done) | script -q /tmp/drizzle-generate.log pnpm --filter @headless-lms/adapter-db db:generate --name clever_captain_cross
```

There are 8 prompts (`client_discovery_id`, `client_credentials_scopes`, `backchannel_logout_uri`, `backchannel_logout_session_required`, `application_type`, `jwks`, `jwks_uri`, `dpop_bound_access_tokens`) and every one must be answered "create column".

Run: `grep -o "will be [a-z]*" /tmp/drizzle-generate.log | sort | uniq -c`
Expected: exactly one line, `8 will be created`.

drizzle-kit writes `adapters/db/drizzle/0003_clever_captain_cross.sql`, `adapters/db/drizzle/meta/0003_snapshot.json` and the new entry in `adapters/db/drizzle/meta/_journal.json`. The snapshot and journal are drizzle-kit's output and are committed as generated; never hand-write them.

Then hand-edit one line of the SQL. Postgres cannot cast `text` to `jsonb` implicitly, so the generated statement fails at migrate time. Replace:

```sql
ALTER TABLE "ba_oauth_client" ALTER COLUMN "metadata" SET DATA TYPE jsonb;--> statement-breakpoint
```

with:

```sql
ALTER TABLE "ba_oauth_client" ALTER COLUMN "metadata" SET DATA TYPE jsonb USING "metadata"::jsonb;--> statement-breakpoint
```

After the edit, `adapters/db/drizzle/0003_clever_captain_cross.sql` is exactly:

```sql
CREATE TABLE "ba_apikey" (
	"id" text PRIMARY KEY NOT NULL,
	"config_id" text DEFAULT 'default' NOT NULL,
	"name" text,
	"start" text,
	"reference_id" text NOT NULL,
	"prefix" text,
	"key" text NOT NULL,
	"refill_interval" integer,
	"refill_amount" integer,
	"last_refill_at" timestamp with time zone,
	"enabled" boolean DEFAULT true,
	"rate_limit_enabled" boolean DEFAULT true,
	"rate_limit_time_window" integer DEFAULT 86400000,
	"rate_limit_max" integer DEFAULT 10,
	"request_count" integer DEFAULT 0,
	"remaining" integer,
	"last_request" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"permissions" text,
	"metadata" text
);
--> statement-breakpoint
CREATE TABLE "ba_oauth_client_assertion" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ba_oauth_client_resource" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"resource_id" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ba_oauth_resource" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"name" text NOT NULL,
	"access_token_ttl" integer,
	"refresh_token_ttl" integer,
	"signing_algorithm" text,
	"signing_key_id" text,
	"allowed_scopes" text[],
	"custom_claims" jsonb,
	"dpop_bound_access_tokens_required" boolean DEFAULT false,
	"disabled" boolean DEFAULT false,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"policy_version" integer DEFAULT 1,
	"metadata" jsonb,
	CONSTRAINT "ba_oauth_resource_identifier_unique" UNIQUE("identifier")
);
--> statement-breakpoint
ALTER TABLE "ba_oauth_access_token" DROP CONSTRAINT "ba_oauth_access_token_client_id_ba_oauth_client_client_id_fk";
--> statement-breakpoint
ALTER TABLE "ba_oauth_access_token" DROP CONSTRAINT "ba_oauth_access_token_refresh_id_ba_oauth_refresh_token_id_fk";
--> statement-breakpoint
ALTER TABLE "ba_oauth_consent" DROP CONSTRAINT "ba_oauth_consent_client_id_ba_oauth_client_client_id_fk";
--> statement-breakpoint
ALTER TABLE "ba_oauth_refresh_token" DROP CONSTRAINT "ba_oauth_refresh_token_client_id_ba_oauth_client_client_id_fk";
--> statement-breakpoint
ALTER TABLE "ba_oauth_access_token" ALTER COLUMN "token" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ba_oauth_access_token" ALTER COLUMN "expires_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ba_oauth_access_token" ALTER COLUMN "created_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ba_oauth_client" ALTER COLUMN "metadata" SET DATA TYPE jsonb USING "metadata"::jsonb;--> statement-breakpoint
ALTER TABLE "ba_oauth_consent" ALTER COLUMN "created_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ba_oauth_consent" ALTER COLUMN "updated_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ba_oauth_refresh_token" ALTER COLUMN "expires_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ba_oauth_refresh_token" ALTER COLUMN "created_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ba_jwks" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ba_jwks" ADD COLUMN "alg" text;--> statement-breakpoint
ALTER TABLE "ba_jwks" ADD COLUMN "crv" text;--> statement-breakpoint
ALTER TABLE "ba_oauth_access_token" ADD COLUMN "authorization_code_id" text;--> statement-breakpoint
ALTER TABLE "ba_oauth_access_token" ADD COLUMN "resources" text[];--> statement-breakpoint
ALTER TABLE "ba_oauth_access_token" ADD COLUMN "requested_user_info_claims" text[];--> statement-breakpoint
ALTER TABLE "ba_oauth_access_token" ADD COLUMN "revoked" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ba_oauth_access_token" ADD COLUMN "confirmation" jsonb;--> statement-breakpoint
ALTER TABLE "ba_oauth_client" ADD COLUMN "client_discovery_id" text;--> statement-breakpoint
ALTER TABLE "ba_oauth_client" ADD COLUMN "client_credentials_scopes" text[] DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "ba_oauth_client" ADD COLUMN "backchannel_logout_uri" text;--> statement-breakpoint
ALTER TABLE "ba_oauth_client" ADD COLUMN "backchannel_logout_session_required" boolean;--> statement-breakpoint
ALTER TABLE "ba_oauth_client" ADD COLUMN "application_type" text;--> statement-breakpoint
ALTER TABLE "ba_oauth_client" ADD COLUMN "jwks" text;--> statement-breakpoint
ALTER TABLE "ba_oauth_client" ADD COLUMN "jwks_uri" text;--> statement-breakpoint
ALTER TABLE "ba_oauth_client" ADD COLUMN "dpop_bound_access_tokens" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "ba_oauth_consent" ADD COLUMN "resources" text[];--> statement-breakpoint
ALTER TABLE "ba_oauth_consent" ADD COLUMN "requested_user_info_claims" text[];--> statement-breakpoint
ALTER TABLE "ba_oauth_refresh_token" ADD COLUMN "authorization_code_id" text;--> statement-breakpoint
ALTER TABLE "ba_oauth_refresh_token" ADD COLUMN "resources" text[];--> statement-breakpoint
ALTER TABLE "ba_oauth_refresh_token" ADD COLUMN "requested_user_info_claims" text[];--> statement-breakpoint
ALTER TABLE "ba_oauth_refresh_token" ADD COLUMN "rotated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ba_oauth_refresh_token" ADD COLUMN "rotation_replay_response" text;--> statement-breakpoint
ALTER TABLE "ba_oauth_refresh_token" ADD COLUMN "rotation_replay_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ba_oauth_refresh_token" ADD COLUMN "confirmation" jsonb;--> statement-breakpoint
ALTER TABLE "ba_oauth_client_resource" ADD CONSTRAINT "ba_oauth_client_resource_client_id_ba_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."ba_oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ba_oauth_client_resource" ADD CONSTRAINT "ba_oauth_client_resource_resource_id_ba_oauth_resource_identifier_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."ba_oauth_resource"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ba_apikey_config_id_idx" ON "ba_apikey" USING btree ("config_id");--> statement-breakpoint
CREATE INDEX "ba_apikey_reference_id_idx" ON "ba_apikey" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "ba_apikey_key_idx" ON "ba_apikey" USING btree ("key");--> statement-breakpoint
CREATE INDEX "ba_oauth_client_resource_client_id_idx" ON "ba_oauth_client_resource" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "ba_oauth_client_resource_resource_id_idx" ON "ba_oauth_client_resource" USING btree ("resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ba_oauth_client_resource_client_resource_uidx" ON "ba_oauth_client_resource" USING btree ("client_id","resource_id");--> statement-breakpoint
ALTER TABLE "ba_oauth_access_token" ADD CONSTRAINT "ba_oauth_access_token_client_id_ba_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."ba_oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ba_oauth_access_token" ADD CONSTRAINT "ba_oauth_access_token_refresh_id_ba_oauth_refresh_token_id_fk" FOREIGN KEY ("refresh_id") REFERENCES "public"."ba_oauth_refresh_token"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ba_oauth_consent" ADD CONSTRAINT "ba_oauth_consent_client_id_ba_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."ba_oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ba_oauth_refresh_token" ADD CONSTRAINT "ba_oauth_refresh_token_client_id_ba_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."ba_oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ba_oauth_access_token_authorization_code_id_idx" ON "ba_oauth_access_token" USING btree ("authorization_code_id");--> statement-breakpoint
CREATE INDEX "ba_oauth_refresh_token_authorization_code_id_idx" ON "ba_oauth_refresh_token" USING btree ("authorization_code_id");--> statement-breakpoint
ALTER TABLE "ba_oauth_client" DROP COLUMN "public";--> statement-breakpoint
ALTER TABLE "ba_oauth_client" DROP COLUMN "type";
```

It creates `ba_apikey`, `ba_oauth_client_assertion`, `ba_oauth_client_resource`, `ba_oauth_resource`, alters the four `ba_oauth_*` tables and `ba_jwks`, and must not touch `ba_user`, `ba_session`, `ba_account`, `ba_verification`, `ba_organization`, `ba_member` or `ba_invitation`. If the generated file differs from the above in anything but that one line, a prompt was answered with a rename: delete the three generated files, restore `_journal.json` with `git checkout adapters/db/drizzle/meta/_journal.json`, and generate again.

- [ ] **Step 19: Apply the migration**

Requires Postgres (`docker compose -f docker/docker-compose.yml up -d`) and `DATABASE_URL` in the worktree's `.env` pointing at `headless_lms_mcp`.

Run: `pnpm db:migrate`
Expected: exits 0; a second `pnpm db:migrate` is a no-op.

- [ ] **Step 20: Full verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build:packages
```

Expected: all exit 0. `pnpm build:packages` is the check for TS7056 in `@headless-lms/adapter-auth`'s declaration build.

- [ ] **Step 21: Commit**

```bash
git add adapters/auth/package.json packages/server/package.json apps/admin/package.json apps/student/package.json pnpm-lock.yaml adapters/auth/src/types.ts adapters/auth/src/access-grant.ts adapters/auth/src/access-grant.test.ts adapters/auth/src/index.ts adapters/auth/src/better-auth.ts adapters/auth/src/schema-parity.test.ts adapters/db/src/schema/better-auth.ts adapters/db/drizzle/0003_clever_captain_cross.sql adapters/db/drizzle/meta/0003_snapshot.json adapters/db/drizzle/meta/_journal.json packages/server/src/app/mcp-endpoints.ts packages/server/src/app/mcp-endpoints.test.ts packages/server/src/app/container.ts
git commit -m "feat(auth): better-auth 1.7 as the MCP authorization server"
```

---

### Task 2: Credential verification and app-access admin in the auth adapter

**Files:**
- Modify: `adapters/auth/src/access-grant.ts`
- Test: `adapters/auth/src/access-grant.test.ts`
- Create: `adapters/auth/src/client-registration.ts`
- Test: `adapters/auth/src/client-registration.test.ts`
- Modify: `adapters/auth/src/better-auth.ts`
- Test: `adapters/auth/src/verify-access.test.ts`

**Interfaces:**
- Consumes: `ACCESS_SCOPES`, `AccessScope`, `isAccessScope` from `@headless-lms/core/organizations` (Task 1); `ORG_CLAIM`, `ACCESS_TOKEN_TTL_SECONDS` from `@headless-lms/core/identity` (Task 1); `HeaderBag`, `AccessGrant`, `AccessRequest`, `AccessTokenVerifier`, `ConnectedApp`, `ApiKeySummary`, `CreatedApiKey`, `NewApiKey`, `AppAccessAdmin` from `@headless-lms/core/types` (Task 1); `CreateAuthOptions.mcp`, `buildAuthOptions`, `createAuth`, `Auth`, `needsOrgChoice` (Task 1).
- Produces (class `BetterAuth` in `@headless-lms/adapter-auth`):
  - `class BetterAuth implements SessionVerifier, OrgAdmin, SessionAdmin, AccessTokenVerifier, AppAccessAdmin`
  - `constructor(opts: CreateAuthOptions, auth?: Auth)` — the optional `auth` lets tests inject an instance built on the memory adapter.
  - `authorizationServerMetadata(request: Request): Promise<Response>`
  - `verifyAccess(request: AccessRequest): Promise<AccessGrant | null>` — `x-api-key` header first, else `Authorization: Bearer|DPoP <jwt>`; `null` for anything not accepted. Grant `userId` is the Better Auth user id, `orgId` the Better Auth organization id, `clientId` the OAuth client id or `api-key:<key id>`, `scopes` only catalogue scopes.
  - `listConnectedApps(headers, orgId)`, `revokeConnectedApp(headers, orgId, clientId)`, `listApiKeys(headers, orgId)`, `createApiKey(input: NewApiKey)`, `deleteApiKey(headers, orgId, keyId)` — `orgId` is the Better Auth organization id.
- Produces (pure helpers in `adapters/auth/src/access-grant.ts`, exported from the package): `accessTokenAuthorization(header: string | string[] | undefined): AccessTokenAuthorization | null`, `grantFromClaims(claims: Record<string, unknown>): AccessGrant | null`, `needsOrgChoice` (unchanged), `orgIdFromMetadata(metadata: unknown): string | null`, `scopesToPermissions(scopes: string[]): Record<string, string[]>`, `permissionsToScopes(permissions: unknown): AccessScope[]`.
- Produces (`adapters/auth/src/client-registration.ts`, internal): `withLoopbackNativeDefault(body: unknown): Record<string, unknown> | null`.

What the installed `@better-auth/api-key@1.7.7` actually does (read in `adapters/auth/node_modules/@better-auth/api-key/dist/index.mjs` and confirmed against a live instance), which the code below relies on:
- `createApiKey` accepts `userId` and `permissions` (`z.record(z.string(), z.array(z.string()))`) in the body. When the call carries `headers` (or a request), passing `permissions` throws `SERVER_ONLY_PROPERTY` and passing `userId` is rejected; called without headers, the key's `referenceId` is the body's `userId`. So `createApiKey` calls the endpoint server-side with no headers.
- `permissions` is stored as JSON text in `ba_apikey.permissions`, and every endpoint returns it parsed: `createApiKey`, `verifyApiKey` (`key.permissions`) and `listApiKeys` (`apiKeys[].permissions`) all return `{ [resource: string]: string[] } | null`, never a string. `permissionsToScopes` therefore reads that object shape; anything else yields no scopes.
- `metadata` is returned parsed as well; `orgIdFromMetadata` still accepts a JSON string as on the old branch.
- `listApiKeys` returns `{ apiKeys, total, limit, offset }`.

None of these tests need Postgres: `client-registration.test.ts` and `verify-access.test.ts` build a real Better Auth instance from `buildAuthOptions` on Better Auth's memory adapter.

- [ ] **Step 1: Write the failing tests**

`adapters/auth/src/access-grant.test.ts` (whole file, replaces the Task 1 version):

```ts
import { describe, expect, it } from "vitest";
import {
  accessTokenAuthorization,
  grantFromClaims,
  needsOrgChoice,
  orgIdFromMetadata,
  permissionsToScopes,
  scopesToPermissions,
} from "./access-grant.js";

describe("needsOrgChoice", () => {
  const members = async () => ["org_a", "org_b"];

  it("asks for an org when the session has none", async () => {
    expect(await needsOrgChoice(null, members)).toBe(true);
  });
  it("asks for an org when the active org is not one of the user's memberships", async () => {
    expect(await needsOrgChoice("org_student_portal", members)).toBe(true);
    expect(await needsOrgChoice("org_a", async () => [])).toBe(true);
  });
  it("keeps an active org the user is a member of", async () => {
    expect(await needsOrgChoice("org_b", members)).toBe(false);
  });
});

describe("accessTokenAuthorization", () => {
  it("reads a Bearer or DPoP authorization header", () => {
    expect(accessTokenAuthorization("Bearer abc.def")).toEqual({
      scheme: "Bearer",
      token: "abc.def",
    });
    expect(accessTokenAuthorization("bearer abc")).toEqual({ scheme: "Bearer", token: "abc" });
    expect(accessTokenAuthorization("DPoP abc")).toEqual({ scheme: "DPoP", token: "abc" });
  });
  it("ignores other schemes, empty values and arrays", () => {
    expect(accessTokenAuthorization("Basic abc")).toBeNull();
    expect(accessTokenAuthorization("Bearer ")).toBeNull();
    expect(accessTokenAuthorization(undefined)).toBeNull();
    expect(accessTokenAuthorization(["Bearer a", "Bearer b"])).toBeNull();
  });
});

describe("grantFromClaims", () => {
  const claims = {
    sub: "usr_1",
    client_id: "client_1",
    org_id: "org_1",
    scope: "courses:read courses:write offline_access",
  };

  it("builds a grant from verified token claims", () => {
    expect(grantFromClaims(claims)).toEqual({
      userId: "usr_1",
      clientId: "client_1",
      orgId: "org_1",
      scopes: ["courses:read", "courses:write"],
    });
  });
  it("keeps only catalogue scopes from the scope claim", () => {
    expect(
      grantFromClaims({ ...claims, scope: "openid offline_access courses:publish  media:read" })
        ?.scopes,
    ).toEqual(["media:read"]);
  });
  it("falls back to azp for the client id", () => {
    expect(grantFromClaims({ ...claims, client_id: undefined, azp: "client_2" })?.clientId).toBe(
      "client_2",
    );
  });
  it("rejects a token without an org, subject or client", () => {
    expect(grantFromClaims({ ...claims, org_id: undefined })).toBeNull();
    expect(grantFromClaims({ ...claims, sub: undefined })).toBeNull();
    expect(grantFromClaims({ ...claims, client_id: undefined })).toBeNull();
  });
  it("treats a missing scope claim as no scopes", () => {
    expect(grantFromClaims({ ...claims, scope: undefined })?.scopes).toEqual([]);
  });
});

describe("orgIdFromMetadata", () => {
  it("reads the org from parsed or serialized metadata", () => {
    expect(orgIdFromMetadata({ organizationId: "org_1" })).toBe("org_1");
    expect(orgIdFromMetadata(JSON.stringify({ organizationId: "org_1" }))).toBe("org_1");
  });
  it("returns null for anything else", () => {
    expect(orgIdFromMetadata(null)).toBeNull();
    expect(orgIdFromMetadata("not json")).toBeNull();
    expect(orgIdFromMetadata({ organizationId: 7 })).toBeNull();
  });
});

describe("scopesToPermissions", () => {
  it("groups scopes into api key permissions by resource", () => {
    expect(scopesToPermissions(["courses:read", "courses:write", "media:read"])).toEqual({
      courses: ["read", "write"],
      media: ["read"],
    });
  });
  it("drops duplicates and anything outside the catalogue", () => {
    expect(
      scopesToPermissions(["courses:read", "courses:read", "offline_access", "courses:publish"]),
    ).toEqual({ courses: ["read"] });
  });
});

describe("permissionsToScopes", () => {
  it("reads api key permissions back as scopes in catalogue order", () => {
    expect(permissionsToScopes({ media: ["read"], courses: ["write", "read"] })).toEqual([
      "courses:read",
      "courses:write",
      "media:read",
    ]);
  });
  it("ignores permissions that are not catalogue scopes", () => {
    expect(
      permissionsToScopes({ courses: ["read", "publish"], profile: ["read"], media: "read" }),
    ).toEqual(["courses:read"]);
    expect(permissionsToScopes(null)).toEqual([]);
    expect(permissionsToScopes(undefined)).toEqual([]);
  });
  it("round-trips the scopes an api key was created with", () => {
    const scopes = ["students:read", "students:invite", "automations:delete"];
    expect(permissionsToScopes(scopesToPermissions(scopes))).toEqual(scopes);
  });
});
```

`adapters/auth/src/client-registration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { betterAuth } from "better-auth";
import { getSchema } from "better-auth/db";
import { memoryAdapter } from "better-auth/adapters/memory";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { buildAuthOptions } from "./better-auth.js";
import { withLoopbackNativeDefault } from "./client-registration.js";
import type { CreateAuthOptions } from "./types.js";

describe("withLoopbackNativeDefault", () => {
  it("marks a registration with a loopback http redirect as native", () => {
    expect(
      withLoopbackNativeDefault({ redirect_uris: ["http://localhost:9999/callback"] }),
    ).toEqual({ redirect_uris: ["http://localhost:9999/callback"], application_type: "native" });
    expect(
      withLoopbackNativeDefault({
        redirect_uris: ["http://127.0.0.1:33418", "https://vscode.dev/redirect"],
      })?.application_type,
    ).toBe("native");
  });
  it("leaves https-only, explicit and malformed registrations alone", () => {
    expect(withLoopbackNativeDefault({ redirect_uris: ["https://claude.ai/cb"] })).toBeNull();
    expect(
      withLoopbackNativeDefault({
        redirect_uris: ["http://localhost:9999/callback"],
        application_type: "web",
      }),
    ).toBeNull();
    expect(withLoopbackNativeDefault({ redirect_uris: [] })).toBeNull();
    expect(withLoopbackNativeDefault(undefined)).toBeNull();
  });
});

const noop = async () => undefined;
const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => logger,
};

function memoryAuth() {
  const options = buildAuthOptions({
    db: {} as NodePgDatabase,
    baseUrl: "http://localhost:8100",
    secret: "a".repeat(32),
    trustedOrigins: [],
    logger: logger as unknown as CreateAuthOptions["logger"],
    hooks: { beforeUserCreate: noop } as unknown as CreateAuthOptions["hooks"],
    mcp: {
      oauthEnabled: true,
      resource: "http://localhost:8100/mcp",
      loginPage: "http://localhost:8101/login",
      consentPage: "http://localhost:8101/oauth/consent",
      orgPickerPage: "http://localhost:8101/onboarding/select-organization",
    },
  });
  const tables = Object.fromEntries(Object.keys(getSchema(options)).map((model) => [model, []]));
  return betterAuth({ ...options, database: memoryAdapter(tables), telemetry: { enabled: false } });
}

async function register(body: Record<string, unknown>) {
  const res = await memoryAuth().handler(
    new Request("http://localhost:8100/api/auth/oauth2/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe("dynamic client registration", () => {
  it("registers a public MCP client whose redirect is a loopback http URI", async () => {
    const res = await register({
      redirect_uris: ["http://localhost:9999/callback"],
      token_endpoint_auth_method: "none",
    });
    expect(res.status).toBe(201);
    expect(res.body.client_id).toEqual(expect.any(String));
    expect(res.body.application_type).toBe("native");
  });
  it("still rejects a loopback http redirect for a declared web client", async () => {
    const res = await register({
      redirect_uris: ["http://localhost:9999/callback"],
      token_endpoint_auth_method: "none",
      application_type: "web",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_redirect_uri");
  });
  it("still rejects a non-loopback http redirect", async () => {
    const res = await register({
      redirect_uris: ["http://evil.example/callback"],
      token_endpoint_auth_method: "none",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_redirect_uri");
  });
});
```

`adapters/auth/src/verify-access.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { betterAuth } from "better-auth";
import { getSchema } from "better-auth/db";
import { memoryAdapter } from "better-auth/adapters/memory";
import { deriveDpopAth, deriveDpopJkt } from "better-auth/oauth2";
import { signJWT } from "better-auth/plugins";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { type Auth, BetterAuth, buildAuthOptions } from "./better-auth.js";
import type { CreateAuthOptions } from "./types.js";

const RESOURCE = "http://localhost:8100/mcp";
const ISSUER = "http://localhost:8100/api/auth";
const noop = async () => undefined;
const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => logger,
};
const options: CreateAuthOptions = {
  db: {} as NodePgDatabase,
  baseUrl: "http://localhost:8100",
  secret: "a".repeat(32),
  trustedOrigins: [],
  logger: logger as unknown as CreateAuthOptions["logger"],
  hooks: { beforeUserCreate: noop } as unknown as CreateAuthOptions["hooks"],
  mcp: {
    oauthEnabled: true,
    resource: RESOURCE,
    loginPage: "http://localhost:8101/login",
    consentPage: "http://localhost:8101/oauth/consent",
    orgPickerPage: "http://localhost:8101/onboarding/select-organization",
  },
};

type ServerApiKeys = {
  createApiKey(input: { body: { name: string; userId: string } }): Promise<{ key: string }>;
};

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

async function dpopKey() {
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const { kty, crv, x, y } = await crypto.subtle.exportKey("jwk", keys.publicKey);
  const jwk = { kty: kty!, crv: crv!, x: x!, y: y! };
  const proof = async (accessToken: string, claims: Record<string, unknown> = {}) => {
    const header = { typ: "dpop+jwt", alg: "ES256", jwk };
    const payload = {
      jti: randomUUID(),
      htm: "POST",
      htu: RESOURCE,
      iat: Math.floor(Date.now() / 1000),
      ath: await deriveDpopAth(accessToken),
      ...claims,
    };
    const input = `${b64(header)}.${b64(payload)}`;
    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      keys.privateKey,
      Buffer.from(input),
    );
    return `${input}.${Buffer.from(signature).toString("base64url")}`;
  };
  return { jkt: await deriveDpopJkt(jwk), proof };
}

async function setup(verifierOptions: CreateAuthOptions = options) {
  const authOptions = buildAuthOptions(options);
  const tables = Object.fromEntries(
    Object.keys(getSchema(authOptions)).map((model) => [model, []]),
  );
  const auth = betterAuth({
    ...authOptions,
    database: memoryAdapter(tables),
    telemetry: { enabled: false },
  });
  const ctx = await auth.$context;
  const reserved = new Set<string>();
  ctx.internalAdapter.reserveVerificationValue = async ({ identifier }: { identifier: string }) => {
    if (reserved.has(identifier)) {
      return false;
    }
    reserved.add(identifier);
    return true;
  };
  await ctx.adapter.create({
    model: "oauthConsent",
    data: {
      clientId: "client_1",
      userId: "usr_1",
      referenceId: "org_1",
      scopes: ["courses:read", "courses:write"],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  const verifier = new BetterAuth(verifierOptions, auth as unknown as Auth);
  const token = (claims: Record<string, unknown> = {}) =>
    signJWT({ context: ctx } as unknown as Parameters<typeof signJWT>[0], {
      payload: {
        sub: "usr_1",
        client_id: "client_1",
        org_id: "org_1",
        scope: "courses:read courses:write",
        iss: ISSUER,
        aud: RESOURCE,
        ...claims,
      },
    });
  const verify = (authorization: string, proof?: string) =>
    verifier.verifyAccess({
      method: "POST",
      url: RESOURCE,
      headers: { authorization, ...(proof ? { dpop: proof } : {}) },
    });
  const verifyKey = (key: string) =>
    verifier.verifyAccess({ method: "POST", url: RESOURCE, headers: { "x-api-key": key } });
  return { auth, verifier, token, verify, verifyKey };
}

const grant = {
  userId: "usr_1",
  orgId: "org_1",
  clientId: "client_1",
  scopes: ["courses:read", "courses:write"],
};

describe("verifyAccess", () => {
  it("accepts a bearer token without a key binding", async () => {
    const { token, verify } = await setup();
    expect(await verify(`Bearer ${await token()}`)).toEqual(grant);
  });

  it("drops scopes the person has since unticked", async () => {
    const { auth, token, verify } = await setup();
    const ctx = await auth.$context;
    await ctx.adapter.update({
      model: "oauthConsent",
      where: [{ field: "clientId", value: "client_1" }],
      update: { scopes: ["courses:read"] },
    });
    expect(await verify(`Bearer ${await token()}`)).toEqual({ ...grant, scopes: ["courses:read"] });
  });

  it("refuses to move an api key to another organization", async () => {
    const { auth } = await setup();
    const api = auth.api as unknown as { updateApiKey(input: unknown): Promise<unknown> };
    await expect(
      api.updateApiKey({ body: { keyId: "key_1", metadata: { organizationId: "org_2" } } }),
    ).rejects.toMatchObject({ status: "FORBIDDEN" });
  });

  it("keeps only catalogue scopes from the token's scope claim", async () => {
    const { token, verify } = await setup();
    expect(await verify(`Bearer ${await token({ scope: "courses:read offline_access" })}`)).toEqual(
      { ...grant, scopes: ["courses:read"] },
    );
  });

  it("rejects a correctly signed token minted for another audience", async () => {
    const { token, verify } = await setup();
    expect(
      await verify(`Bearer ${await token({ aud: "http://localhost:8100/other" })}`),
    ).toBeNull();
  });

  it("rejects a correctly signed token from another issuer", async () => {
    const { token, verify } = await setup();
    expect(
      await verify(`Bearer ${await token({ iss: "http://localhost:9000/api/auth" })}`),
    ).toBeNull();
  });

  it("accepts a DPoP-bound token with a valid proof", async () => {
    const { token, verify } = await setup();
    const key = await dpopKey();
    const accessToken = await token({ cnf: { jkt: key.jkt } });
    expect(await verify(`DPoP ${accessToken}`, await key.proof(accessToken))).toEqual(grant);
  });

  it("rejects a proof made for another method or URL", async () => {
    const { token, verify } = await setup();
    const key = await dpopKey();
    const accessToken = await token({ cnf: { jkt: key.jkt } });
    expect(
      await verify(`DPoP ${accessToken}`, await key.proof(accessToken, { htm: "GET" })),
    ).toBeNull();
    expect(
      await verify(
        `DPoP ${accessToken}`,
        await key.proof(accessToken, { htu: "http://internal:3000/mcp" }),
      ),
    ).toBeNull();
  });

  it("rejects a replayed proof", async () => {
    const { token, verify } = await setup();
    const key = await dpopKey();
    const accessToken = await token({ cnf: { jkt: key.jkt } });
    const proof = await key.proof(accessToken);
    expect(await verify(`DPoP ${accessToken}`, proof)).toEqual(grant);
    expect(await verify(`DPoP ${accessToken}`, proof)).toBeNull();
  });

  it("rejects a DPoP-bound token without a proof", async () => {
    const { token, verify } = await setup();
    const key = await dpopKey();
    expect(await verify(`DPoP ${await token({ cnf: { jkt: key.jkt } })}`)).toBeNull();
  });

  it("rejects a proof signed by a key the token is not bound to", async () => {
    const { token, verify } = await setup();
    const bound = await dpopKey();
    const other = await dpopKey();
    const accessToken = await token({ cnf: { jkt: bound.jkt } });
    expect(await verify(`DPoP ${accessToken}`, await other.proof(accessToken))).toBeNull();
  });

  it("rejects a DPoP-bound token sent as a bearer token", async () => {
    const { token, verify } = await setup();
    const key = await dpopKey();
    const accessToken = await token({ cnf: { jkt: key.jkt } });
    expect(await verify(`Bearer ${accessToken}`)).toBeNull();
    expect(await verify(`Bearer ${accessToken}`, await key.proof(accessToken))).toBeNull();
  });

  it("rejects every access token when mcp oauth is off", async () => {
    const { token, verify } = await setup({
      ...options,
      mcp: { ...options.mcp, oauthEnabled: false },
    });
    expect(await verify(`Bearer ${await token()}`)).toBeNull();
  });

  it("still requires a live consent for a DPoP-bound token", async () => {
    const { token, verify } = await setup();
    const key = await dpopKey();
    const accessToken = await token({ cnf: { jkt: key.jkt }, client_id: "client_2" });
    expect(await verify(`DPoP ${accessToken}`, await key.proof(accessToken))).toBeNull();
  });
});

describe("api keys", () => {
  it("verifies a key to a grant holding exactly the scopes it was created with", async () => {
    const { verifier, verifyKey } = await setup();
    const created = await verifier.createApiKey({
      authUserId: "usr_1",
      orgId: "org_1",
      name: "CI",
      scopes: ["courses:read"],
    });
    expect(created.scopes).toEqual(["courses:read"]);
    expect(await verifyKey(created.key)).toEqual({
      userId: "usr_1",
      orgId: "org_1",
      scopes: ["courses:read"],
      clientId: `api-key:${created.id}`,
    });
  });

  it("refuses a key created without an organization", async () => {
    const { auth, verifyKey } = await setup();
    const created = await (auth.api as unknown as ServerApiKeys).createApiKey({
      body: { name: "bare", userId: "usr_1" },
    });
    expect(await verifyKey(created.key)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @headless-lms/adapter-auth exec vitest run src/access-grant.test.ts src/client-registration.test.ts src/verify-access.test.ts`
Expected: FAIL — `client-registration.test.ts` with "Failed to load url ./client-registration.js"; in `access-grant.test.ts` every test except the three `needsOrgChoice` ones fails with "TypeError: <helper> is not a function"; every `verify-access.test.ts` test fails with "TypeError: verifier.verifyAccess is not a function" or "verifier.createApiKey is not a function" (the Task 1 constructor ignores the injected instance, so "db.select is not a function" also appears).

- [ ] **Step 3: Write the grant and permission helpers**

`adapters/auth/src/access-grant.ts` (whole file, replaces the Task 1 version):

```ts
import type { AccessGrant } from "@headless-lms/core/types";
import { ORG_CLAIM } from "@headless-lms/core/identity";
import { ACCESS_SCOPES, type AccessScope, isAccessScope } from "@headless-lms/core/organizations";
import { type AccessTokenAuthorization, parseAccessTokenAuthorization } from "better-auth/oauth2";

export function accessTokenAuthorization(
  header: string | string[] | undefined,
): AccessTokenAuthorization | null {
  if (typeof header !== "string") {
    return null;
  }
  const authorization = parseAccessTokenAuthorization(header);
  if (!authorization?.token || authorization.scheme === "Unknown") {
    return null;
  }
  return authorization;
}

export function grantFromClaims(claims: Record<string, unknown>): AccessGrant | null {
  const userId = claims.sub;
  const clientId = claims.client_id ?? claims.azp;
  const orgId = claims[ORG_CLAIM];
  if (typeof userId !== "string" || typeof clientId !== "string" || typeof orgId !== "string") {
    return null;
  }
  const scopes =
    typeof claims.scope === "string" ? claims.scope.split(" ").filter(isAccessScope) : [];
  return { userId, clientId, orgId, scopes };
}

export async function needsOrgChoice(
  activeOrgId: string | null,
  memberOrgIds: () => Promise<readonly string[]>,
): Promise<boolean> {
  if (activeOrgId === null) {
    return true;
  }
  return !(await memberOrgIds()).includes(activeOrgId);
}

export function orgIdFromMetadata(metadata: unknown): string | null {
  let value = metadata;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  const orgId = (value as { organizationId?: unknown } | null)?.organizationId;
  return typeof orgId === "string" ? orgId : null;
}

export function scopesToPermissions(scopes: string[]): Record<string, string[]> {
  const permissions: Record<string, string[]> = {};
  for (const scope of new Set(scopes.filter(isAccessScope))) {
    const separator = scope.indexOf(":");
    const resource = scope.slice(0, separator);
    permissions[resource] = [...(permissions[resource] ?? []), scope.slice(separator + 1)];
  }
  return permissions;
}

export function permissionsToScopes(permissions: unknown): AccessScope[] {
  if (permissions === null || typeof permissions !== "object") {
    return [];
  }
  const granted = new Set<string>();
  for (const [resource, actions] of Object.entries(permissions)) {
    if (Array.isArray(actions)) {
      for (const action of actions) {
        granted.add(`${resource}:${String(action)}`);
      }
    }
  }
  return ACCESS_SCOPES.filter((scope) => granted.has(scope));
}
```

`grantFromClaims` keeps only catalogue scopes from the token's `scope` claim, so `offline_access`, `openid` and unknown values never reach a grant. `scopesToPermissions` maps `courses:read` to `{ courses: ["read"] }` (Better Auth's key permission shape); `permissionsToScopes` maps back, returns scopes in catalogue order and ignores anything that is not a catalogue scope.

- [ ] **Step 4: Write the dynamic-registration default**

`adapters/auth/src/client-registration.ts`:

```ts
export function withLoopbackNativeDefault(body: unknown): Record<string, unknown> | null {
  if (body === null || typeof body !== "object") {
    return null;
  }
  const registration = body as Record<string, unknown>;
  const redirectUris = registration.redirect_uris;
  if (registration.application_type !== undefined || !Array.isArray(redirectUris)) {
    return null;
  }
  const httpsOnly = redirectUris.every(
    (uri) => typeof uri === "string" && uri.toLowerCase().startsWith("https:"),
  );
  return httpsOnly ? null : { ...registration, application_type: "native" };
}
```

Dynamic client registration defaults `application_type` to `web`, which rejects the `http://localhost` redirect URIs MCP clients register. A registration that omits `application_type` and lists any non-https redirect is treated as `native`, so loopback redirects pass and non-loopback `http` is still rejected by Better Auth.

- [ ] **Step 5: Implement verification and app-access admin**

`adapters/auth/src/better-auth.ts` (whole file):

```ts
import type {
  AccessGrant,
  AccessRequest,
  AccessTokenVerifier,
  ActiveSession,
  ApiKeySummary,
  AppAccessAdmin,
  ConnectedApp,
  CreatedApiKey,
  HeaderBag,
  Logger,
  NewApiKey,
  NewOrganizationInput,
  SessionVerifier,
} from "@headless-lms/core/types";
import type { IncomingHttpHeaders } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { APIError, betterAuth, type BetterAuthOptions, type BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import type { CreateAuthOptions } from "./types.js";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import * as authSchema from "@headless-lms/adapter-db/schema/better-auth";
import { prefixId } from "@headless-lms/core/shared/id";
import { customSession, jwt, magicLink, organization } from "better-auth/plugins";
import {
  type AccessTokenAuthorization,
  createDpopReplayStore,
  enforceDpopBinding,
  isDpopBindingError,
  verifyJwsAccessToken,
} from "better-auth/oauth2";
import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { mcp } from "@better-auth/mcp";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { apiKey } from "@better-auth/api-key";
import { eq } from "drizzle-orm";
import { ac, roles } from "./access.js";
import {
  accessTokenAuthorization,
  grantFromClaims,
  needsOrgChoice,
  orgIdFromMetadata,
  permissionsToScopes,
  scopesToPermissions,
} from "./access-grant.js";
import { withLoopbackNativeDefault } from "./client-registration.js";
import {
  ACCESS_SCOPES,
  type AuthHeaders,
  type AuthOrganization,
  type MemberWriteContext,
  type OrgAdmin,
  OrganizationRuleError,
  parseRole,
  type Role,
  type UpdateOrganizationInput,
} from "@headless-lms/core/organizations";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  ORG_CLAIM,
  type SessionAdmin,
} from "@headless-lms/core/identity";

function activeOrgOf(session: unknown): string | null {
  const value = (session as { activeOrganizationId?: string | null } | null)?.activeOrganizationId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function memberOrgIds(db: CreateAuthOptions["db"], userId: string): Promise<string[]> {
  const rows = await db
    .select({ organizationId: authSchema.member.organizationId })
    .from(authSchema.member)
    .where(eq(authSchema.member.userId, userId));
  return rows.map((row) => row.organizationId);
}

function mcpOAuthPlugins(opts: CreateAuthOptions): BetterAuthPlugin[] {
  return [
    mcp({
      resource: opts.mcp.resource,
      loginPage: opts.mcp.loginPage,
      consentPage: opts.mcp.consentPage,
      scopes: [...ACCESS_SCOPES, "offline_access"],
      clientRegistrationDefaultScopes: [...ACCESS_SCOPES, "offline_access"],
      accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      postLogin: {
        page: opts.mcp.orgPickerPage,
        shouldRedirect: ({ session, user }) =>
          needsOrgChoice(activeOrgOf(session), () => memberOrgIds(opts.db, user.id)),
        consentReferenceId: ({ session }) => activeOrgOf(session) ?? undefined,
      },
      customAccessTokenClaims: ({ referenceId }) =>
        referenceId ? { [ORG_CLAIM]: referenceId } : {},
    }) as BetterAuthPlugin,
    cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }) as BetterAuthPlugin,
  ];
}

export function buildAuthOptions(opts: CreateAuthOptions) {
  const {
    sendResetPassword,
    onPasswordReset,
    sendMagicLink,
    beforeUserCreate,
    beforeCreateSession,
  } = opts.hooks;
  const detached =
    <A extends unknown[]>(name: string, hook: (...args: A) => Promise<void>) =>
    async (...args: A): Promise<void> => {
      void hook(...args).catch((err: unknown) =>
        opts.logger.error(`auth hook ${name} failed`, { err }),
      );
    };

  return {
    baseURL: opts.baseUrl,
    secret: opts.secret,
    trustedOrigins: opts.trustedOrigins,
    session: {
      // Signed short-lived cookie cache: avoids a Postgres session lookup on
      // every request. The BFF verifies the session per request (each API call
      // + every SSR getSession), so without this each one is a DB round-trip.
      // The cache holds for maxAge; sign-out / expiry still invalidate it.
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    advanced: {
      database: {
        // Prefixed, KSUID-bodied ids for every better-auth table (usr_, org_, …).
        generateId: () => prefixId("id"),
      },
      // Cross-subdomain shared session cookie for admin/api/web on one parent
      // domain (e.g. `.example.com` in prod). Left unset in local dev so the
      // host-only `localhost` cookie is used, which is already shared across
      // ports (cookies are not port-scoped).
      crossSubDomainCookies: {
        enabled: true,
        domain: opts.cookieDomain || undefined,
      },
      // Same-site cookie for the shared-parent-domain plan. Only switch to
      // `sameSite: "none"` + `secure` if admin and api are genuinely cross-site
      // (different registrable domains).
      defaultCookieAttributes: {
        sameSite: "lax",
        secure: opts.secureCookies ?? false,
        httpOnly: true,
      },
    },
    database: drizzleAdapter(opts.db, {
      provider: "pg",
      schema: authSchema,
    }),
    emailAndPassword: {
      enabled: true,
      // Detached so send time can't reveal which emails have accounts, and a failed notice can't fail the reset.
      sendResetPassword: detached("sendResetPassword", sendResetPassword),
      onPasswordReset: detached("onPasswordReset", onPasswordReset),
      revokeSessionsOnPasswordReset: true,
    },
    plugins: [
      magicLink({
        disableSignUp: true,
        sendMagicLink,
      }),
      organization({
        ac,
        roles,
        creatorRole: "owner",
        organizationHooks: opts.hooks,
      }),
      jwt({ disableSettingJwtHeader: true }) as BetterAuthPlugin,
      ...(opts.mcp.oauthEnabled ? mcpOAuthPlugins(opts) : []),
      apiKey({ enableMetadata: true, rateLimit: { enabled: false } }) as BetterAuthPlugin,
      // Enrich get-session with the caller's memberships (role + org) so BFFs
      // resolve auth in one call instead of fanning out to get-active-member /
      // get-full-organization / organization/list. Custom fields bypass the
      // cookie cache, so this costs one indexed query per get-session.
      customSession(async ({ user, session }) => {
        const memberships = await opts.db
          .select({
            role: authSchema.member.role,
            id: authSchema.organization.id,
            name: authSchema.organization.name,
            slug: authSchema.organization.slug,
          })
          .from(authSchema.member)
          .innerJoin(
            authSchema.organization,
            eq(authSchema.member.organizationId, authSchema.organization.id),
          )
          .where(eq(authSchema.member.userId, user.id));
        const activeOrgId =
          (session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null;
        const active = memberships.find((m) => m.id === activeOrgId) ?? null;
        return {
          user,
          session,
          activeMemberRole: active?.role ?? null,
          activeOrganization: active
            ? { id: active.id, name: active.name, slug: active.slug }
            : null,
          organizations: memberships.map(({ id, name, slug }) => ({ id, name, slug })),
        };
      }),
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/api-key/update" && ctx.body?.metadata !== undefined) {
          throw new APIError("FORBIDDEN", { message: "An API key stays in the organization it was made for" });
        }
        if (ctx.path !== "/oauth2/register") {
          return;
        }
        const body = withLoopbackNativeDefault(ctx.body);
        return body ? { context: { body } } : undefined;
      }),
    },
    databaseHooks: {
      user: {
        create: {
          before: beforeUserCreate,
        },
      },
      session: {
        create: {
          before: beforeCreateSession,
        },
      },
    },
  } satisfies BetterAuthOptions;
}

export function createAuth(opts: CreateAuthOptions) {
  return betterAuth(buildAuthOptions(opts));
}

export type Auth = ReturnType<typeof createAuth>;

type JSONWebKeySet = { keys: Array<Record<string, unknown>> };

type PluginApiKey = {
  id: string;
  name: string | null;
  start: string | null;
  referenceId: string;
  metadata: unknown;
  permissions: Record<string, string[]> | null;
  createdAt: Date;
  lastRequest: Date | null;
};

type PluginApi = {
  getJwks(): Promise<JSONWebKeySet>;
  verifyApiKey(input: {
    body: { key: string };
  }): Promise<{ valid: boolean; key: PluginApiKey | null }>;
  createApiKey(input: {
    body: {
      name: string;
      userId: string;
      metadata: Record<string, unknown>;
      permissions: Record<string, string[]>;
    };
  }): Promise<PluginApiKey & { key: string }>;
  listApiKeys(input: { headers: Headers }): Promise<{ apiKeys: PluginApiKey[] }>;
  deleteApiKey(input: { body: { keyId: string }; headers: Headers }): Promise<unknown>;
};

export class BetterAuth
  implements SessionVerifier, OrgAdmin, SessionAdmin, AccessTokenVerifier, AppAccessAdmin
{
  protected auth: Auth;
  protected logger: Logger;
  protected mcp: CreateAuthOptions["mcp"];
  protected issuer: string;

  constructor(opts: CreateAuthOptions, auth?: Auth) {
    this.auth = auth ?? createAuth(opts);
    this.logger = opts.logger;
    this.mcp = opts.mcp;
    this.issuer = `${opts.baseUrl.replace(/\/+$/, "")}/api/auth`;
  }

  protected get pluginApi(): PluginApi {
    return this.auth.api as unknown as PluginApi;
  }

  async handler(request: Request): Promise<Response> {
    return this.auth.handler(request);
  }

  async authorizationServerMetadata(request: Request): Promise<Response> {
    return oauthProviderAuthServerMetadata(
      this.auth as unknown as Parameters<typeof oauthProviderAuthServerMetadata>[0],
    )(request);
  }

  async verifyAccess(request: AccessRequest): Promise<AccessGrant | null> {
    const apiKeyHeader = request.headers["x-api-key"];
    if (typeof apiKeyHeader === "string" && apiKeyHeader.length > 0) {
      return this.verifyApiKey(apiKeyHeader);
    }
    const authorization = accessTokenAuthorization(request.headers.authorization);
    return authorization && this.mcp.oauthEnabled
      ? this.verifyAccessToken(authorization, request)
      : null;
  }

  protected async verifyAccessToken(
    authorization: AccessTokenAuthorization,
    request: AccessRequest,
  ): Promise<AccessGrant | null> {
    let claims: Awaited<ReturnType<typeof verifyJwsAccessToken>>;
    try {
      claims = await verifyJwsAccessToken(authorization.token, {
        jwksFetch: async () => this.pluginApi.getJwks(),
        verifyOptions: { audience: this.mcp.resource, issuer: this.issuer },
      });
    } catch {
      return null;
    }
    const ctx = await this.auth.$context;
    const proof = request.headers.dpop;
    try {
      await enforceDpopBinding({
        payload: claims,
        authorization,
        proofJwt: typeof proof === "string" ? proof : undefined,
        method: request.method,
        url: request.url,
        replayStore: createDpopReplayStore(ctx.internalAdapter),
      });
    } catch (error) {
      if (isDpopBindingError(error)) {
        return null;
      }
      throw error;
    }
    const grant = grantFromClaims(claims);
    if (!grant) {
      return null;
    }
    const consent = await ctx.adapter.findOne<{ scopes: string[] }>({
      model: "oauthConsent",
      where: [
        { field: "clientId", value: grant.clientId },
        { field: "userId", value: grant.userId },
        { field: "referenceId", value: grant.orgId },
      ],
    });
    return consent
      ? { ...grant, scopes: grant.scopes.filter((scope) => consent.scopes.includes(scope)) }
      : null;
  }

  protected async verifyApiKey(key: string): Promise<AccessGrant | null> {
    const result = await this.pluginApi.verifyApiKey({ body: { key } });
    if (!result.valid || !result.key) {
      return null;
    }
    const orgId = orgIdFromMetadata(result.key.metadata);
    if (!orgId) {
      return null;
    }
    return {
      userId: result.key.referenceId,
      orgId,
      scopes: permissionsToScopes(result.key.permissions),
      clientId: `api-key:${result.key.id}`,
    };
  }

  protected async sessionUserId(headers: HeaderBag): Promise<string> {
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(headers) });
    if (!session) {
      throw new OrganizationRuleError("No session");
    }
    return session.user.id;
  }

  async listConnectedApps(headers: HeaderBag, orgId: string): Promise<ConnectedApp[]> {
    const userId = await this.sessionUserId(headers);
    if (!this.mcp.oauthEnabled) {
      return [];
    }
    const ctx = await this.auth.$context;
    const consents = await ctx.adapter.findMany<{
      clientId: string;
      scopes: string[];
      createdAt: Date | null;
    }>({
      model: "oauthConsent",
      where: [
        { field: "userId", value: userId },
        { field: "referenceId", value: orgId },
      ],
    });
    return Promise.all(
      consents.map(async (consent) => {
        const client = await ctx.adapter.findOne<{ name: string | null; icon: string | null }>({
          model: "oauthClient",
          where: [{ field: "clientId", value: consent.clientId }],
        });
        return {
          clientId: consent.clientId,
          name: client?.name ?? consent.clientId,
          iconUrl: client?.icon ?? null,
          scopes: consent.scopes,
          connectedAt: consent.createdAt ?? new Date(0),
        };
      }),
    );
  }

  async revokeConnectedApp(headers: HeaderBag, orgId: string, clientId: string): Promise<void> {
    const userId = await this.sessionUserId(headers);
    if (!this.mcp.oauthEnabled) {
      return;
    }
    const ctx = await this.auth.$context;
    const where = [
      { field: "clientId", value: clientId },
      { field: "userId", value: userId },
      { field: "referenceId", value: orgId },
    ];
    await ctx.adapter.deleteMany({ model: "oauthAccessToken", where });
    await ctx.adapter.deleteMany({ model: "oauthRefreshToken", where });
    await ctx.adapter.deleteMany({ model: "oauthConsent", where });
  }

  async listApiKeys(headers: HeaderBag, orgId: string): Promise<ApiKeySummary[]> {
    const res = await this.pluginApi.listApiKeys({ headers: fromNodeHeaders(headers) });
    return res.apiKeys
      .filter((key) => orgIdFromMetadata(key.metadata) === orgId)
      .map((key) => ({
        id: key.id,
        name: key.name ?? null,
        start: key.start ?? null,
        scopes: permissionsToScopes(key.permissions),
        createdAt: new Date(key.createdAt),
        lastUsedAt: key.lastRequest ? new Date(key.lastRequest) : null,
      }));
  }

  async createApiKey(input: NewApiKey): Promise<CreatedApiKey> {
    const created = await this.pluginApi.createApiKey({
      body: {
        name: input.name,
        userId: input.authUserId,
        metadata: { organizationId: input.orgId },
        permissions: scopesToPermissions(input.scopes),
      },
    });
    return {
      id: created.id,
      name: created.name ?? null,
      start: created.start ?? null,
      scopes: permissionsToScopes(created.permissions),
      createdAt: new Date(created.createdAt),
      lastUsedAt: null,
      key: created.key,
    };
  }

  async deleteApiKey(headers: HeaderBag, orgId: string, keyId: string): Promise<void> {
    const owned = await this.listApiKeys(headers, orgId);
    if (!owned.some((key) => key.id === keyId)) {
      throw new OrganizationRuleError("That API key does not exist");
    }
    await this.pluginApi.deleteApiKey({ body: { keyId }, headers: fromNodeHeaders(headers) });
  }

  async verify(headers: IncomingHttpHeaders): Promise<ActiveSession | null> {
    const res = await this.auth.api.getSession({ headers: fromNodeHeaders(headers) });
    if (!res) {
      return null;
    }
    return {
      user: {
        id: res.user.id,
        createdAt: res.user.createdAt,
        email: res.user.email,
        firstName: res.user.name,
        externalId: res.user.id,
        lastName: res.user.name,
        updatedAt: res.user.updatedAt,
      },
      session: {
        // customSession erases the org plugin's session extension from the
        // inferred type; the field is still present at runtime.
        activeOrganizationId:
          (res.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null,
      },
    };
  }

  /** Stamps the org onto the caller's session row. The 5-minute cookie cache
   *  still holds the pre-stamp session, so callers refresh it client-side with
   *  `getSession({ disableCookieCache: true })`. */
  async stampActiveOrganization(headers: AuthHeaders, orgId: string): Promise<boolean> {
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(headers) });
    const token = (session?.session as { token?: string } | undefined)?.token;
    if (!token) {
      return false;
    }
    const ctx = await this.auth.$context;
    await ctx.internalAdapter.updateSession(token, { activeOrganizationId: orgId });
    return true;
  }

  async createOrganization(
    headers: AuthHeaders,
    input: NewOrganizationInput,
  ): Promise<AuthOrganization> {
    const org = await this.auth.api.createOrganization({
      body: { name: input.name, slug: input.slug },
      headers: fromNodeHeaders(headers),
    });
    if (!org) {
      throw new Error(`Couldn't create organization`);
    }
    return { id: org.id, name: org.name, slug: org.slug, createdAt: org.createdAt };
  }
  async setActiveOrganization(headers: AuthHeaders, externalId: string): Promise<void> {
    await this.auth.api.setActiveOrganization({
      body: { organizationId: externalId },
      headers: fromNodeHeaders(headers),
    });
  }
  async updateOrganization(
    headers: AuthHeaders,
    externalId: string,
    input: UpdateOrganizationInput,
  ): Promise<AuthOrganization> {
    try {
      const org = await this.auth.api.updateOrganization({
        body: { organizationId: externalId, data: { name: input.name, slug: input.slug } },
        headers: fromNodeHeaders(headers),
      });
      if (!org) {
        throw new Error(`Couldn't update organization`);
      }
      return { id: org.id, name: org.name, slug: org.slug, createdAt: org.createdAt };
    } catch (err) {
      // Surface Better Auth validation/permission failures (e.g. slug taken) as
      // a domain rule error the route maps to 409 rather than a raw 500.
      if (err instanceof APIError) {
        throw new OrganizationRuleError(err.message || "Could not update organization");
      }
      throw err;
    }
  }
  async deleteOrganization(headers: AuthHeaders, externalId: string): Promise<void> {
    try {
      await this.auth.api.deleteOrganization({
        body: { organizationId: externalId },
        headers: fromNodeHeaders(headers),
      });
    } catch (err) {
      if (err instanceof APIError) {
        throw new OrganizationRuleError(err.message || "Could not delete organization");
      }
      throw err;
    }
  }
  async grantMembership(
    orgExternalId: string,
    userExternalId: string,
    role: string,
  ): Promise<void> {
    // Server-side (no session): the accepted invitation is the authorisation.
    try {
      await this.auth.api.addMember({
        body: { userId: userExternalId, organizationId: orgExternalId, role: parseRole(role) },
      });
    } catch (err) {
      if (
        err instanceof APIError &&
        err.body?.code === "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION"
      ) {
        return;
      }
      throw err;
    }
  }
  async updateRole(ctx: MemberWriteContext, userExternalId: string, role: Role): Promise<void> {
    await this.auth.api.updateMemberRole({
      body: {
        memberId: await this.resolveMemberId(ctx, userExternalId),
        role,
        organizationId: ctx.authOrgId,
      },
      headers: this.headersOf(ctx),
    });
  }
  async removeMember(ctx: MemberWriteContext, userExternalId: string): Promise<void> {
    await this.auth.api.removeMember({
      body: {
        memberIdOrEmail: await this.resolveMemberId(ctx, userExternalId),
        organizationId: ctx.authOrgId,
      },
      headers: this.headersOf(ctx),
    });
  }

  protected headersOf(ctx: MemberWriteContext): Headers {
    return fromNodeHeaders(ctx.headers);
  }

  // Better Auth's member endpoints key on its own member id, which the domain
  // deliberately does not store — `(org, user)` already identifies the record,
  // so it is looked up here instead of mirrored into org_users.
  protected async resolveMemberId(
    ctx: MemberWriteContext,
    userExternalId: string,
  ): Promise<string> {
    const res = await this.auth.api.listMembers({
      query: {
        organizationId: ctx.authOrgId,
        filterField: "userId",
        filterValue: userExternalId,
        limit: 1,
      },
      headers: this.headersOf(ctx),
    });
    const memberId = res?.members?.[0]?.id;
    if (!memberId) {
      throw new OrganizationRuleError("That person is no longer a member of this organization");
    }
    return memberId;
  }
}
```

Changes against the Task 1 file, for review:
- Imports: the new core types, `createAuthMiddleware`, the `better-auth/oauth2` DPoP and JWS helpers, `oauthProviderAuthServerMetadata`, the access-grant helpers and `withLoopbackNativeDefault`.
- `buildAuthOptions` gains `hooks.before`, which rewrites the body of `POST /oauth2/register` through `withLoopbackNativeDefault` and refuses `POST /api-key/update` when it carries `metadata`, so a key stays bound to its org.
- `PluginApiKey` / `PluginApi` are the local typed accessor for the plugin endpoints that the `BetterAuthPlugin` casts (Task 1, TS7056) erased from `auth.api`. `PluginApiKey` carries `permissions`; `createApiKey`'s body is the server-side shape (`name`, `userId`, `metadata`, `permissions`, no `headers`).
- `verifyAccess`: an `x-api-key` header is verified as an API key (grant scopes = `permissionsToScopes(key.permissions)`; a key without `metadata.organizationId` → `null`). Otherwise the `Authorization` header must be `Bearer` or `DPoP`, and with OAuth off every token → `null`. The JWT is verified against the JWKS with audience = the MCP resource and issuer = `${baseUrl}/api/auth`; `enforceDpopBinding` checks the proof (method, public resource URL as `htu`, `iat`, `ath`, `cnf.jkt`) with replay protection through `createDpopReplayStore(ctx.internalAdapter)`, and refuses a DPoP-bound token sent as `Bearer`; finally a consent row for (clientId, userId, referenceId = org) must still exist, and the grant keeps only the scopes that consent still holds, so a narrower re-consent takes effect even for tokens minted from an older refresh token.
- `listConnectedApps` / `revokeConnectedApp` resolve the session user first, then are no-ops (`[]` / return) when OAuth is off. Revoke deletes access tokens, then refresh tokens, then the consent.
- `listApiKeys` keeps the session user's keys whose metadata names the org and maps `scopes` from `permissions`; `createApiKey` creates the key server-side for `input.authUserId` with `metadata.organizationId = input.orgId` and `permissions = scopesToPermissions(input.scopes)`; `deleteApiKey` refuses a key that is not in that org-filtered list.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @headless-lms/adapter-auth exec vitest run src/access-grant.test.ts src/client-registration.test.ts src/verify-access.test.ts`
Expected: PASS (`access-grant.test.ts` 17 tests, `client-registration.test.ts` 5 tests, `verify-access.test.ts` 16 tests).

- [ ] **Step 7: Full verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @headless-lms/adapter-auth build
```

Expected: all exit 0 (the adapter build is the TS7056 check).

- [ ] **Step 8: Commit**

```bash
git add adapters/auth/src/access-grant.ts adapters/auth/src/access-grant.test.ts adapters/auth/src/client-registration.ts adapters/auth/src/client-registration.test.ts adapters/auth/src/better-auth.ts adapters/auth/src/verify-access.test.ts
git commit -m "feat(auth): verify mcp credentials and manage connected apps and scoped api keys"
```

---

### Task 3: Server plumbing — shared error classification, scope resolution, metadata routes, web bridge, form posts

**Files:**
- Create: `packages/server/src/http/errors.ts`
- Create: `packages/server/src/http/errors.test.ts`
- Modify: `packages/server/src/http/plugins/error-handler.ts`
- Modify: `packages/server/src/http/scope.ts`
- Modify: `packages/server/src/http/scope.test.ts`
- Modify: `packages/server/src/http/web-bridge.ts`
- Modify: `packages/server/src/http/plugins/auth.ts`
- Modify: `packages/server/src/http/plugins/auth.test.ts`
- Create: `packages/server/src/http/well-known.ts`
- Create: `packages/server/src/http/well-known.test.ts`
- Modify: `packages/server/src/http/server.ts`
- Create: `packages/server/src/http/mcp/challenge.ts`
- Create: `packages/server/src/http/mcp/challenge.test.ts`

**Interfaces:**
- Consumes:
  - `ACCESS_SCOPES` (readonly tuple of the 21 scopes) from `@headless-lms/core/organizations` (Task 1).
  - `interface McpAuthOptions { oauthEnabled: boolean; resource: string; loginPage: string; consentPage: string; orgPickerPage: string }` exported from `@headless-lms/adapter-auth`; `CreateAuthOptions.mcp: McpAuthOptions`; `BetterAuth.authorizationServerMetadata(request: Request): Promise<Response>` (Task 2).
  - `McpEndpoints`, `mcpEndpoints()` in `packages/server/src/app/mcp-endpoints.ts` and `Container.mcp: McpEndpoints` (Task 1, which also wires the auth options and the `BETTER_AUTH_URL` warning into the container).
- Produces:
  - `interface ClassifiedError { status: number; code: string; message: string }` and `classifyError(error: unknown): ClassifiedError | null` in `packages/server/src/http/errors.ts` (shared by the REST error handler and MCP). `ForbiddenError` → `{ status: 403, code: 'forbidden' }`, `NoActiveOrgError` → 403 `forbidden`, `UnauthorizedError` → 401 `unauthorized`.
  - `resolveScopeFor(container: Container, authUserId: string, authOrgId: string): Promise<OrgScope>` in `packages/server/src/http/scope.ts` (throws `NoActiveOrgError` for unknown org, unknown user, no org user, or a non-staff role).
  - `toWebRequest(request: FastifyRequest, origin: string): Request` and `bridgeWebResponse(response: Response, reply: FastifyReply): Promise<void>` in `packages/server/src/http/web-bridge.ts`.
  - `registerWellKnown(app: FastifyInstance, container: Container): void` in `packages/server/src/http/well-known.ts`, registered by `buildServer` only when `container.mcp.oauthEnabled`.
  - `unauthorized(mcp: McpEndpoints): Response` in `packages/server/src/http/mcp/challenge.ts`.

Test commands run the root `test` script (`vitest run` with the root `vitest.config.ts`, whose aliases resolve `@headless-lms/*` to source, so nothing has to be built first).

- [ ] **Step 1: Write the failing test for `classifyError`**

`packages/server/src/http/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError } from '@headless-lms/core/shared/errors';
import { classifyError } from './errors.js';

describe('classifyError', () => {
  it('maps domain errors to status, code and message', () => {
    expect(classifyError(new NotFoundError('Course', 'crs_1'))).toMatchObject({
      status: 404,
      code: 'not_found',
    });
    expect(classifyError(new ConflictError('taken'))).toEqual({
      status: 409,
      code: 'conflict',
      message: 'taken',
    });
  });
  it('passes through 4xx errors that carry a status code', () => {
    expect(
      classifyError(Object.assign(new Error('bad'), { statusCode: 400, code: 'FST_ERR' })),
    ).toEqual({ status: 400, code: 'FST_ERR', message: 'bad' });
  });
  it('returns null for unknown errors', () => {
    expect(classifyError(new Error('boom'))).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test packages/server/src/http/errors.test.ts`
Expected: FAIL with "Failed to load url ./errors.js"

- [ ] **Step 3: Extract `classifyError` and route the REST error handler through it**

`packages/server/src/http/errors.ts`:

```ts
import { ConflictError, ForbiddenError, NotFoundError } from '@headless-lms/core/shared/errors';
import { OrganizationRuleError } from '@headless-lms/core/organizations';
import {
  ActionInvocationError,
  AlreadyConnectedError,
  InvalidConfigError,
  UnknownIntegrationError,
} from '@headless-lms/core/integrations';
import {
  AutomationKindMismatchError,
  InvalidTriggerError,
  ReservedActionError,
} from '@headless-lms/core/automations';
import { NoActiveOrgError } from './scope.js';
import { UnauthorizedError } from './plugins/auth.js';

export interface ClassifiedError {
  status: number;
  code: string;
  message: string;
}

const RULES: Array<[abstract new (...args: never[]) => Error, number, string]> = [
  [NotFoundError, 404, 'not_found'],
  [ConflictError, 409, 'conflict'],
  [ForbiddenError, 403, 'forbidden'],
  [OrganizationRuleError, 409, 'conflict'],
  [AlreadyConnectedError, 409, 'already_connected'],
  [UnknownIntegrationError, 400, 'unknown_integration'],
  [InvalidConfigError, 400, 'invalid_config'],
  [ActionInvocationError, 502, 'action_failed'],
  [InvalidTriggerError, 400, 'invalid_trigger'],
  [ReservedActionError, 400, 'reserved_action'],
  [AutomationKindMismatchError, 409, 'kind_mismatch'],
  [NoActiveOrgError, 403, 'forbidden'],
  [UnauthorizedError, 401, 'unauthorized'],
];

export function classifyError(error: unknown): ClassifiedError | null {
  for (const [type, status, code] of RULES) {
    if (error instanceof type) {
      return { status, code, message: error.message };
    }
  }
  const err = error as { statusCode?: number; code?: string; message?: string };
  if (typeof err?.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500) {
    return {
      status: err.statusCode,
      code: err.code ?? 'bad_request',
      message: err.message ?? 'Bad request',
    };
  }
  return null;
}
```

`packages/server/src/http/plugins/error-handler.ts` — replace the whole file with:

```ts
import type { FastifyReply, FastifyRequest } from 'fastify';
import { classifyError } from '../errors.js';

export function errorHandler(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  const known = classifyError(error);
  if (known) {
    return reply.status(known.status).send({ error: known.code, message: known.message });
  }
  request.log.error({ err: error }, `unhandled error in ${request.method} ${request.url}`);
  return reply.status(500).send({ error: 'internal_error', requestId: request.id });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test packages/server/src/http/errors.test.ts packages/server/src/http/plugins/error-handler.test.ts`
Expected: PASS (the new `errors.test.ts` and the unchanged `error-handler.test.ts`, which proves the REST mapping is behaviour-preserving)

- [ ] **Step 5: Write the failing test for `resolveScopeFor`**

`packages/server/src/http/scope.test.ts` — three exact edits.

Edit 1. Before:

```ts
import { resolveScope, NoActiveOrgError } from './scope.js';
```

After:

```ts
import { resolveScope, resolveScopeFor, NoActiveOrgError } from './scope.js';
```

Edit 2. Before:

```ts
      getById: async () => opts.org ?? null,
      getOrgUser: async (orgId: string, userId: string) =>
```

After:

```ts
      getById: async () => opts.org ?? null,
      getByExternalId: async (id: string) => (id === opts.org?.id ? opts.org : null),
      getOrgUser: async (orgId: string, userId: string) =>
```

Edit 3. Append to the end of the file:

```ts

describe('resolveScopeFor', () => {
  const full = container({ org: acme, user: { id: 'usr_1' }, orgUsers: owner });

  it('resolves the staff scope for an auth user and org', async () => {
    const scope = await resolveScopeFor(full, 'usr_1', 'org_1');
    expect(scope).toEqual({
      orgId: 'org_1',
      userId: 'usr_1',
      orgUserId: 'orm_1',
      role: 'owner',
      authOrgId: 'org_1',
    });
  });

  it('refuses a student org user', async () => {
    await expect(
      resolveScopeFor(
        container({
          org: acme,
          user: { id: 'usr_1' },
          orgUsers: { 'org_1:usr_1': { id: 'orm_1', orgId: 'org_1', role: 'student' } },
        }),
        'usr_1',
        'org_1',
      ),
    ).rejects.toBeInstanceOf(NoActiveOrgError);
  });

  it('refuses a user with no org user in that org', async () => {
    await expect(
      resolveScopeFor(
        container({ org: acme, user: { id: 'usr_1' }, orgUsers: {} }),
        'usr_1',
        'org_1',
      ),
    ).rejects.toBeInstanceOf(NoActiveOrgError);
  });

  it('refuses an unknown org', async () => {
    await expect(resolveScopeFor(full, 'usr_1', 'org_missing')).rejects.toBeInstanceOf(
      NoActiveOrgError,
    );
  });

  it('refuses an unknown user', async () => {
    await expect(resolveScopeFor(full, 'usr_missing', 'org_1')).rejects.toBeInstanceOf(
      NoActiveOrgError,
    );
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm test packages/server/src/http/scope.test.ts`
Expected: FAIL — the five `resolveScopeFor` tests fail with "resolveScopeFor is not a function"; the existing `resolveScope` tests still pass.

- [ ] **Step 7: Implement `resolveScopeFor`**

`packages/server/src/http/scope.ts` — append to the end of the file (leave `resolveScope` unchanged):

```ts

export async function resolveScopeFor(
  container: Container,
  authUserId: string,
  authOrgId: string,
): Promise<OrgScope> {
  const org = await container.organizations.getByExternalId(authOrgId);
  if (!org) {
    throw new NoActiveOrgError('active organization not found');
  }
  const user = await container.identity.getUserByExternalId(authUserId);
  if (!user) {
    throw new NoActiveOrgError('no domain user for the current user');
  }
  const orgUser = await container.organizations.getOrgUser(org.id, user.id);
  if (!orgUser || !isStaffRole(orgUser.role)) {
    throw new NoActiveOrgError('not a staff member of the active organization');
  }
  container.requestContext.set({ orgId: org.id });
  return { orgId: org.id, userId: user.id, orgUserId: orgUser.id, role: orgUser.role, authOrgId };
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm test packages/server/src/http/scope.test.ts`
Expected: PASS

- [ ] **Step 9: Write the failing tests for form posts and the public-origin request url**

`packages/server/src/http/plugins/auth.test.ts` — three exact edits.

Edit 1. Before:

```ts
import type { Container } from '../../app/container.js';
import { registerAuth } from './auth.js';
```

After:

```ts
import type { Container } from '../../app/container.js';
import { mcpEndpoints } from '../../app/mcp-endpoints.js';
import { registerAuth } from './auth.js';
```

Edit 2. Before:

```ts
const container = {
  auth: { verify: async () => SESSION, handler: async () => new Response(null) },
```

After:

```ts
const container = {
  mcp: mcpEndpoints({
    authBaseURL: 'https://lms.example.com',
    adminAppUrl: 'https://admin.example.com',
  }),
  auth: { verify: async () => SESSION, handler: async () => new Response(null) },
```

Edit 3. Append to the end of the file:

```ts

describe('better-auth catch-all', () => {
  it('forwards form-encoded bodies verbatim', async () => {
    const echo = Fastify();
    registerAuth(echo, {
      ...container,
      auth: {
        ...container.auth,
        handler: async (request: Request) =>
          new Response(
            JSON.stringify({
              type: request.headers.get('content-type'),
              body: await request.text(),
            }),
            { headers: { 'content-type': 'application/json' } },
          ),
      },
    } as unknown as Container);
    await echo.ready();
    const res = await echo.inject({
      method: 'POST',
      url: '/api/auth/oauth2/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'grant_type=authorization_code&code=abc',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      type: 'application/x-www-form-urlencoded',
      body: 'grant_type=authorization_code&code=abc',
    });
    await echo.close();
  });

  it('builds the request url on the public api origin, not the internal host', async () => {
    const echo = Fastify();
    registerAuth(echo, {
      ...container,
      auth: {
        ...container.auth,
        handler: async (request: Request) => new Response(JSON.stringify({ url: request.url })),
      },
    } as unknown as Container);
    await echo.ready();
    const res = await echo.inject({
      method: 'POST',
      url: '/api/auth/oauth2/token?x=1',
      headers: { host: 'api:8000', 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'grant_type=authorization_code&code=abc',
    });
    expect(res.json()).toEqual({ url: 'https://lms.example.com/api/auth/oauth2/token?x=1' });
    await echo.close();
  });
});
```

- [ ] **Step 10: Run the test to verify it fails**

Run: `pnpm test packages/server/src/http/plugins/auth.test.ts`
Expected: FAIL — "forwards form-encoded bodies verbatim" fails with "expected 415 to be 200" (Fastify has no parser for `application/x-www-form-urlencoded`), and the public-origin test fails on the same 415 body.

- [ ] **Step 11: Build Better Auth requests on the public origin and accept form posts**

`packages/server/src/http/web-bridge.ts` — one exact edit. Before:

```ts
export function toWebRequest(request: FastifyRequest): Request {
  const url = new URL(request.url, `http://${request.headers.host}`);
```

After:

```ts
export function toWebRequest(request: FastifyRequest, origin: string): Request {
  const url = new URL(request.url, origin);
```

The URL Better Auth sees is now the configured public API origin rather than whatever `Host` the proxy forwarded, so the DPoP proof's `htu` and the token endpoint's own URL agree.

`packages/server/src/http/plugins/auth.ts` — two exact edits.

Edit 1. Before:

```ts
  const { auth } = appServer;
```

After:

```ts
  const { auth } = appServer;
  const origin = new URL(appServer.mcp.issuer).origin;

  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, body, done) => {
      done(null, body);
    },
  );
```

Edit 2. Before:

```ts
      await bridgeWebResponse(await auth.handler(toWebRequest(request)), reply);
```

After:

```ts
      await bridgeWebResponse(await auth.handler(toWebRequest(request, origin)), reply);
```

- [ ] **Step 12: Run the test to verify it passes**

Run: `pnpm test packages/server/src/http/plugins/auth.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 13: Write the failing test for the metadata routes**

`packages/server/src/http/well-known.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { ACCESS_SCOPES } from '@headless-lms/core/organizations';
import type { Container } from '../app/container.js';
import { mcpEndpoints } from '../app/mcp-endpoints.js';
import { registerWellKnown } from './well-known.js';

const mcp = mcpEndpoints({
  authBaseURL: 'http://localhost:8100',
  adminAppUrl: 'http://localhost:8101',
});
const seenUrls: string[] = [];
const container = {
  mcp,
  auth: {
    authorizationServerMetadata: async (request: Request) => {
      seenUrls.push(request.url);
      return new Response(JSON.stringify({ issuer: mcp.issuer }), {
        headers: { 'content-type': 'application/json' },
      });
    },
  },
} as unknown as Container;

let app: FastifyInstance;
beforeAll(async () => {
  app = Fastify();
  registerWellKnown(app, container);
  await app.ready();
});
afterAll(async () => app.close());

describe('well-known metadata', () => {
  it('serves protected resource metadata for /mcp', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/.well-known/oauth-protected-resource/mcp',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      resource: 'http://localhost:8100/mcp',
      authorization_servers: ['http://localhost:8100/api/auth'],
      scopes_supported: [...ACCESS_SCOPES],
      bearer_methods_supported: ['header'],
    });
  });
  it('serves the same document at the root path', async () => {
    const res = await app.inject({ method: 'GET', url: '/.well-known/oauth-protected-resource' });
    expect(res.json().resource).toBe('http://localhost:8100/mcp');
  });
  it('serves authorization server metadata at the RFC 8414 path-inserted url', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/.well-known/oauth-authorization-server/api/auth',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ issuer: 'http://localhost:8100/api/auth' });
  });
  it('hands the auth server a request on the public api origin', async () => {
    seenUrls.length = 0;
    await app.inject({
      method: 'GET',
      url: '/.well-known/oauth-authorization-server/api/auth',
      headers: { host: 'api:8000' },
    });
    expect(seenUrls).toEqual([
      'http://localhost:8100/.well-known/oauth-authorization-server/api/auth',
    ]);
  });
});
```

- [ ] **Step 14: Run the test to verify it fails**

Run: `pnpm test packages/server/src/http/well-known.test.ts`
Expected: FAIL with "Failed to load url ./well-known.js"

- [ ] **Step 15: Implement the metadata routes and register them when OAuth is on**

`packages/server/src/http/well-known.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { ACCESS_SCOPES } from '@headless-lms/core/organizations';
import type { Container } from '../app/container.js';
import { bridgeWebResponse, toWebRequest } from './web-bridge.js';

export function registerWellKnown(app: FastifyInstance, container: Container): void {
  const origin = new URL(container.mcp.issuer).origin;
  const resourceMetadata = () => ({
    resource: container.mcp.resource,
    authorization_servers: [container.mcp.issuer],
    scopes_supported: [...ACCESS_SCOPES],
    bearer_methods_supported: ['header'],
  });
  const hidden = { schema: { hide: true } };

  app.get('/.well-known/oauth-protected-resource/mcp', hidden, async () => resourceMetadata());
  app.get('/.well-known/oauth-protected-resource', hidden, async () => resourceMetadata());
  app.get('/.well-known/oauth-authorization-server/api/auth', hidden, async (request, reply) => {
    await bridgeWebResponse(
      await container.auth.authorizationServerMetadata(toWebRequest(request, origin)),
      reply,
    );
  });
}
```

`packages/server/src/http/server.ts` — two exact edits.

Edit 1. Before:

```ts
import { registerAuth } from './plugins/auth.js';
import { errorHandler } from './plugins/error-handler.js';
```

After:

```ts
import { registerAuth } from './plugins/auth.js';
import { registerWellKnown } from './well-known.js';
import { errorHandler } from './plugins/error-handler.js';
```

Edit 2. Before:

```ts
  registerAuth(app, container);

  registerRoutes(app, container);
```

After:

```ts
  registerAuth(app, container);
  if (container.mcp.oauthEnabled) {
    registerWellKnown(app, container);
  }

  registerRoutes(app, container);
```

Note for Task 5 (not part of this task): the `/mcp` route is registered in this same file. Task 5 adds `import { registerMcp } from './mcp/route.js';` directly below `import { registerRoutes } from './routes.js';`, and the line `registerMcp(app, container);` directly below `registerRoutes(app, container);` (unconditionally — API keys work with OAuth off). Do not add either line in this task.

- [ ] **Step 16: Run the test to verify it passes**

Run: `pnpm test packages/server/src/http/well-known.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 17: Write the failing test for the 401 challenge**

`packages/server/src/http/mcp/challenge.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mcpEndpoints } from '../../app/mcp-endpoints.js';
import { unauthorized } from './challenge.js';

const mcp = mcpEndpoints({
  authBaseURL: 'http://localhost:8100',
  adminAppUrl: 'http://localhost:8101',
});

describe('unauthorized', () => {
  it('answers 401 with a JSON-RPC error that points at the protected resource metadata', async () => {
    const res = unauthorized(mcp);
    expect(res.status).toBe(401);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(await res.json()).toEqual({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Unauthorized' },
      id: null,
    });
    expect(res.headers.get('www-authenticate')).toBe(
      'Bearer resource_metadata="http://localhost:8100/.well-known/oauth-protected-resource/mcp", scope="courses:read courses:write courses:delete downloads:read downloads:write downloads:delete bundles:read bundles:write bundles:delete media:read students:read students:write students:invite access:read access:write analytics:read automations:read automations:write automations:delete comments:read comments:moderate"',
    );
  });
});
```

- [ ] **Step 18: Run the test to verify it fails**

Run: `pnpm test packages/server/src/http/mcp/challenge.test.ts`
Expected: FAIL with "Failed to load url ./challenge.js"

- [ ] **Step 19: Implement `unauthorized`**

`packages/server/src/http/mcp/challenge.ts`:

```ts
import { ACCESS_SCOPES } from '@headless-lms/core/organizations';
import type { McpEndpoints } from '../../app/mcp-endpoints.js';

export function unauthorized(mcp: McpEndpoints): Response {
  const body = { jsonrpc: '2.0', error: { code: -32000, message: 'Unauthorized' }, id: null };
  return new Response(JSON.stringify(body), {
    status: 401,
    headers: {
      'content-type': 'application/json',
      'www-authenticate': `Bearer resource_metadata="${mcp.resourceMetadataUrl}", scope="${ACCESS_SCOPES.join(' ')}"`,
    },
  });
}
```

- [ ] **Step 20: Run the test to verify it passes**

Run: `pnpm test packages/server/src/http/mcp/challenge.test.ts`
Expected: PASS (1 test)

- [ ] **Step 21: Verify the whole server package**

Run: `pnpm test packages/server`
Expected: PASS (every server test file, including the existing `error-handler.test.ts`, `scope.test.ts`, `auth.test.ts`, `container.test.ts`)

Run: `pnpm --filter @headless-lms/server typecheck`
Expected: exits 0

Run: `pnpm lint`
Expected: exits 0

- [ ] **Step 22: Commit**

```bash
git add packages/server/src/http/errors.ts packages/server/src/http/errors.test.ts packages/server/src/http/plugins/error-handler.ts packages/server/src/http/scope.ts packages/server/src/http/scope.test.ts packages/server/src/http/web-bridge.ts packages/server/src/http/plugins/auth.ts packages/server/src/http/plugins/auth.test.ts packages/server/src/http/well-known.ts packages/server/src/http/well-known.test.ts packages/server/src/http/server.ts packages/server/src/http/mcp/challenge.ts packages/server/src/http/mcp/challenge.test.ts
git commit -m "feat(server): oauth metadata routes, form posts and shared error classification"
```

---

### Task 4: Update schemas stop applying create defaults

`UpdateCourse` and `UpdateDownload` are built with `.partial()` over create schemas that default `description` and `category` to `''`. Zod 4 still applies those defaults inside `.partial()`, so an update that only sets `status` blanks both fields. `update_course` and `update_download` reuse these schemas, so this is fixed first, in the shared contract, for REST and the tools together.

**Files:**
- Modify: `packages/server/src/http/schemas/content.ts`
- Modify: `packages/server/src/http/schemas/downloads.ts`
- Test: `packages/server/src/http/schemas/update-schemas.test.ts`
- Regenerated: `packages/sdk/openapi.json` and `packages/sdk/src/generated/*` if the generator changes them

**Interfaces:**
- Consumes: nothing new.
- Produces: `UpdateCourse` and `UpdateDownload` whose parse output contains only the fields that were sent. Same exported names and types.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { CreateCourse, UpdateCourse } from './content.js';
import { CreateDownload, UpdateDownload } from './downloads.js';

describe('update schemas', () => {
  it('keep only the fields that were sent', () => {
    expect(UpdateCourse.parse({ status: 'published' })).toEqual({ status: 'published' });
    expect(UpdateDownload.parse({ status: 'published' })).toEqual({ status: 'published' });
  });

  it('still validate the fields they share with create', () => {
    expect(UpdateCourse.safeParse({ title: '' }).success).toBe(false);
    expect(UpdateDownload.safeParse({ title: '' }).success).toBe(false);
  });

  it('leave the create defaults in place', () => {
    expect(CreateCourse.parse({ title: 'Intro' })).toEqual({ title: 'Intro', description: '', category: '' });
    expect(CreateDownload.parse({ title: 'Kit' })).toEqual({ title: 'Kit', description: '', category: '' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/server/src/http/schemas/update-schemas.test.ts`
Expected: FAIL. The first test receives `{ status: 'published', description: '', category: '' }`.

- [ ] **Step 3: Rebuild the two update schemas without the defaults**

In `packages/server/src/http/schemas/content.ts` replace

```ts
export const UpdateCourse = CreateCourse.partial().extend({
  status: CourseStatus.optional(),
  /** null clears the cover. */
  thumbnailAssetId: z.string().nullable().optional(),
});
```

with

```ts
export const UpdateCourse = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  status: CourseStatus.optional(),
  /** null clears the cover. */
  thumbnailAssetId: z.string().nullable().optional(),
});
```

In `packages/server/src/http/schemas/downloads.ts` replace

```ts
export const UpdateDownload = CreateDownload.partial().extend({
  status: DownloadStatus.optional(),
  thumbnailAssetId: z.string().nullable().optional(),
});
```

with

```ts
export const UpdateDownload = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  status: DownloadStatus.optional(),
  thumbnailAssetId: z.string().nullable().optional(),
});
```

The `/** null clears the cover. */` line already exists and stays as it is. Add no new comments.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run packages/server/src/http/schemas/update-schemas.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Regenerate the SDK and check the REST suite**

Run: `BETTER_AUTH_URL=http://localhost:8000 pnpm gen:sdk`
`gen:openapi` takes the server URL from `BETTER_AUTH_URL`, and the worktree `.env` says 8100. A variable already set in the shell wins over `--env-file`, so this keeps the generated base URL at `http://localhost:8000`.
Expected: `packages/sdk/openapi.json` loses `"default": ""` on the `description`/`category` properties of the update-course and update-download request bodies, and `git diff packages/sdk/src/generated/client.gen.ts` is empty. The generated TS types may not change.

Run: `pnpm vitest run packages/server`
Expected: PASS. A failure means a route relied on the blanking. Read that test and fix the route's test data, never the schema.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/http/schemas/content.ts packages/server/src/http/schemas/downloads.ts packages/server/src/http/schemas/update-schemas.test.ts packages/sdk
git commit -m "fix(api): keep course and download updates from blanking unsent fields"
```

---

### Task 5: The `/mcp` route, the tool definition and the tool runner

A tool is data plus one call. The runner and the route do everything else, the same way for every tool. Tools reach a connection only when it was granted the tool's scope and the person's role still holds it.

**Files:**
- Create: `packages/server/src/http/mcp/tool.ts`
- Create: `packages/server/src/http/mcp/input-schema.ts`
- Create: `packages/server/src/http/mcp/server.ts`
- Create: `packages/server/src/http/mcp/route.ts`
- Create: `packages/server/src/http/mcp/tools/index.ts`
- Create: `packages/server/src/http/mcp/test-support.ts`
- Modify: `packages/server/src/http/server.ts`
- Modify: `packages/server/package.json`, `pnpm-lock.yaml`
- Test: `packages/server/src/http/mcp/tool.test.ts`, `packages/server/src/http/mcp/input-schema.test.ts`, `packages/server/src/http/mcp/route.test.ts`

**Interfaces:**
- Consumes: `ACCESS_SCOPES`, `AccessScope`, `roleHoldsScope`, `StaffRole` from `@headless-lms/core/organizations` (Task 1); `AccessGrant` from `@headless-lms/core/types` (Task 1); `container.auth.verifyAccess`, `container.mcp` (Tasks 2–3); `resolveScopeFor`, `NoActiveOrgError`, `OrgScope` from `../scope.js` (Task 3); `classifyError` from `../errors.js` (Task 3); `unauthorized` from `./challenge.js` (Task 3); `mcpEndpoints` (Task 3).
- Produces:
  - `defineTool<Input extends z.ZodObject>(def: ToolDef<Input>): Tool`
  - `Tool { name; title; description; scope: AccessScope; kind: ToolKind; idempotent: boolean; openWorld: boolean; input: z.ZodObject; call(input: unknown, ctx: ToolContext): unknown }`
  - `ToolKind = 'read' | 'write' | 'destructive'`
  - `ToolContext { container: Container; scope: OrgScope; requestId: string }`
  - `noInput` (an empty `z.object({})`)
  - `runTool(tool, args, ctx): Promise<ToolResult>`, `toToolResult(data)`, `toolError(message)`
  - `toolInputSchema(schema: z.ZodObject): StandardSchemaWithJSON<unknown, unknown>`
  - `createToolServer(ctx: ToolContext, tools: readonly Tool[]): McpServer`
  - `registerMcp(app, container, tools = TOOLS)`
  - `TOOLS: Tool[]` in `tools/index.ts`, starting empty. Tasks 6–9 fill it.
  - Test helpers in `test-support.ts`: `ORG`, `USER`, `ORG_USER`, `fakeContainer`, `toolContext`, `listTools`, `callTool`, `ToolSpec`, `toolSpecs`, `ToolCase`, `runCase`.

- [ ] **Step 1: Add the MCP SDK to the server package**

Run: `pnpm --filter @headless-lms/server add --save-exact --config.package-import-method=copy @modelcontextprotocol/server@2.3.1 @modelcontextprotocol/node@2.1.1`
Expected: `packages/server/package.json` lists `"@modelcontextprotocol/server": "2.3.1"` and `"@modelcontextprotocol/node": "2.1.1"`. Packages are copied into the worktree's `node_modules`, never symlinked to another checkout.

- [ ] **Step 2: Write the tool definition and runner tests**

`packages/server/src/http/mcp/tool.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import { classifyError } from '../errors.js';
import { fakeContainer, toolContext } from './test-support.js';
import { defineTool, runTool } from './tool.js';

function tool(call: (input: { id: string }) => unknown) {
  return defineTool({
    name: 'probe',
    title: 'Probe',
    description: 'Probe',
    scope: 'courses:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: z.object({ id: z.string() }),
    call: (input) => call(input),
  });
}

const ctx = () => toolContext(fakeContainer());

describe('runTool', () => {
  it('passes the parsed input to the call and returns its result', async () => {
    const seen: unknown[] = [];
    const result = await runTool(tool((input) => (seen.push(input), { a: 1 })), { id: 'x' }, ctx());
    expect(seen).toEqual([{ id: 'x' }]);
    expect(result).toEqual({ content: [{ type: 'text', text: '{"a":1}' }], structuredContent: { a: 1 } });
  });

  it('wraps a list result', async () => {
    const result = await runTool(tool(() => [1, 2]), { id: 'x' }, ctx());
    expect(result.structuredContent).toEqual({ result: [1, 2] });
  });

  it('answers ok when the call returns nothing', async () => {
    const result = await runTool(tool(() => undefined), { id: 'x' }, ctx());
    expect(result.structuredContent).toEqual({ ok: true });
  });

  it('answers not found when the call returns null or false', async () => {
    for (const value of [null, false]) {
      const result = await runTool(tool(() => value), { id: 'x' }, ctx());
      expect(result).toEqual({ content: [{ type: 'text', text: 'Not found.' }], isError: true });
    }
  });

  it('reports invalid input without calling', async () => {
    const call = vi.fn();
    const result = await runTool(tool(call), {}, ctx());
    expect(call).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/^Invalid input: /);
  });

  it('classifies service errors the way REST does', async () => {
    const error = new NotFoundError('Course', 'crs_1');
    const result = await runTool(tool(() => Promise.reject(error)), { id: 'x' }, ctx());
    expect(result).toEqual({ content: [{ type: 'text', text: classifyError(error)?.message }], isError: true });
  });

  it('hides internal errors behind the request id and logs them', async () => {
    const container = fakeContainer();
    const logged = vi.spyOn(container.logger, 'error');
    const result = await runTool(tool(() => Promise.reject(new Error('db down'))), { id: 'x' }, toolContext(container));
    expect(result).toEqual({ content: [{ type: 'text', text: 'Internal error (request req_test)' }], isError: true });
    expect(logged).toHaveBeenCalledWith('mcp tool failed', expect.objectContaining({ tool: 'probe' }));
  });
});
```

`packages/server/src/http/mcp/input-schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toolInputSchema } from './input-schema.js';

describe('toolInputSchema', () => {
  it('describes dates as date-time strings', () => {
    const schema = toolInputSchema(z.object({ at: z.coerce.date().nullable(), name: z.string() }));
    const json = schema['~standard'].jsonSchema.input({ target: 'draft-2020-12' }) as {
      type: string;
      properties: Record<string, unknown>;
    };
    expect(json.type).toBe('object');
    expect(json.properties.name).toEqual({ type: 'string' });
    expect(JSON.stringify(json.properties.at)).toContain('"format":"date-time"');
  });

  it('leaves validation to the runner, so input is parsed exactly once', async () => {
    const schema = toolInputSchema(z.object({ reported: z.stringbool() }));
    expect(await schema['~standard'].validate({ reported: 'true' })).toEqual({ value: { reported: 'true' } });
  });
});
```

- [ ] **Step 3: Write the route tests**

`packages/server/src/http/mcp/route.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ACCESS_SCOPES } from '@headless-lms/core/organizations';
import type { AccessRequest } from '@headless-lms/core/types';
import type { Container } from '../../app/container.js';
import { registerMcp } from './route.js';
import { fakeContainer } from './test-support.js';
import { defineTool, type Tool } from './tool.js';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const ran: string[] = [];

function probe(name: string, scope: Tool['scope'], kind: Tool['kind']) {
  return defineTool({
    name,
    title: name,
    description: name,
    scope,
    kind,
    idempotent: kind !== 'write',
    openWorld: false,
    input: z.object({}),
    call: () => (ran.push(name), { ran: name }),
  });
}

const PROBES = [
  probe('read_x', 'courses:read', 'read'),
  probe('write_x', 'courses:write', 'write'),
  probe('delete_x', 'courses:delete', 'destructive'),
];

async function build(container: Container) {
  app = Fastify();
  registerMcp(app, container, PROBES);
  await app.ready();
  return app;
}

const granted = (scopes: string[], role = 'owner') =>
  fakeContainer({
    auth: { verifyAccess: async () => ({ userId: 'usr_1', orgId: 'org_1', scopes, clientId: 'client_1' }) },
    organizations: { getOrgUser: async () => ({ id: 'ou_1', orgId: 'org_1', userId: 'usr_1', role }) },
  });

const legacyHeaders = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
  'mcp-protocol-version': '2025-11-25',
  authorization: 'Bearer token',
};
const listPayload = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} };
const parseSse = (text: string) =>
  JSON.parse(text.split('\n').find((line) => line.startsWith('data: '))!.slice(6));

async function listed(container: Container) {
  const server = await build(container);
  const res = await server.inject({ method: 'POST', url: '/mcp', headers: legacyHeaders, payload: listPayload });
  expect(res.statusCode).toBe(200);
  return parseSse(res.body).result.tools.map((tool: { name: string }) => tool.name);
}

describe('POST /mcp credentials', () => {
  it('challenges a request without a valid credential, naming every scope', async () => {
    const server = await build(fakeContainer({ auth: { verifyAccess: async () => null } }));
    const res = await server.inject({ method: 'POST', url: '/mcp', headers: legacyHeaders, payload: listPayload });
    expect(res.statusCode).toBe(401);
    expect(res.headers['www-authenticate']).toBe(
      `Bearer resource_metadata="http://localhost:8100/.well-known/oauth-protected-resource/mcp", scope="${ACCESS_SCOPES.join(' ')}"`,
    );
  });

  it('challenges a person who is a student in the org', async () => {
    const server = await build(granted([...ACCESS_SCOPES], 'student'));
    const res = await server.inject({ method: 'POST', url: '/mcp', headers: legacyHeaders, payload: listPayload });
    expect(res.statusCode).toBe(401);
  });

  it('challenges a person with no org user in the org', async () => {
    const server = await build(fakeContainer({ organizations: { getOrgUser: async () => null } }));
    const res = await server.inject({ method: 'POST', url: '/mcp', headers: legacyHeaders, payload: listPayload });
    expect(res.statusCode).toBe(401);
  });

  it('challenges a grant for an organization that does not exist', async () => {
    const server = await build(fakeContainer({ organizations: { getByExternalId: async () => null } }));
    const res = await server.inject({ method: 'POST', url: '/mcp', headers: legacyHeaders, payload: listPayload });
    expect(res.statusCode).toBe(401);
  });

  it('verifies the credential against the public resource URL, not the Host header', async () => {
    const seen: AccessRequest[] = [];
    const server = await build(
      fakeContainer({
        auth: {
          verifyAccess: async (request: AccessRequest) => {
            seen.push(request);
            return null;
          },
        },
      }),
    );
    await server.inject({
      method: 'POST',
      url: '/mcp',
      headers: { ...legacyHeaders, host: 'internal:3000', authorization: 'DPoP token', dpop: 'proof' },
      payload: listPayload,
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ method: 'POST', url: 'http://localhost:8100/mcp' });
    expect(seen[0]?.headers).toMatchObject({ authorization: 'DPoP token', dpop: 'proof' });
  });
});

describe('POST /mcp tool list', () => {
  it('lists only the tools whose scope was granted', async () => {
    expect(await listed(granted(['courses:read', 'courses:write']))).toEqual(['read_x', 'write_x']);
  });

  it('hides delete tools unless their scope was granted', async () => {
    expect(await listed(granted(['courses:read']))).toEqual(['read_x']);
    expect(await listed(granted(['courses:read', 'courses:delete']))).toEqual(['read_x', 'delete_x']);
  });

  it('never lists a tool the role cannot hold, whatever was granted', async () => {
    expect(await listed(granted(['courses:read', 'courses:write', 'courses:delete'], 'instructor'))).toEqual(['read_x']);
  });

  it('does not run a tool outside the list', async () => {
    ran.length = 0;
    const server = await build(granted(['courses:read']));
    const res = await server.inject({
      method: 'POST',
      url: '/mcp',
      headers: legacyHeaders,
      payload: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'write_x', arguments: {} } },
    });
    const body = parseSse(res.body);
    expect(body.error ?? body.result?.isError).toBeTruthy();
    expect(ran).toEqual([]);
  });

  it('runs a granted tool', async () => {
    ran.length = 0;
    const server = await build(granted(['courses:read']));
    const res = await server.inject({
      method: 'POST',
      url: '/mcp',
      headers: legacyHeaders,
      payload: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'read_x', arguments: {} } },
    });
    expect(parseSse(res.body).result.structuredContent).toEqual({ ran: 'read_x' });
    expect(ran).toEqual(['read_x']);
  });

  it('serves a 2026-07-28 client', async () => {
    const server = await build(granted(['courses:read']));
    const res = await server.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/list',
        authorization: 'Bearer token',
      },
      payload: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().result.tools.map((tool: { name: string }) => tool.name)).toEqual(['read_x']);
  });
});

describe('other methods on /mcp', () => {
  it('answers 405 to GET and DELETE', async () => {
    const server = await build(fakeContainer());
    for (const method of ['GET', 'DELETE'] as const) {
      const res = await server.inject({ method, url: '/mcp' });
      expect(res.statusCode).toBe(405);
      expect(res.headers.allow).toBe('POST');
    }
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pnpm vitest run packages/server/src/http/mcp`
Expected: FAIL. The modules `./tool.js`, `./input-schema.js`, `./route.js` and `./test-support.js` do not exist.

- [ ] **Step 5: Write `tool.ts`**

```ts
import { z } from 'zod';
import type { AccessScope } from '@headless-lms/core/organizations';
import type { Container } from '../../app/container.js';
import { classifyError } from '../errors.js';
import type { OrgScope } from '../scope.js';

export interface ToolContext {
  container: Container;
  scope: OrgScope;
  requestId: string;
}

export type ToolKind = 'read' | 'write' | 'destructive';

export interface Tool {
  name: string;
  title: string;
  description: string;
  scope: AccessScope;
  kind: ToolKind;
  idempotent: boolean;
  openWorld: boolean;
  input: z.ZodObject;
  call(input: unknown, ctx: ToolContext): unknown;
}

export interface ToolDef<Input extends z.ZodObject> extends Omit<Tool, 'input' | 'call'> {
  input: Input;
  call(input: z.output<Input>, ctx: ToolContext): unknown;
}

export const noInput = z.object({});

export function defineTool<Input extends z.ZodObject>(def: ToolDef<Input>): Tool {
  return { ...def, call: (input, ctx) => def.call(input as z.output<Input>, ctx) };
}

export interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export function toolError(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

export function toToolResult(data: unknown): ToolResult {
  const plain: unknown = JSON.parse(JSON.stringify(data === undefined ? { ok: true } : data));
  const structuredContent =
    plain !== null && typeof plain === 'object' && !Array.isArray(plain)
      ? (plain as Record<string, unknown>)
      : { result: plain };
  return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
}

function describeFailure(error: unknown, tool: Tool, ctx: ToolContext): string {
  if (error instanceof z.ZodError) {
    return `Invalid input: ${z.prettifyError(error)}`;
  }
  const known = classifyError(error);
  if (known && known.status < 500) {
    return known.message;
  }
  ctx.container.logger.error('mcp tool failed', {
    err: error instanceof Error ? error : new Error(String(error)),
    tool: tool.name,
  });
  return `Internal error (request ${ctx.requestId})`;
}

export async function runTool(tool: Tool, args: unknown, ctx: ToolContext): Promise<ToolResult> {
  try {
    const result = await tool.call(tool.input.parse(args), ctx);
    return result === null || result === false ? toolError('Not found.') : toToolResult(result);
  } catch (error) {
    return toolError(describeFailure(error, tool, ctx));
  }
}
```

If `classifyError` (Task 3) names its fields differently than `status` and `message`, use its real field names here and in `tool.test.ts`; do not change `classifyError`.

- [ ] **Step 6: Write `input-schema.ts`**

```ts
import { z } from 'zod';
import type { StandardSchemaWithJSON } from '@modelcontextprotocol/server';

export function toolInputSchema(schema: z.ZodObject): StandardSchemaWithJSON<unknown, unknown> {
  const json = z.toJSONSchema(schema, {
    io: 'input',
    target: 'draft-2020-12',
    unrepresentable: 'any',
    override: (ctx) => {
      if (ctx.zodSchema._zod.def.type === 'date') {
        ctx.jsonSchema.type = 'string';
        ctx.jsonSchema.format = 'date-time';
      }
    },
  }) as Record<string, unknown>;
  return {
    '~standard': {
      version: 1,
      vendor: 'zod',
      validate: (value: unknown) => ({ value }),
      jsonSchema: { input: () => json, output: () => json },
    },
  } as StandardSchemaWithJSON<unknown, unknown>;
}
```

- [ ] **Step 7: Write `server.ts`**

```ts
import { McpServer } from '@modelcontextprotocol/server';
import { toolInputSchema } from './input-schema.js';
import { runTool, type Tool, type ToolContext } from './tool.js';

export const MCP_INSTRUCTIONS =
  'Manage one organization of a headless LMS: courses and their modules, downloads, bundles, media, students and their access, analytics, workflows and webhooks, and comment moderation. You only see the tools this connection was granted. Lists that take page and pageSize are paginated. Activity content cannot be written here.';

export function createToolServer(ctx: ToolContext, tools: readonly Tool[]): McpServer {
  const server = new McpServer({ name: 'headless-lms', version: '0.1.0' }, { instructions: MCP_INSTRUCTIONS });
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: toolInputSchema(tool.input),
        annotations: {
          title: tool.title,
          readOnlyHint: tool.kind === 'read',
          destructiveHint: tool.kind === 'destructive',
          idempotentHint: tool.idempotent,
          openWorldHint: tool.openWorld,
        },
      },
      async (args: unknown) => runTool(tool, args, ctx),
    );
  }
  return server;
}
```

- [ ] **Step 8: Write `route.ts` and the empty registry**

`packages/server/src/http/mcp/tools/index.ts`:

```ts
import type { Tool } from '../tool.js';

export const TOOLS: Tool[] = [];
```

`packages/server/src/http/mcp/route.ts`:

```ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { toWebRequest } from '@modelcontextprotocol/node';
import { roleHoldsScope } from '@headless-lms/core/organizations';
import type { Container } from '../../app/container.js';
import { NoActiveOrgError, resolveScopeFor, type OrgScope } from '../scope.js';
import { unauthorized } from './challenge.js';
import { createToolServer } from './server.js';
import type { Tool, ToolContext } from './tool.js';
import { TOOLS } from './tools/index.js';

type Connection = { context: ToolContext; tools: Tool[] };

export function registerMcp(app: FastifyInstance, container: Container, tools: readonly Tool[] = TOOLS): void {
  const handler = createMcpHandler(
    (ctx) => {
      const connection = ctx.authInfo?.extra?.connection as Connection | undefined;
      if (!connection) {
        throw new Error('mcp connection missing');
      }
      return createToolServer(connection.context, connection.tools);
    },
    {
      legacy: 'stateless',
      onerror: (err) => container.logger.error('mcp handler error', { err }),
    },
  );

  const webRequest = async (request: FastifyRequest, reply: FastifyReply) => {
    const abort = new AbortController();
    reply.raw.on('close', () => {
      if (!reply.raw.writableFinished) {
        abort.abort();
      }
    });
    return toWebRequest(request.raw, request.body, { signal: abort.signal });
  };

  app.post('/mcp', { schema: { hide: true } }, async (request, reply) => {
    const grant = await container.auth.verifyAccess({
      method: request.method,
      url: container.mcp.resource,
      headers: request.headers,
    });
    if (!grant) {
      return reply.send(unauthorized(container.mcp));
    }
    let scope: OrgScope;
    try {
      scope = await resolveScopeFor(container, grant.userId, grant.orgId);
    } catch (error) {
      if (error instanceof NoActiveOrgError) {
        return reply.send(unauthorized(container.mcp));
      }
      throw error;
    }
    const connection: Connection = {
      context: { container, scope, requestId: request.id },
      tools: tools.filter((tool) => grant.scopes.includes(tool.scope) && roleHoldsScope(scope.role, tool.scope)),
    };
    const response = await handler.fetch(await webRequest(request, reply), {
      authInfo: { token: '', clientId: grant.clientId, scopes: grant.scopes, extra: { connection } },
      parsedBody: request.body,
    });
    return reply.send(response);
  });

  app.route({
    method: ['GET', 'DELETE'],
    url: '/mcp',
    schema: { hide: true },
    handler: async (_request, reply) =>
      reply
        .code(405)
        .header('allow', 'POST')
        .header('content-type', 'application/json')
        .send({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null }),
  });
}
```

- [ ] **Step 9: Register the route in `packages/server/src/http/server.ts`**

Add the import next to the other `./` imports:

```ts
import { registerMcp } from './mcp/route.js';
```

and call it directly after `registerRoutes(app, container);`:

```ts
  registerRoutes(app, container);
  registerMcp(app, container);
```

- [ ] **Step 10: Write `test-support.ts`**

```ts
import { expect } from 'vitest';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { ACCESS_SCOPES, type AccessScope, type StaffRole } from '@headless-lms/core/organizations';
import type { Container } from '../../app/container.js';
import { mcpEndpoints } from '../../app/mcp-endpoints.js';
import { createToolServer } from './server.js';
import { toToolResult, type Tool, type ToolContext, type ToolKind } from './tool.js';
import { TOOLS } from './tools/index.js';

export const ORG = { id: 'org_1', name: 'Acme', slug: 'acme', externalId: 'org_1' };
export const USER = { id: 'usr_1', email: 'owner@acme.test', firstName: 'Ada', lastName: 'Lovelace', externalId: 'usr_1' };
export const ORG_USER = { id: 'ou_1', orgId: 'org_1', userId: 'usr_1', role: 'owner' };

export function fakeContainer(overrides: Record<string, unknown> = {}): Container {
  const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, child: () => logger };
  const base: Record<string, unknown> = {
    mcp: mcpEndpoints({ authBaseURL: 'http://localhost:8100', adminAppUrl: 'http://localhost:8101' }),
    logger,
    requestContext: { set: () => {}, run: (_ctx: unknown, fn: () => void) => fn() },
    auth: {
      verifyAccess: async () => ({ userId: USER.id, orgId: ORG.id, scopes: [...ACCESS_SCOPES], clientId: 'client_1' }),
    },
    organizations: {
      getById: async (id: string) => (id === ORG.id ? ORG : null),
      getByExternalId: async (id: string) => (id === ORG.externalId ? ORG : null),
      getOrgUser: async (orgId: string, userId: string) => (orgId === ORG.id && userId === USER.id ? ORG_USER : null),
    },
    identity: {
      getUserByExternalId: async (id: string) => (id === USER.id ? USER : null),
      getUserById: async (id: string) => (id === USER.id ? USER : null),
    },
  };
  for (const [key, value] of Object.entries(overrides)) {
    const current = base[key];
    base[key] =
      current && typeof current === 'object' && value && typeof value === 'object' && !Array.isArray(value)
        ? { ...(current as object), ...(value as object) }
        : value;
  }
  return base as unknown as Container;
}

export function toolContext(container: Container, role: StaffRole = 'owner'): ToolContext {
  return {
    container,
    scope: { orgId: ORG.id, userId: USER.id, orgUserId: ORG_USER.id, role, authOrgId: ORG.id },
    requestId: 'req_test',
  };
}

const MODERN_META = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientCapabilities': {},
};

async function rpc(
  ctx: ToolContext,
  tools: readonly Tool[],
  method: string,
  params: Record<string, unknown>,
  name?: string,
) {
  const handler = createMcpHandler(() => createToolServer(ctx, tools));
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'mcp-protocol-version': '2026-07-28',
    'mcp-method': method,
  };
  if (name) {
    headers['mcp-name'] = name;
  }
  const response = await handler.fetch(
    new Request('http://localhost:8100/mcp', {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: { ...params, _meta: MODERN_META } }),
    }),
  );
  const body = (await response.json()) as { result?: Record<string, unknown>; error?: { message: string } };
  if (body.error) {
    throw new Error(body.error.message);
  }
  return body.result as Record<string, unknown>;
}

export async function listTools(ctx: ToolContext, tools: readonly Tool[] = TOOLS) {
  const result = await rpc(ctx, tools, 'tools/list', {});
  return result.tools as Array<{
    name: string;
    annotations?: Record<string, unknown>;
    inputSchema: { type?: string; properties?: Record<string, unknown> };
  }>;
}

export async function callTool(name: string, args: unknown, ctx: ToolContext, tools: readonly Tool[] = TOOLS) {
  return (await rpc(ctx, tools, 'tools/call', { name, arguments: args }, name)) as {
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
    content: Array<{ type: string; text?: string }>;
  };
}

export type ToolSpec = [name: string, scope: AccessScope, kind: ToolKind, idempotent: boolean, openWorld: boolean];

export function toolSpecs(tools: readonly Tool[]): ToolSpec[] {
  return tools.map((tool) => [tool.name, tool.scope, tool.kind, tool.idempotent, tool.openWorld]);
}

export type ToolCase = {
  tool: string;
  args: Record<string, unknown>;
  service: string;
  expected: unknown[];
  returns?: unknown;
};

function serviceFake(path: string, returns: unknown, calls: unknown[][]): Record<string, unknown> {
  const keys = path.split('.');
  const method = keys.pop() ?? '';
  let node: Record<string, unknown> = {
    [method]: async (...args: unknown[]) => {
      calls.push(args);
      return returns;
    },
  };
  for (const key of keys.reverse()) {
    node = { [key]: node };
  }
  return node;
}

export async function runCase(tools: readonly Tool[], c: ToolCase): Promise<void> {
  const calls: unknown[][] = [];
  const returns = 'returns' in c ? c.returns : { id: 'result' };
  const ctx = toolContext(fakeContainer(serviceFake(c.service, returns, calls)));
  const result = await callTool(c.tool, c.args, ctx, tools);
  expect(result.isError ?? false).toBe(false);
  expect(calls).toEqual([c.expected]);
  expect(result.structuredContent).toEqual(toToolResult(returns).structuredContent);
}
```

- [ ] **Step 11: Run the tests to verify they pass**

Run: `pnpm vitest run packages/server/src/http/mcp`
Expected: PASS (`tool.test.ts` 7, `input-schema.test.ts` 2, `route.test.ts` 12).

If the 2025-11-25 response body is plain JSON rather than SSE in this SDK version, `parseSse` fails. Check the response's `content-type`, and parse `res.json()` when it is `application/json`. The old branch's route tests used SSE for 2025-11-25 with this exact `accept` header.

- [ ] **Step 12: Typecheck and lint**

Run: `pnpm --filter @headless-lms/server typecheck && pnpm lint`
Expected: both exit 0.

- [ ] **Step 13: Commit**

```bash
git add packages/server/src/http/mcp packages/server/src/http/server.ts packages/server/package.json pnpm-lock.yaml
git commit -m "feat(mcp): serve /mcp with tools filtered by granted scope and role"
```

---

### Task 6: Course tools

Ten tools. Each is one call to `container.content`, with input built only from existing REST schemas.

**Files:**
- Create: `packages/server/src/http/mcp/tools/courses.ts`
- Modify: `packages/server/src/http/mcp/tools/index.ts`
- Test: `packages/server/src/http/mcp/tools/courses.test.ts`

**Interfaces:**
- Consumes: `defineTool`, `Tool` (Task 5); `CoursesQuery`, `CreateCourse`, `UpdateCourse` (Task 4), `PatchCourseSettings`, `CreateModule`, `UpdateModule`, `ReorderInput`, `CourseIdPathParam`, `ModulePathParam` from `../../schemas/index.js`; test helpers (Task 5).
- Produces: `courseTools: Tool[]`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { runCase, toolSpecs, type ToolCase } from '../test-support.js';
import { courseTools } from './courses.js';

const cases: ToolCase[] = [
  { tool: 'list_courses', args: { page: 2 }, service: 'content.listCourses', expected: ['org_1', { page: 2, pageSize: 20 }] },
  { tool: 'list_modules', args: { courseId: 'crs_1' }, service: 'content.listCourseModules', expected: ['org_1', 'crs_1'], returns: [{ id: 'mod_1' }] },
  {
    tool: 'create_course',
    args: { title: 'Intro' },
    service: 'content.createCourse',
    expected: ['org_1', { title: 'Intro', description: '', category: '' }],
  },
  {
    tool: 'update_course',
    args: { courseId: 'crs_1', status: 'published' },
    service: 'content.updateCourse',
    expected: ['org_1', 'crs_1', { status: 'published' }],
  },
  {
    tool: 'update_course_settings',
    args: { courseId: 'crs_1', transcriptDownloads: true },
    service: 'content.patchCourseSettings',
    expected: ['org_1', 'crs_1', { transcriptDownloads: true }],
  },
  {
    tool: 'create_module',
    args: { courseId: 'crs_1', title: 'Week 1' },
    service: 'content.createModule',
    expected: ['org_1', 'crs_1', 'Week 1'],
    returns: [{ id: 'mod_1' }],
  },
  {
    tool: 'rename_module',
    args: { courseId: 'crs_1', moduleId: 'mod_1', title: 'Week one' },
    service: 'content.updateModule',
    expected: ['org_1', 'crs_1', 'mod_1', 'Week one'],
    returns: [{ id: 'mod_1' }],
  },
  {
    tool: 'reorder_modules',
    args: { courseId: 'crs_1', orderedIds: ['mod_2', 'mod_1'] },
    service: 'content.reorderModules',
    expected: ['org_1', 'crs_1', ['mod_2', 'mod_1']],
    returns: [{ id: 'mod_2' }, { id: 'mod_1' }],
  },
  { tool: 'delete_course', args: { courseId: 'crs_1' }, service: 'content.deleteCourse', expected: ['org_1', 'crs_1'], returns: undefined },
  {
    tool: 'delete_module',
    args: { courseId: 'crs_1', moduleId: 'mod_1' },
    service: 'content.deleteModule',
    expected: ['org_1', 'crs_1', 'mod_1'],
    returns: [],
  },
];

describe('course tools', () => {
  it('declare their scope and hints', () => {
    expect(toolSpecs(courseTools)).toEqual([
      ['list_courses', 'courses:read', 'read', true, false],
      ['list_modules', 'courses:read', 'read', true, false],
      ['create_course', 'courses:write', 'write', false, false],
      ['update_course', 'courses:write', 'write', true, false],
      ['update_course_settings', 'courses:write', 'write', true, false],
      ['create_module', 'courses:write', 'write', false, false],
      ['rename_module', 'courses:write', 'write', true, false],
      ['reorder_modules', 'courses:write', 'write', true, false],
      ['delete_course', 'courses:delete', 'destructive', true, false],
      ['delete_module', 'courses:delete', 'destructive', true, false],
    ]);
  });

  it.each(cases)('$tool calls $service once', (c) => runCase(courseTools, c));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/server/src/http/mcp/tools/courses.test.ts`
Expected: FAIL with "Cannot find module './courses.js'".

- [ ] **Step 3: Write `courses.ts`**

```ts
import {
  CourseIdPathParam,
  CoursesQuery,
  CreateCourse,
  CreateModule,
  ModulePathParam,
  PatchCourseSettings,
  ReorderInput,
  UpdateCourse,
  UpdateModule,
} from '../../schemas/index.js';
import { defineTool, type Tool } from '../tool.js';

export const courseTools: Tool[] = [
  defineTool({
    name: 'list_courses',
    title: 'List courses',
    description: 'Search and page through the courses, each with its status and settings. Filter by status or category.',
    scope: 'courses:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: CoursesQuery,
    call: (input, { container, scope }) => container.content.listCourses(scope.orgId, input),
  }),
  defineTool({
    name: 'list_modules',
    title: 'List modules',
    description: 'The modules of a course, in order.',
    scope: 'courses:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: CourseIdPathParam,
    call: ({ courseId }, { container, scope }) => container.content.listCourseModules(scope.orgId, courseId),
  }),
  defineTool({
    name: 'create_course',
    title: 'Create course',
    description: 'Create a draft course. Publish it with update_course.',
    scope: 'courses:write',
    kind: 'write',
    idempotent: false,
    openWorld: false,
    input: CreateCourse,
    call: (input, { container, scope }) => container.content.createCourse(scope.orgId, input),
  }),
  defineTool({
    name: 'update_course',
    title: 'Update course',
    description:
      'Change a course title, description, category or cover image, or publish and unpublish it with status. Fields left out stay as they are.',
    scope: 'courses:write',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: UpdateCourse.extend(CourseIdPathParam.shape),
    call: ({ courseId, ...patch }, { container, scope }) => container.content.updateCourse(scope.orgId, courseId, patch),
  }),
  defineTool({
    name: 'update_course_settings',
    title: 'Update course settings',
    description: 'Change course settings such as transcript downloads and comments. Settings left out stay as they are.',
    scope: 'courses:write',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: PatchCourseSettings.extend(CourseIdPathParam.shape),
    call: ({ courseId, ...settings }, { container, scope }) =>
      container.content.patchCourseSettings(scope.orgId, courseId, settings),
  }),
  defineTool({
    name: 'create_module',
    title: 'Create module',
    description: 'Add a module at the end of a course. Returns the course modules in order.',
    scope: 'courses:write',
    kind: 'write',
    idempotent: false,
    openWorld: false,
    input: CreateModule.extend(CourseIdPathParam.shape),
    call: ({ courseId, title }, { container, scope }) => container.content.createModule(scope.orgId, courseId, title),
  }),
  defineTool({
    name: 'rename_module',
    title: 'Rename module',
    description: 'Rename a module. Returns the course modules in order.',
    scope: 'courses:write',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: UpdateModule.extend(ModulePathParam.shape),
    call: ({ courseId, moduleId, title }, { container, scope }) =>
      container.content.updateModule(scope.orgId, courseId, moduleId, title),
  }),
  defineTool({
    name: 'reorder_modules',
    title: 'Reorder modules',
    description: 'Set the module order of a course. Pass every module id of the course in the new order.',
    scope: 'courses:write',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: ReorderInput.extend(CourseIdPathParam.shape),
    call: ({ courseId, orderedIds }, { container, scope }) =>
      container.content.reorderModules(scope.orgId, courseId, orderedIds),
  }),
  defineTool({
    name: 'delete_course',
    title: 'Delete course',
    description: 'Permanently delete a course with its modules and activities.',
    scope: 'courses:delete',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: CourseIdPathParam,
    call: ({ courseId }, { container, scope }) => container.content.deleteCourse(scope.orgId, courseId),
  }),
  defineTool({
    name: 'delete_module',
    title: 'Delete module',
    description: 'Permanently delete a module with its activities. Returns the remaining modules in order.',
    scope: 'courses:delete',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: ModulePathParam,
    call: ({ courseId, moduleId }, { container, scope }) => container.content.deleteModule(scope.orgId, courseId, moduleId),
  }),
];
```

Check the two descriptions that state service behaviour against the code before committing. "with its modules and activities" in `delete_course`: read `ContentService.deleteCourse` and the schema's foreign keys. "Add a module at the end" in `create_module`: read `createModule`. If either is not what the code does, describe what it does.

- [ ] **Step 4: Register the tools**

`packages/server/src/http/mcp/tools/index.ts`:

```ts
import type { Tool } from '../tool.js';
import { courseTools } from './courses.js';

export const TOOLS: Tool[] = [...courseTools];
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run packages/server/src/http/mcp`
Expected: PASS. `courses.test.ts` has 11 tests.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @headless-lms/server typecheck`
Expected: exit 0. A type error on a `call` means a REST schema's output does not match the service input. Read the REST route that uses the same schema and pass the value exactly as that route does. Do not add a conversion.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/http/mcp/tools/courses.ts packages/server/src/http/mcp/tools/courses.test.ts packages/server/src/http/mcp/tools/index.ts
git commit -m "feat(mcp): course tools"
```

---

### Task 7: Download, bundle and media tools

Seventeen tools over `container.content` and `container.assets`.

**Files:**
- Create: `packages/server/src/http/mcp/tools/catalog.ts`
- Modify: `packages/server/src/http/mcp/tools/index.ts`
- Test: `packages/server/src/http/mcp/tools/catalog.test.ts`

**Interfaces:**
- Consumes: `defineTool`, `Tool` (Task 5); `DownloadsQuery`, `CreateDownload`, `UpdateDownload` (Task 4), `AddDownloadAsset`, `RenameDownloadAsset`, `ReorderDownloadAssets`, `DownloadIdParam`, `DownloadAssetParams`, `BundlesQuery`, `CreateBundle`, `UpdateBundle`, `AddBundleItem`, `BundleIdParam`, `BundleItemParams`, `AssetsQuery` from `../../schemas/index.js`.
- Produces: `catalogTools: Tool[]`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { runCase, toolSpecs, type ToolCase } from '../test-support.js';
import { catalogTools } from './catalog.js';

const files = [{ assetId: 'ast_1', displayName: 'Workbook' }];

const cases: ToolCase[] = [
  { tool: 'list_downloads', args: {}, service: 'content.listDownloads', expected: ['org_1', { page: 1, pageSize: 20 }] },
  { tool: 'list_download_files', args: { downloadId: 'dl_1' }, service: 'content.listDownloadAssets', expected: ['org_1', 'dl_1'], returns: files },
  {
    tool: 'create_download',
    args: { title: 'Kit' },
    service: 'content.createDownload',
    expected: ['org_1', { title: 'Kit', description: '', category: '' }],
  },
  {
    tool: 'update_download',
    args: { downloadId: 'dl_1', status: 'published' },
    service: 'content.updateDownload',
    expected: ['org_1', 'dl_1', { status: 'published' }],
  },
  {
    tool: 'add_download_file',
    args: { downloadId: 'dl_1', assetId: 'ast_1' },
    service: 'content.addDownloadAsset',
    expected: ['org_1', 'dl_1', { assetId: 'ast_1' }],
    returns: files,
  },
  {
    tool: 'rename_download_file',
    args: { downloadId: 'dl_1', assetId: 'ast_1', displayName: 'Workbook' },
    service: 'content.renameDownloadAsset',
    expected: ['org_1', 'dl_1', 'ast_1', 'Workbook'],
    returns: files,
  },
  {
    tool: 'reorder_download_files',
    args: { downloadId: 'dl_1', assetIds: ['ast_2', 'ast_1'] },
    service: 'content.reorderDownloadAssets',
    expected: ['org_1', 'dl_1', ['ast_2', 'ast_1']],
    returns: files,
  },
  {
    tool: 'remove_download_file',
    args: { downloadId: 'dl_1', assetId: 'ast_1' },
    service: 'content.removeDownloadAsset',
    expected: ['org_1', 'dl_1', 'ast_1'],
    returns: [],
  },
  { tool: 'delete_download', args: { downloadId: 'dl_1' }, service: 'content.removeDownload', expected: ['org_1', 'dl_1'], returns: undefined },
  { tool: 'list_bundles', args: { search: 'starter' }, service: 'content.listBundles', expected: ['org_1', { page: 1, pageSize: 20, search: 'starter' }] },
  { tool: 'list_bundle_items', args: { bundleId: 'bdl_1' }, service: 'content.listBundleItems', expected: ['org_1', 'bdl_1'], returns: [{ contentId: 'crs_1' }] },
  {
    tool: 'create_bundle',
    args: { name: 'Starter', contentIds: ['crs_1'] },
    service: 'content.createBundle',
    expected: ['org_1', { name: 'Starter', contentIds: ['crs_1'] }],
  },
  {
    tool: 'rename_bundle',
    args: { bundleId: 'bdl_1', name: 'Starter pack' },
    service: 'content.updateBundle',
    expected: ['org_1', 'bdl_1', { name: 'Starter pack' }],
  },
  {
    tool: 'add_bundle_item',
    args: { bundleId: 'bdl_1', contentId: 'crs_2' },
    service: 'content.addBundleItem',
    expected: ['org_1', 'bdl_1', 'crs_2'],
    returns: [{ contentId: 'crs_2' }],
  },
  {
    tool: 'remove_bundle_item',
    args: { bundleId: 'bdl_1', contentId: 'crs_2' },
    service: 'content.removeBundleItem',
    expected: ['org_1', 'bdl_1', 'crs_2'],
    returns: [],
  },
  { tool: 'delete_bundle', args: { bundleId: 'bdl_1' }, service: 'content.deleteBundle', expected: ['org_1', 'bdl_1'], returns: undefined },
  { tool: 'list_media', args: { kind: 'video' }, service: 'assets.list', expected: ['org_1', { page: 1, pageSize: 20, kind: 'video' }] },
];

describe('download, bundle and media tools', () => {
  it('declare their scope and hints', () => {
    expect(toolSpecs(catalogTools)).toEqual([
      ['list_downloads', 'downloads:read', 'read', true, false],
      ['list_download_files', 'downloads:read', 'read', true, false],
      ['create_download', 'downloads:write', 'write', false, false],
      ['update_download', 'downloads:write', 'write', true, false],
      ['add_download_file', 'downloads:write', 'write', false, false],
      ['rename_download_file', 'downloads:write', 'write', true, false],
      ['reorder_download_files', 'downloads:write', 'write', true, false],
      ['remove_download_file', 'downloads:write', 'destructive', true, false],
      ['delete_download', 'downloads:delete', 'destructive', true, false],
      ['list_bundles', 'bundles:read', 'read', true, false],
      ['list_bundle_items', 'bundles:read', 'read', true, false],
      ['create_bundle', 'bundles:write', 'write', false, false],
      ['rename_bundle', 'bundles:write', 'write', true, false],
      ['add_bundle_item', 'bundles:write', 'write', false, false],
      ['remove_bundle_item', 'bundles:write', 'destructive', true, false],
      ['delete_bundle', 'bundles:delete', 'destructive', true, false],
      ['list_media', 'media:read', 'read', true, false],
    ]);
  });

  it.each(cases)('$tool calls $service once', (c) => runCase(catalogTools, c));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/server/src/http/mcp/tools/catalog.test.ts`
Expected: FAIL with "Cannot find module './catalog.js'".

- [ ] **Step 3: Write `catalog.ts`**

```ts
import {
  AddBundleItem,
  AddDownloadAsset,
  AssetsQuery,
  BundleIdParam,
  BundleItemParams,
  BundlesQuery,
  CreateBundle,
  CreateDownload,
  DownloadAssetParams,
  DownloadIdParam,
  DownloadsQuery,
  RenameDownloadAsset,
  ReorderDownloadAssets,
  UpdateBundle,
  UpdateDownload,
} from '../../schemas/index.js';
import { defineTool, type Tool } from '../tool.js';

export const catalogTools: Tool[] = [
  defineTool({
    name: 'list_downloads',
    title: 'List downloads',
    description: 'Search and page through downloads: file collections a student can be granted. Filter by status or category.',
    scope: 'downloads:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: DownloadsQuery,
    call: (input, { container, scope }) => container.content.listDownloads(scope.orgId, input),
  }),
  defineTool({
    name: 'list_download_files',
    title: 'List download files',
    description: 'The files of a download, in order, with their display names.',
    scope: 'downloads:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: DownloadIdParam,
    call: ({ downloadId }, { container, scope }) => container.content.listDownloadAssets(scope.orgId, downloadId),
  }),
  defineTool({
    name: 'create_download',
    title: 'Create download',
    description: 'Create a draft download. Add files with add_download_file and publish it with update_download.',
    scope: 'downloads:write',
    kind: 'write',
    idempotent: false,
    openWorld: false,
    input: CreateDownload,
    call: (input, { container, scope }) => container.content.createDownload(scope.orgId, input),
  }),
  defineTool({
    name: 'update_download',
    title: 'Update download',
    description:
      'Change a download title, description, category or cover image, or publish and unpublish it with status. Fields left out stay as they are.',
    scope: 'downloads:write',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: UpdateDownload.extend(DownloadIdParam.shape),
    call: ({ downloadId, ...patch }, { container, scope }) =>
      container.content.updateDownload(scope.orgId, downloadId, patch),
  }),
  defineTool({
    name: 'add_download_file',
    title: 'Add file to download',
    description: 'Add an uploaded file to the end of a download. Find file ids with list_media.',
    scope: 'downloads:write',
    kind: 'write',
    idempotent: false,
    openWorld: false,
    input: AddDownloadAsset.extend(DownloadIdParam.shape),
    call: ({ downloadId, ...file }, { container, scope }) =>
      container.content.addDownloadAsset(scope.orgId, downloadId, file),
  }),
  defineTool({
    name: 'rename_download_file',
    title: 'Rename download file',
    description: 'Set the name a file shows under in a download. null shows the file name.',
    scope: 'downloads:write',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: RenameDownloadAsset.extend(DownloadAssetParams.shape),
    call: ({ downloadId, assetId, displayName }, { container, scope }) =>
      container.content.renameDownloadAsset(scope.orgId, downloadId, assetId, displayName),
  }),
  defineTool({
    name: 'reorder_download_files',
    title: 'Reorder download files',
    description: 'Set the file order of a download. Pass every file id of the download in the new order.',
    scope: 'downloads:write',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: ReorderDownloadAssets.extend(DownloadIdParam.shape),
    call: ({ downloadId, assetIds }, { container, scope }) =>
      container.content.reorderDownloadAssets(scope.orgId, downloadId, assetIds),
  }),
  defineTool({
    name: 'remove_download_file',
    title: 'Remove file from download',
    description: 'Take a file out of a download. The uploaded file itself is kept.',
    scope: 'downloads:write',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: DownloadAssetParams,
    call: ({ downloadId, assetId }, { container, scope }) =>
      container.content.removeDownloadAsset(scope.orgId, downloadId, assetId),
  }),
  defineTool({
    name: 'delete_download',
    title: 'Delete download',
    description: 'Permanently delete a download. The uploaded files are kept.',
    scope: 'downloads:delete',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: DownloadIdParam,
    call: ({ downloadId }, { container, scope }) => container.content.removeDownload(scope.orgId, downloadId),
  }),
  defineTool({
    name: 'list_bundles',
    title: 'List bundles',
    description: 'Search and page through bundles: sets of courses and downloads granted together.',
    scope: 'bundles:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: BundlesQuery,
    call: (input, { container, scope }) => container.content.listBundles(scope.orgId, input),
  }),
  defineTool({
    name: 'list_bundle_items',
    title: 'List bundle items',
    description: 'The courses and downloads in a bundle.',
    scope: 'bundles:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: BundleIdParam,
    call: ({ bundleId }, { container, scope }) => container.content.listBundleItems(scope.orgId, bundleId),
  }),
  defineTool({
    name: 'create_bundle',
    title: 'Create bundle',
    description: 'Create a bundle, optionally with the course and download ids it starts with.',
    scope: 'bundles:write',
    kind: 'write',
    idempotent: false,
    openWorld: false,
    input: CreateBundle,
    call: (input, { container, scope }) => container.content.createBundle(scope.orgId, input),
  }),
  defineTool({
    name: 'rename_bundle',
    title: 'Rename bundle',
    description: 'Rename a bundle.',
    scope: 'bundles:write',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: UpdateBundle.extend(BundleIdParam.shape),
    call: ({ bundleId, ...patch }, { container, scope }) => container.content.updateBundle(scope.orgId, bundleId, patch),
  }),
  defineTool({
    name: 'add_bundle_item',
    title: 'Add to bundle',
    description: 'Add a course or download to a bundle. Returns the bundle items.',
    scope: 'bundles:write',
    kind: 'write',
    idempotent: false,
    openWorld: false,
    input: AddBundleItem.extend(BundleIdParam.shape),
    call: ({ bundleId, contentId }, { container, scope }) =>
      container.content.addBundleItem(scope.orgId, bundleId, contentId),
  }),
  defineTool({
    name: 'remove_bundle_item',
    title: 'Remove from bundle',
    description: 'Take a course or download out of a bundle. Returns the remaining items.',
    scope: 'bundles:write',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: BundleItemParams,
    call: ({ bundleId, contentId }, { container, scope }) =>
      container.content.removeBundleItem(scope.orgId, bundleId, contentId),
  }),
  defineTool({
    name: 'delete_bundle',
    title: 'Delete bundle',
    description: 'Permanently delete a bundle. Its courses and downloads are kept.',
    scope: 'bundles:delete',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: BundleIdParam,
    call: ({ bundleId }, { container, scope }) => container.content.deleteBundle(scope.orgId, bundleId),
  }),
  defineTool({
    name: 'list_media',
    title: 'List media',
    description: 'Search and page through uploaded files, to use in downloads or as cover images. Uploading is done in the admin app.',
    scope: 'media:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: AssetsQuery,
    call: (input, { container, scope }) => container.assets.list(scope.orgId, input),
  }),
];
```

Check every description that states service behaviour against the code before committing:

- "The uploaded file itself is kept" in `remove_download_file`.
- "The uploaded files are kept" in `delete_download`.
- "Its courses and downloads are kept" in `delete_bundle`.
- "Add an uploaded file to the end" in `add_download_file`.
- "null shows the file name" in `rename_download_file`.

Read `ContentService` and the download/bundle foreign keys. If a statement is not what the code does, describe what it does.

- [ ] **Step 4: Register the tools**

`packages/server/src/http/mcp/tools/index.ts`:

```ts
import type { Tool } from '../tool.js';
import { catalogTools } from './catalog.js';
import { courseTools } from './courses.js';

export const TOOLS: Tool[] = [...courseTools, ...catalogTools];
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `pnpm vitest run packages/server/src/http/mcp && pnpm --filter @headless-lms/server typecheck`
Expected: PASS (`catalog.test.ts` 18 tests), typecheck exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/http/mcp/tools/catalog.ts packages/server/src/http/mcp/tools/catalog.test.ts packages/server/src/http/mcp/tools/index.ts
git commit -m "feat(mcp): download, bundle and media tools"
```

---

### Task 8: Student, access and analytics tools

Twelve tools over `container.reporting`, `container.organizations` and `container.entitlements`.

**Files:**
- Create: `packages/server/src/http/mcp/tools/people.ts`
- Modify: `packages/server/src/http/mcp/tools/index.ts`
- Test: `packages/server/src/http/mcp/tools/people.test.ts`

**Interfaces:**
- Consumes: `defineTool`, `noInput`, `Tool` (Task 5); `StudentsQuery`, `StudentIdParam`, `UpdateStudentBody`, `CreateInvite`, `EntitlementsQuery`, `GrantEntitlement`, `SetEntitlementStatus`, `EntitlementIdParam`, `EnrollmentSeriesQuery`, `CourseIdPathParam` from `../../schemas/index.js`.
- Produces: `peopleTools: Tool[]`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { listTools, runCase, toolContext, fakeContainer, toolSpecs, type ToolCase } from '../test-support.js';
import { peopleTools } from './people.js';

const cases: ToolCase[] = [
  { tool: 'list_students', args: { search: 'sam' }, service: 'reporting.students.list', expected: ['org_1', { page: 1, pageSize: 20, search: 'sam' }] },
  {
    tool: 'update_student',
    args: { id: 'ou_9', firstName: 'Sam', lastName: 'Lee', email: 'sam@acme.test' },
    service: 'organizations.updateStudent',
    expected: [{ orgId: 'org_1', orgUserId: 'ou_9', firstName: 'Sam', lastName: 'Lee', email: 'sam@acme.test' }],
  },
  {
    tool: 'invite_student',
    args: { email: 'sam@acme.test', firstName: 'Sam' },
    service: 'organizations.createInvite',
    expected: [{ orgId: 'org_1', inviterUserId: 'usr_1', role: 'student', email: 'sam@acme.test', firstName: 'Sam', sendEmail: true }],
  },
  {
    tool: 'resend_student_invite',
    args: { id: 'ou_9' },
    service: 'organizations.resendStudentInvite',
    expected: [{ orgId: 'org_1', orgUserId: 'ou_9', inviterUserId: 'usr_1' }],
    returns: undefined,
  },
  { tool: 'list_access', args: { orgUserId: 'ou_9' }, service: 'entitlements.list', expected: ['org_1', { page: 1, pageSize: 20, orgUserId: 'ou_9' }] },
  {
    tool: 'grant_access',
    args: { orgUserId: 'ou_9', contentId: 'crs_1', expiresAt: '2026-12-31T00:00:00.000Z' },
    service: 'entitlements.grant',
    expected: ['org_1', { orgUserId: 'ou_9', contentId: 'crs_1', expiresAt: new Date('2026-12-31T00:00:00.000Z') }],
  },
  {
    tool: 'set_access_status',
    args: { id: 'ent_1', status: 'revoked' },
    service: 'entitlements.setStatus',
    expected: ['org_1', 'ent_1', 'revoked'],
  },
  { tool: 'get_dashboard', args: {}, service: 'reporting.dashboard.overview', expected: ['org_1'] },
  { tool: 'get_enrollment_trend', args: { days: 7 }, service: 'reporting.dashboard.enrollments', expected: ['org_1', 7], returns: [] },
  { tool: 'get_course_analytics', args: { courseId: 'crs_1' }, service: 'reporting.courses.analytics', expected: ['org_1', 'crs_1'] },
  {
    tool: 'get_course_enrollment_trend',
    args: { courseId: 'crs_1' },
    service: 'reporting.courses.enrollments',
    expected: ['org_1', 'crs_1', 30],
    returns: [],
  },
  { tool: 'get_student_analytics', args: { id: 'ou_9' }, service: 'reporting.students.analytics', expected: ['org_1', 'ou_9'] },
];

describe('student, access and analytics tools', () => {
  it('declare their scope and hints', () => {
    expect(toolSpecs(peopleTools)).toEqual([
      ['list_students', 'students:read', 'read', true, false],
      ['update_student', 'students:write', 'write', true, false],
      ['invite_student', 'students:invite', 'write', false, true],
      ['resend_student_invite', 'students:invite', 'write', false, true],
      ['list_access', 'access:read', 'read', true, false],
      ['grant_access', 'access:write', 'write', false, false],
      ['set_access_status', 'access:write', 'destructive', true, false],
      ['get_dashboard', 'analytics:read', 'read', true, false],
      ['get_enrollment_trend', 'analytics:read', 'read', true, false],
      ['get_course_analytics', 'analytics:read', 'read', true, false],
      ['get_course_enrollment_trend', 'analytics:read', 'read', true, false],
      ['get_student_analytics', 'analytics:read', 'read', true, false],
    ]);
  });

  it.each(cases)('$tool calls $service once', (c) => runCase(peopleTools, c));

  it('lists grant_access with expiresAt as a date-time string', async () => {
    const tools = await listTools(toolContext(fakeContainer()), peopleTools);
    const grant = tools.find((tool) => tool.name === 'grant_access');
    expect(JSON.stringify(grant?.inputSchema.properties?.expiresAt)).toContain('"format":"date-time"');
  });

  it('cannot invite anyone but a student', async () => {
    const tools = await listTools(toolContext(fakeContainer()), peopleTools);
    const invite = tools.find((tool) => tool.name === 'invite_student');
    expect(Object.keys(invite?.inputSchema.properties ?? {})).not.toContain('role');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/server/src/http/mcp/tools/people.test.ts`
Expected: FAIL with "Cannot find module './people.js'".

- [ ] **Step 3: Write `people.ts`**

```ts
import {
  CourseIdPathParam,
  CreateInvite,
  EnrollmentSeriesQuery,
  EntitlementIdParam,
  EntitlementsQuery,
  GrantEntitlement,
  SetEntitlementStatus,
  StudentIdParam,
  StudentsQuery,
  UpdateStudentBody,
} from '../../schemas/index.js';
import { defineTool, noInput, type Tool } from '../tool.js';

export const peopleTools: Tool[] = [
  defineTool({
    name: 'list_students',
    title: 'List students',
    description: 'Search and page through the students with their progress totals.',
    scope: 'students:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: StudentsQuery,
    call: (input, { container, scope }) => container.reporting.students.list(scope.orgId, input),
  }),
  defineTool({
    name: 'update_student',
    title: 'Update student',
    description:
      "Correct a student's first name, last name and email. All three are required. Returns the student's membership record; list_students shows the updated profile.",
    scope: 'students:write',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: UpdateStudentBody.extend(StudentIdParam.shape),
    call: ({ id, ...profile }, { container, scope }) =>
      container.organizations.updateStudent({ orgId: scope.orgId, orgUserId: id, ...profile }),
  }),
  defineTool({
    name: 'invite_student',
    title: 'Invite student',
    description: 'Invite someone by email as a student. They exist as an invited student at once. sendEmail false skips the email.',
    scope: 'students:invite',
    kind: 'write',
    idempotent: false,
    openWorld: true,
    input: CreateInvite.omit({ role: true }),
    call: (input, { container, scope }) =>
      container.organizations.createInvite({ orgId: scope.orgId, inviterUserId: scope.userId, role: 'student', ...input }),
  }),
  defineTool({
    name: 'resend_student_invite',
    title: 'Resend student invite',
    description: "Send a pending student's invite email again.",
    scope: 'students:invite',
    kind: 'write',
    idempotent: false,
    openWorld: true,
    input: StudentIdParam,
    call: ({ id }, { container, scope }) =>
      container.organizations.resendStudentInvite({ orgId: scope.orgId, orgUserId: id, inviterUserId: scope.userId }),
  }),
  defineTool({
    name: 'list_access',
    title: 'List access',
    description: 'Who has access to what. Filter by student (orgUserId), content, type or status.',
    scope: 'access:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: EntitlementsQuery,
    call: (input, { container, scope }) => container.entitlements.list(scope.orgId, input),
  }),
  defineTool({
    name: 'grant_access',
    title: 'Grant access',
    description:
      'Give a student access to one course or download (contentId) or to a bundle (bundleId), never both. expiresAt is a date-time, or null for no expiry.',
    scope: 'access:write',
    kind: 'write',
    idempotent: false,
    openWorld: false,
    input: GrantEntitlement,
    call: (input, { container, scope }) => container.entitlements.grant(scope.orgId, input),
  }),
  defineTool({
    name: 'set_access_status',
    title: 'Revoke or reinstate access',
    description: 'Revoke an access grant, or reinstate a revoked one.',
    scope: 'access:write',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: SetEntitlementStatus.extend(EntitlementIdParam.shape),
    call: ({ id, status }, { container, scope }) => container.entitlements.setStatus(scope.orgId, id, status),
  }),
  defineTool({
    name: 'get_dashboard',
    title: 'Get dashboard',
    description: 'The organization overview numbers.',
    scope: 'analytics:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: noInput,
    call: (_input, { container, scope }) => container.reporting.dashboard.overview(scope.orgId),
  }),
  defineTool({
    name: 'get_enrollment_trend',
    title: 'Get enrollment trend',
    description: 'Daily enrollments across the organization for the last days (default 30, at most 365).',
    scope: 'analytics:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: EnrollmentSeriesQuery,
    call: ({ days }, { container, scope }) => container.reporting.dashboard.enrollments(scope.orgId, days),
  }),
  defineTool({
    name: 'get_course_analytics',
    title: 'Get course analytics',
    description: 'Enrollment, progress and completion figures for one course.',
    scope: 'analytics:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: CourseIdPathParam,
    call: ({ courseId }, { container, scope }) => container.reporting.courses.analytics(scope.orgId, courseId),
  }),
  defineTool({
    name: 'get_course_enrollment_trend',
    title: 'Get course enrollment trend',
    description: 'Daily enrollments in one course for the last days (default 30, at most 365).',
    scope: 'analytics:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: EnrollmentSeriesQuery.extend(CourseIdPathParam.shape),
    call: ({ courseId, days }, { container, scope }) =>
      container.reporting.courses.enrollments(scope.orgId, courseId, days),
  }),
  defineTool({
    name: 'get_student_analytics',
    title: 'Get student analytics',
    description: "One student's progress and activity figures.",
    scope: 'analytics:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: StudentIdParam,
    call: ({ id }, { container, scope }) => container.reporting.students.analytics(scope.orgId, id),
  }),
];
```

Check every description that states service behaviour against the code before committing:

- "They exist as an invited student at once" in `invite_student`: read `OrganizationsService.createInvite`.
- "with their progress totals" in `list_students`: read the `Student` schema.
- The `get_dashboard` and analytics wording: read `OverviewStats` and `CourseAnalytics`.

If a statement is not what the code does, describe what it does.

- [ ] **Step 4: Register the tools**

`packages/server/src/http/mcp/tools/index.ts`:

```ts
import type { Tool } from '../tool.js';
import { catalogTools } from './catalog.js';
import { courseTools } from './courses.js';
import { peopleTools } from './people.js';

export const TOOLS: Tool[] = [...courseTools, ...catalogTools, ...peopleTools];
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `pnpm vitest run packages/server/src/http/mcp && pnpm --filter @headless-lms/server typecheck`
Expected: PASS (`people.test.ts` 15 tests), typecheck exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/http/mcp/tools/people.ts packages/server/src/http/mcp/tools/people.test.ts packages/server/src/http/mcp/tools/index.ts
git commit -m "feat(mcp): student, access and analytics tools"
```

---

### Task 9: Workflow, webhook and comment tools, and the registry check

Fifteen tools over `container.automations` and `container.discussion`. Then one test that holds the whole registry to the spec.

**Files:**
- Create: `packages/server/src/http/mcp/tools/automations.ts`
- Create: `packages/server/src/http/mcp/tools/comments.ts`
- Modify: `packages/server/src/http/mcp/tools/index.ts`
- Test: `packages/server/src/http/mcp/tools/automations.test.ts`, `packages/server/src/http/mcp/tools/comments.test.ts`, `packages/server/src/http/mcp/tools/index.test.ts`

**Interfaces:**
- Consumes: `defineTool`, `noInput`, `Tool` (Task 5); `AutomationsQuery`, `AutomationRunsQuery`, `AutomationIdParam`, `AutomationRunParams`, `CreateAutomationBody`, `UpdateAutomationBody`, `UpdateWebhookBody`, `CommentsQuery`, `CommentIdParam`, `DiscussionActivityParam`, `ReplyToComment` from `../../schemas/index.js`; `ACCESS_SCOPES`, `isDeleteScope` from `@headless-lms/core/organizations`.
- Produces: `automationTools: Tool[]`, `commentTools: Tool[]`, and the final `TOOLS` (54 tools, in the spec's table order).

- [ ] **Step 1: Write the failing tests**

`packages/server/src/http/mcp/tools/automations.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { runCase, toolSpecs, type ToolCase } from '../test-support.js';
import { automationTools } from './automations.js';

const workflow = {
  name: 'Welcome',
  triggers: ['student.invited'],
  actions: [{ type: 'sendEmail', input: { subject: 'Hi' } }],
};

const cases: ToolCase[] = [
  { tool: 'list_automation_triggers', args: {}, service: 'automations.availableTriggers', expected: [] },
  { tool: 'list_automation_actions', args: {}, service: 'automations.availableActions', expected: [] },
  { tool: 'list_automations', args: { kind: 'workflow' }, service: 'automations.list', expected: ['org_1', { kind: 'workflow' }], returns: [] },
  {
    tool: 'list_automation_runs',
    args: { id: 'aut_1' },
    service: 'automations.listRuns',
    expected: ['org_1', 'aut_1', { page: 1, pageSize: 20 }],
  },
  { tool: 'create_automation', args: workflow, service: 'automations.create', expected: ['org_1', workflow] },
  {
    tool: 'update_automation',
    args: { id: 'aut_1', enabled: false },
    service: 'automations.update',
    expected: ['org_1', 'aut_1', { enabled: false }],
  },
  {
    tool: 'rerun_automation_run',
    args: { id: 'aut_1', runId: 'run_1' },
    service: 'automations.rerun',
    expected: ['org_1', 'aut_1', 'run_1'],
  },
  { tool: 'delete_automation', args: { id: 'aut_1' }, service: 'automations.delete', expected: ['org_1', 'aut_1'], returns: true },
  {
    tool: 'update_webhook',
    args: { id: 'aut_2', enabled: false },
    service: 'automations.updateWebhook',
    expected: ['org_1', 'aut_2', { enabled: false }],
  },
  { tool: 'delete_webhook', args: { id: 'aut_2' }, service: 'automations.deleteWebhook', expected: ['org_1', 'aut_2'], returns: true },
];

describe('workflow and webhook tools', () => {
  it('declare their scope and hints', () => {
    expect(toolSpecs(automationTools)).toEqual([
      ['list_automation_triggers', 'automations:read', 'read', true, false],
      ['list_automation_actions', 'automations:read', 'read', true, false],
      ['list_automations', 'automations:read', 'read', true, false],
      ['list_automation_runs', 'automations:read', 'read', true, false],
      ['create_automation', 'automations:write', 'write', false, false],
      ['update_automation', 'automations:write', 'write', true, false],
      ['rerun_automation_run', 'automations:write', 'write', false, true],
      ['delete_automation', 'automations:delete', 'destructive', true, false],
      ['update_webhook', 'automations:write', 'write', true, false],
      ['delete_webhook', 'automations:delete', 'destructive', true, false],
    ]);
  });

  it.each(cases)('$tool calls $service once', (c) => runCase(automationTools, c));
});
```

`packages/server/src/http/mcp/tools/comments.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { runCase, toolSpecs, type ToolCase } from '../test-support.js';
import { commentTools } from './comments.js';

const actor = { id: 'ou_1', role: 'owner' };

const cases: ToolCase[] = [
  { tool: 'list_comments', args: { reported: 'true' }, service: 'discussion.listComments', expected: ['org_1', { page: 1, pageSize: 20, reported: true }] },
  { tool: 'publish_comment', args: { commentId: 'cmt_1' }, service: 'discussion.publish', expected: ['org_1', 'cmt_1', actor] },
  {
    tool: 'dismiss_comment_reports',
    args: { commentId: 'cmt_1' },
    service: 'discussion.resolveReports',
    expected: ['org_1', 'cmt_1', actor],
    returns: undefined,
  },
  {
    tool: 'reply_to_comment',
    args: { activityId: 'act_1', commentId: 'cmt_1', body: 'Thanks!' },
    service: 'discussion.postComment',
    expected: ['org_1', { actor, activityId: 'act_1', parentId: 'cmt_1', body: 'Thanks!' }],
  },
  { tool: 'remove_comment', args: { commentId: 'cmt_1' }, service: 'discussion.remove', expected: ['org_1', 'cmt_1', actor] },
];

describe('comment tools', () => {
  it('declare their scope and hints', () => {
    expect(toolSpecs(commentTools)).toEqual([
      ['list_comments', 'comments:read', 'read', true, false],
      ['publish_comment', 'comments:moderate', 'write', true, false],
      ['dismiss_comment_reports', 'comments:moderate', 'write', true, false],
      ['reply_to_comment', 'comments:moderate', 'write', false, false],
      ['remove_comment', 'comments:moderate', 'destructive', true, false],
    ]);
  });

  it.each(cases)('$tool calls $service once', (c) => runCase(commentTools, c));
});
```

`packages/server/src/http/mcp/tools/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ACCESS_SCOPES, isDeleteScope } from '@headless-lms/core/organizations';
import { fakeContainer, listTools, toolContext } from '../test-support.js';
import { TOOLS } from './index.js';

const NAMES = [
  'list_courses', 'list_modules', 'create_course', 'update_course', 'update_course_settings', 'create_module',
  'rename_module', 'reorder_modules', 'delete_course', 'delete_module',
  'list_downloads', 'list_download_files', 'create_download', 'update_download', 'add_download_file',
  'rename_download_file', 'reorder_download_files', 'remove_download_file', 'delete_download',
  'list_bundles', 'list_bundle_items', 'create_bundle', 'rename_bundle', 'add_bundle_item', 'remove_bundle_item',
  'delete_bundle', 'list_media',
  'list_students', 'update_student', 'invite_student', 'resend_student_invite',
  'list_access', 'grant_access', 'set_access_status',
  'get_dashboard', 'get_enrollment_trend', 'get_course_analytics', 'get_course_enrollment_trend', 'get_student_analytics',
  'list_automation_triggers', 'list_automation_actions', 'list_automations', 'list_automation_runs',
  'create_automation', 'update_automation', 'rerun_automation_run', 'delete_automation',
  'update_webhook', 'delete_webhook',
  'list_comments', 'publish_comment', 'dismiss_comment_reports', 'reply_to_comment', 'remove_comment',
];

describe('tool registry', () => {
  it('is exactly the 54 designed tools, in order', () => {
    expect(TOOLS.map((tool) => tool.name)).toEqual(NAMES);
  });

  it('gives every tool a known scope and uses every scope', () => {
    const used = new Set(TOOLS.map((tool) => tool.scope));
    expect([...used].every((scope) => (ACCESS_SCOPES as readonly string[]).includes(scope))).toBe(true);
    expect([...used].sort()).toEqual([...ACCESS_SCOPES].sort());
  });

  it('keeps read tools on read scopes and delete scopes on destructive tools', () => {
    for (const tool of TOOLS) {
      expect(tool.kind === 'read', tool.name).toBe(tool.scope.endsWith(':read'));
      if (isDeleteScope(tool.scope)) {
        expect(tool.kind, tool.name).toBe('destructive');
      }
    }
  });

  it('lists every tool with an object input schema and explicit hints', async () => {
    const listed = await listTools(toolContext(fakeContainer()), TOOLS);
    expect(listed.map((tool) => tool.name)).toEqual(NAMES);
    for (const tool of listed) {
      expect(tool.inputSchema.type, tool.name).toBe('object');
      expect(Object.keys(tool.annotations ?? {}).sort(), tool.name).toEqual(
        ['destructiveHint', 'idempotentHint', 'openWorldHint', 'readOnlyHint', 'title'].sort(),
      );
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/server/src/http/mcp/tools`
Expected: FAIL with "Cannot find module './automations.js'", "Cannot find module './comments.js'", and the registry test failing on 15 missing names.

- [ ] **Step 3: Write `automations.ts`**

```ts
import {
  AutomationIdParam,
  AutomationRunParams,
  AutomationRunsQuery,
  AutomationsQuery,
  CreateAutomationBody,
  UpdateAutomationBody,
  UpdateWebhookBody,
} from '../../schemas/index.js';
import { defineTool, noInput, type Tool } from '../tool.js';

export const automationTools: Tool[] = [
  defineTool({
    name: 'list_automation_triggers',
    title: 'List workflow triggers',
    description: 'The events that can start a workflow.',
    scope: 'automations:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: noInput,
    call: (_input, { container }) => container.automations.availableTriggers(),
  }),
  defineTool({
    name: 'list_automation_actions',
    title: 'List workflow actions',
    description: 'The actions a workflow can run, with the settings each one takes.',
    scope: 'automations:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: noInput,
    call: (_input, { container }) => container.automations.availableActions(),
  }),
  defineTool({
    name: 'list_automations',
    title: 'List workflows and webhooks',
    description:
      'Workflows and webhooks with their triggers, ordered actions and enabled state. Filter by kind (workflow or webhook). Webhook signing secrets are only shown in the admin app.',
    scope: 'automations:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: AutomationsQuery,
    call: (input, { container, scope }) => container.automations.list(scope.orgId, input),
  }),
  defineTool({
    name: 'list_automation_runs',
    title: 'List workflow and webhook runs',
    description: 'Runs of one workflow or webhook, newest first, with the trigger event and each action result.',
    scope: 'automations:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: AutomationRunsQuery.extend(AutomationIdParam.shape),
    call: ({ id, ...query }, { container, scope }) => container.automations.listRuns(scope.orgId, id, query),
  }),
  defineTool({
    name: 'create_automation',
    title: 'Create workflow',
    description:
      'Create a workflow from triggers and ordered actions. Use list_automation_triggers and list_automation_actions for valid values.',
    scope: 'automations:write',
    kind: 'write',
    idempotent: false,
    openWorld: false,
    input: CreateAutomationBody,
    call: (input, { container, scope }) => container.automations.create(scope.orgId, input),
  }),
  defineTool({
    name: 'update_automation',
    title: 'Update workflow',
    description: 'Change a workflow name, description, triggers or actions, or turn it on and off with enabled. Fields left out stay as they are.',
    scope: 'automations:write',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: UpdateAutomationBody.extend(AutomationIdParam.shape),
    call: ({ id, ...patch }, { container, scope }) => container.automations.update(scope.orgId, id, patch),
  }),
  defineTool({
    name: 'rerun_automation_run',
    title: 'Re-run workflow run',
    description: 'Run a past workflow run again with the same trigger event. Its actions run again, emails and webhooks included.',
    scope: 'automations:write',
    kind: 'write',
    idempotent: false,
    openWorld: true,
    input: AutomationRunParams,
    call: ({ id, runId }, { container, scope }) => container.automations.rerun(scope.orgId, id, runId),
  }),
  defineTool({
    name: 'delete_automation',
    title: 'Delete workflow',
    description: 'Permanently delete a workflow.',
    scope: 'automations:delete',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: AutomationIdParam,
    call: ({ id }, { container, scope }) => container.automations.delete(scope.orgId, id),
  }),
  defineTool({
    name: 'update_webhook',
    title: 'Update webhook',
    description: 'Change a webhook URL, events or description, or turn it on and off with enabled. Fields left out stay as they are.',
    scope: 'automations:write',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: UpdateWebhookBody.extend(AutomationIdParam.shape),
    call: ({ id, ...patch }, { container, scope }) => container.automations.updateWebhook(scope.orgId, id, patch),
  }),
  defineTool({
    name: 'delete_webhook',
    title: 'Delete webhook',
    description: 'Permanently delete a webhook and its signing secret. Its delivery history is kept.',
    scope: 'automations:delete',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: AutomationIdParam,
    call: ({ id }, { container, scope }) => container.automations.deleteWebhook(scope.orgId, id),
  }),
];
```

- [ ] **Step 4: Write `comments.ts`**

```ts
import { CommentIdParam, CommentsQuery, DiscussionActivityParam, ReplyToComment } from '../../schemas/index.js';
import type { OrgScope } from '../../scope.js';
import { defineTool, type Tool } from '../tool.js';

const actor = (scope: OrgScope) => ({ id: scope.orgUserId, role: scope.role });

export const commentTools: Tool[] = [
  defineTool({
    name: 'list_comments',
    title: 'List comments',
    description:
      'The comment moderation queue. Filter by status, reported, course, activity or author. Each comment carries its activityId and parentId.',
    scope: 'comments:read',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: CommentsQuery,
    call: (input, { container, scope }) => container.discussion.listComments(scope.orgId, input),
  }),
  defineTool({
    name: 'publish_comment',
    title: 'Publish comment',
    description: 'Publish a comment: approves one waiting for review, or restores a removed one.',
    scope: 'comments:moderate',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: CommentIdParam,
    call: ({ commentId }, { container, scope }) => container.discussion.publish(scope.orgId, commentId, actor(scope)),
  }),
  defineTool({
    name: 'dismiss_comment_reports',
    title: 'Dismiss comment reports',
    description: 'Mark the reports on a comment as resolved and leave the comment up.',
    scope: 'comments:moderate',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: CommentIdParam,
    call: ({ commentId }, { container, scope }) =>
      container.discussion.resolveReports(scope.orgId, commentId, actor(scope)),
  }),
  defineTool({
    name: 'reply_to_comment',
    title: 'Reply to comment',
    description:
      'Reply to a published top-level comment as yourself. Pass its activityId and its id. To answer a reply, reply to its parentId.',
    scope: 'comments:moderate',
    kind: 'write',
    idempotent: false,
    openWorld: false,
    input: ReplyToComment.extend(CommentIdParam.shape).extend(DiscussionActivityParam.shape),
    call: ({ activityId, commentId, body }, { container, scope }) =>
      container.discussion.postComment(scope.orgId, { actor: actor(scope), activityId, parentId: commentId, body }),
  }),
  defineTool({
    name: 'remove_comment',
    title: 'Remove comment',
    description: 'Take a comment down.',
    scope: 'comments:moderate',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: CommentIdParam,
    call: ({ commentId }, { container, scope }) => container.discussion.remove(scope.orgId, commentId, actor(scope)),
  }),
];
```

Check every description that states service behaviour against the code before committing:

- `publish_comment`: "approves one waiting for review, or restores a removed one".
- `dismiss_comment_reports`: "leave the comment up".
- `reply_to_comment`: "published top-level".
- `delete_webhook`: "Its delivery history is kept". The REST route summary says the same; confirm it in `AutomationService.deleteWebhook`.
- `rerun_automation_run`: "emails and webhooks included".

Read `DiscussionService` and `AutomationService`. If a statement is not what the code does, describe what it does.

- [ ] **Step 5: Register all tools**

`packages/server/src/http/mcp/tools/index.ts`:

```ts
import type { Tool } from '../tool.js';
import { automationTools } from './automations.js';
import { catalogTools } from './catalog.js';
import { commentTools } from './comments.js';
import { courseTools } from './courses.js';
import { peopleTools } from './people.js';

export const TOOLS: Tool[] = [...courseTools, ...catalogTools, ...peopleTools, ...automationTools, ...commentTools];
```

- [ ] **Step 6: Run the tests, typecheck and lint**

Run: `pnpm vitest run packages/server/src/http/mcp && pnpm --filter @headless-lms/server typecheck && pnpm lint`
Expected: PASS. `automations.test.ts` has 11 tests, `comments.test.ts` 6 and `index.test.ts` 4. Typecheck and lint exit 0.

- [ ] **Step 7: Confirm no tool has logic**

Run: `grep -nE "if \(|\? |for \(|while \(|switch|try \{|\.map\(|\.filter\(|await " packages/server/src/http/mcp/tools/courses.ts packages/server/src/http/mcp/tools/catalog.ts packages/server/src/http/mcp/tools/people.ts packages/server/src/http/mcp/tools/automations.ts packages/server/src/http/mcp/tools/comments.ts`
Expected: no output. Every `call` is a single service call.

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/http/mcp/tools
git commit -m "feat(mcp): workflow, webhook and comment tools"
```

---

### Task 10: REST routes for scopes, connected apps and API keys; SDK regeneration

**Files:**
- Create: `packages/server/src/http/schemas/access.ts`
- Modify: `packages/server/src/http/schemas/index.ts`
- Create: `packages/server/src/http/routes/access.ts`
- Create: `packages/server/src/http/routes/access.test.ts`
- Modify: `packages/server/src/http/routes.ts`
- Regenerate: `packages/sdk/openapi.json`, `packages/sdk/src/generated/index.ts`, `packages/sdk/src/generated/sdk.gen.ts`, `packages/sdk/src/generated/types.gen.ts`
- Modify: `packages/sdk/src/index.ts`

**Interfaces:**
- Consumes:
  - From `@headless-lms/core/organizations` (Task 1): `ACCESS_SCOPES`, `scopeOptions(role: Role): ScopeOption[]`, `assertRoleHoldsScopes(role: Role, scopes: readonly AccessScope[]): void` (throws `ForbiddenError('Your role cannot grant <missing, comma-joined>')`).
  - From `@headless-lms/core/types` (Task 1): `NewApiKey = { authUserId: string; orgId: string; name: string; scopes: string[] }`, `ApiKeySummary` with `scopes: string[]`, `CreatedApiKey`, `ConnectedApp`.
  - On `container.auth` (Task 2, `AppAccessAdmin`): `listConnectedApps(headers, orgId)`, `revokeConnectedApp(headers, orgId, clientId)`, `listApiKeys(headers, orgId)`, `createApiKey(input: NewApiKey)`, `deleteApiKey(headers, orgId, keyId)`; `orgId` is the Better Auth organization id (`scope.authOrgId`).
  - From Task 3: `classifyError` (REST error handler maps `ForbiddenError` → 403 `{ error: 'forbidden', message }`), `mcpEndpoints`, `registerAuth` reading `container.mcp`.
  - Existing: `resolveScope(container, req)`, `ErrorBody`.
- Produces:
  - REST operations, tag `Access`, all behind `requireOrgSession`: `listAccessScopes` GET `/api/access/scopes` → `ScopeOptionList`; `listConnectedApps` GET `/api/access/apps`; `revokeConnectedApp` DELETE `/api/access/apps/:clientId`; `listApiKeys` GET `/api/access/api-keys`; `createApiKey` POST `/api/access/api-keys` (`{ name, scopes }` → 201 `CreatedApiKey`, 403 `ErrorBody`); `deleteApiKey` DELETE `/api/access/api-keys/:id`.
  - Server schemas `ScopeOption`, `ScopeOptionList`, `ConnectedApp`, `ConnectedAppList`, `ClientIdParam`, `ApiKey` (with `scopes`), `ApiKeyList`, `CreatedApiKey`, `CreateApiKey`, `ApiKeyIdParam`.
  - SDK: `Access` exported from `@headless-lms/sdk` with `Access.listAccessScopes()`, `Access.listConnectedApps()`, `Access.revokeConnectedApp({ clientId })`, `Access.listApiKeys()`, `Access.createApiKey({ name, scopes })`, `Access.deleteApiKey({ id })`; generated types `ListAccessScopesResponse`, `ListConnectedAppsResponse`, `ListApiKeysResponse`, `CreateApiKeyResponse` (and their `Data`/`Responses`/`Errors` siblings).

The admin-side additions the old branch made in `apps/admin/src/lib/api/types.ts` (`ConnectedApp`, `ApiKeySummary` aliases) and `apps/admin/src/lib/api/server.ts` (`serverApi.listConnectedApps`, `serverApi.listApiKeys`) were committed with the admin settings pages, not with these routes; they belong to the admin task, not this one.

- [ ] **Step 1: Write the failing route test**

`packages/server/src/http/routes/access.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { OrganizationRuleError } from '@headless-lms/core/organizations';
import type { NewApiKey } from '@headless-lms/core/types';
import type { Container } from '../../app/container.js';
import { mcpEndpoints } from '../../app/mcp-endpoints.js';
import { registerAuth } from '../plugins/auth.js';
import { errorHandler } from '../plugins/error-handler.js';
import { accessRoutes } from './access.js';

const ORG = { id: 'org_dom', name: 'Acme', slug: 'acme', externalId: 'org_auth' };
const SESSION = {
  user: { id: 'usr_1', email: 'a@b.c' },
  session: { activeOrganizationId: ORG.externalId },
};
const H = { 'x-test': '1' };
const NOW = new Date('2026-01-01T00:00:00.000Z');

let calls: Array<[string, ...unknown[]]> = [];
let deleteError: Error | null = null;
let session: typeof SESSION | null = SESSION;
let role = 'owner';

const container = {
  mcp: mcpEndpoints({
    authBaseURL: 'http://localhost:8100',
    adminAppUrl: 'http://localhost:8101',
  }),
  auth: {
    verify: async () => session,
    handler: async () => new Response(null),
    listConnectedApps: async (h: Record<string, unknown>, orgId: string) => {
      calls.push(['listConnectedApps', h['x-test'], orgId]);
      return [
        {
          clientId: 'client_1',
          name: 'Claude',
          iconUrl: null,
          scopes: ['courses:read'],
          connectedAt: NOW,
        },
      ];
    },
    revokeConnectedApp: async (h: Record<string, unknown>, orgId: string, clientId: string) => {
      calls.push(['revokeConnectedApp', h['x-test'], orgId, clientId]);
    },
    listApiKeys: async (h: Record<string, unknown>, orgId: string) => {
      calls.push(['listApiKeys', h['x-test'], orgId]);
      return [
        {
          id: 'key_1',
          name: 'CI',
          start: 'abc',
          scopes: ['courses:read'],
          createdAt: NOW,
          lastUsedAt: null,
        },
      ];
    },
    createApiKey: async (input: NewApiKey) => {
      calls.push(['createApiKey', input]);
      return {
        id: 'key_1',
        name: input.name,
        start: 'abc',
        scopes: input.scopes,
        createdAt: NOW,
        lastUsedAt: null,
        key: 'secret',
      };
    },
    deleteApiKey: async (h: Record<string, unknown>, orgId: string, keyId: string) => {
      calls.push(['deleteApiKey', h['x-test'], orgId, keyId]);
      if (deleteError) {
        throw deleteError;
      }
    },
  },
  organizations: {
    getById: async (id: string) => (id === ORG.id ? ORG : null),
    getByExternalId: async (externalId: string) => (externalId === ORG.externalId ? ORG : null),
    getOrgUser: async () => ({ id: 'ou_1', role }),
  },
  identity: { getUserByExternalId: async () => ({ id: 'dom_usr_1' }) },
  requestContext: { set: () => {} },
} as unknown as Container;

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);
  registerAuth(app, container);
  await app.register(async (instance) => {
    await accessRoutes(instance, container);
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  calls = [];
  deleteError = null;
  session = SESSION;
  role = 'owner';
});

describe('access routes', () => {
  it('lists every scope with whether your role can grant it', async () => {
    role = 'instructor';
    const res = await app.inject({ method: 'GET', url: '/api/access/scopes', headers: H });
    expect(res.statusCode).toBe(200);
    const options: Array<{ scope: string; allowed: boolean }> = res.json();
    expect(options).toHaveLength(21);
    expect(options.filter((option) => option.allowed).map((option) => option.scope)).toEqual([
      'courses:read',
      'downloads:read',
      'bundles:read',
      'media:read',
      'automations:read',
      'comments:read',
    ]);
  });

  it('lists connected apps for the session org', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/access/apps', headers: H });
    expect(res.statusCode).toBe(200);
    expect(res.json()[0].clientId).toBe('client_1');
    expect(calls).toEqual([['listConnectedApps', '1', 'org_auth']]);
  });

  it('revokes a connected app', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/access/apps/client_1',
      headers: H,
    });
    expect(res.statusCode).toBe(204);
    expect(calls).toEqual([['revokeConnectedApp', '1', 'org_auth', 'client_1']]);
  });

  it('lists api keys with their scopes', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/access/api-keys', headers: H });
    expect(res.statusCode).toBe(200);
    expect(res.json()[0].scopes).toEqual(['courses:read']);
    expect(calls).toEqual([['listApiKeys', '1', 'org_auth']]);
  });

  it('creates an api key with the requested scopes and returns the secret', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/access/api-keys',
      headers: H,
      payload: { name: 'CI', scopes: ['courses:read', 'courses:write'] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ key: 'secret', scopes: ['courses:read', 'courses:write'] });
    expect(calls).toEqual([
      [
        'createApiKey',
        {
          authUserId: 'usr_1',
          orgId: 'org_auth',
          name: 'CI',
          scopes: ['courses:read', 'courses:write'],
        },
      ],
    ]);
  });

  it('refuses a scope your role cannot grant', async () => {
    role = 'instructor';
    const res = await app.inject({
      method: 'POST',
      url: '/api/access/api-keys',
      headers: H,
      payload: { name: 'CI', scopes: ['courses:read', 'courses:write'] },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({
      error: 'forbidden',
      message: 'Your role cannot grant courses:write',
    });
    expect(calls).toEqual([]);
  });

  it('rejects an empty name, an empty scope list and an unknown scope', async () => {
    for (const payload of [
      { name: '', scopes: ['courses:read'] },
      { name: 'CI', scopes: [] },
      { name: 'CI', scopes: ['lms:read'] },
    ]) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/access/api-keys',
        headers: H,
        payload,
      });
      expect(res.statusCode).toBe(400);
    }
    expect(calls).toEqual([]);
  });

  it('deletes an api key', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/access/api-keys/key_1',
      headers: H,
    });
    expect(res.statusCode).toBe(204);
    expect(calls).toEqual([['deleteApiKey', '1', 'org_auth', 'key_1']]);
  });

  it("answers 409 when the key is not the caller's", async () => {
    deleteError = new OrganizationRuleError('That API key does not exist');
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/access/api-keys/key_9',
      headers: H,
    });
    expect(res.statusCode).toBe(409);
  });

  it('requires a session', async () => {
    session = null;
    const res = await app.inject({ method: 'GET', url: '/api/access/apps', headers: H });
    expect(res.statusCode).toBe(401);
    expect(calls).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test packages/server/src/http/routes/access.test.ts`
Expected: FAIL with "Failed to load url ./access.js"

- [ ] **Step 3: Write the schemas and routes, and register them**

`packages/server/src/http/schemas/access.ts`:

```ts
import { z } from 'zod';
import { ACCESS_SCOPES } from '@headless-lms/core/organizations';

export const ScopeOption = z.object({ scope: z.enum(ACCESS_SCOPES), allowed: z.boolean() });
export const ScopeOptionList = z.array(ScopeOption);

export const ConnectedApp = z.object({
  clientId: z.string(),
  name: z.string(),
  iconUrl: z.string().nullable(),
  scopes: z.array(z.string()),
  connectedAt: z.coerce.date(),
});
export const ConnectedAppList = z.array(ConnectedApp);
export const ClientIdParam = z.object({ clientId: z.string() });

export const ApiKey = z.object({
  id: z.string(),
  name: z.string().nullable(),
  start: z.string().nullable(),
  scopes: z.array(z.string()),
  createdAt: z.coerce.date(),
  lastUsedAt: z.coerce.date().nullable(),
});
export const ApiKeyList = z.array(ApiKey);
export const CreatedApiKey = ApiKey.extend({ key: z.string() });
export const CreateApiKey = z.object({
  name: z.string().trim().min(1).max(80),
  scopes: z.array(z.enum(ACCESS_SCOPES)).min(1),
});
export const ApiKeyIdParam = z.object({ id: z.string() });
```

`packages/server/src/http/schemas/index.ts` — one exact edit. Before:

```ts
export * from './discussion.js';
```

After:

```ts
export * from './discussion.js';
export * from './access.js';
```

`packages/server/src/http/routes/access.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { assertRoleHoldsScopes, scopeOptions } from '@headless-lms/core/organizations';
import type { Container } from '../../app/container.js';
import {
  ApiKeyIdParam,
  ApiKeyList,
  ClientIdParam,
  ConnectedAppList,
  CreateApiKey,
  CreatedApiKey,
  ErrorBody,
  ScopeOptionList,
} from '../schemas/index.js';
import { resolveScope } from '../scope.js';

export async function accessRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const tags = ['Access'];

  r.route({
    method: 'GET',
    url: '/api/access/scopes',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listAccessScopes',
      tags,
      summary: 'Every access scope and whether your role can grant it',
      response: { 200: ScopeOptionList },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return scopeOptions(scope.role);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/access/apps',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listConnectedApps',
      tags,
      summary: 'Apps connected to this organization as you',
      response: { 200: ConnectedAppList },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return container.auth.listConnectedApps(req.headers, scope.authOrgId);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/access/apps/:clientId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'revokeConnectedApp',
      tags,
      summary: 'Disconnect an app',
      params: ClientIdParam,
      response: { 204: z.void() },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      await container.auth.revokeConnectedApp(req.headers, scope.authOrgId, req.params.clientId);
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'GET',
    url: '/api/access/api-keys',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listApiKeys',
      tags,
      summary: 'Your API keys for this organization',
      response: { 200: ApiKeyList },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return container.auth.listApiKeys(req.headers, scope.authOrgId);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/access/api-keys',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'createApiKey',
      tags,
      summary: 'Create an API key',
      body: CreateApiKey,
      response: { 201: CreatedApiKey, 403: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      assertRoleHoldsScopes(scope.role, req.body.scopes);
      const created = await container.auth.createApiKey({
        authUserId: req.authUser.id,
        orgId: scope.authOrgId,
        name: req.body.name,
        scopes: req.body.scopes,
      });
      return reply.code(201).send(created);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/access/api-keys/:id',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'deleteApiKey',
      tags,
      summary: 'Delete an API key',
      params: ApiKeyIdParam,
      response: { 204: z.void(), 409: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      await container.auth.deleteApiKey(req.headers, scope.authOrgId, req.params.id);
      return reply.code(204).send();
    },
  });
}
```

`packages/server/src/http/routes.ts` — two exact edits.

Edit 1. Before:

```ts
import { integrationsRoutes } from './routes/integrations.js';
```

After:

```ts
import { integrationsRoutes } from './routes/integrations.js';
import { accessRoutes } from './routes/access.js';
```

Edit 2. Before:

```ts
    await integrationsRoutes(instance, container);
  });
```

After:

```ts
    await integrationsRoutes(instance, container);
    await accessRoutes(instance, container);
  });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test packages/server/src/http/routes/access.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Regenerate the SDK**

`gen:openapi` loads the worktree `.env` with Node's `--env-file`, which never overrides a variable already set in the environment. The spec's `servers[0].url` (and so the generated client's `baseUrl`) comes from `BETTER_AUTH_URL`; pinning it on the command line keeps both at `http://localhost:8000` even though the worktree's `.env` points at 8100.

Run: `BETTER_AUTH_URL=http://localhost:8000 pnpm gen:sdk`
Expected: `Wrote …/packages/sdk/openapi.json`, then openapi-ts regenerates `packages/sdk/src/generated`.

- [ ] **Step 6: Verify the generated output**

Run: `git diff --exit-code packages/sdk/src/generated/client.gen.ts`
Expected: exits 0, no output (base URL still `http://localhost:8000`)

Run: `grep -c '"url": "http://localhost:8000"' packages/sdk/openapi.json`
Expected: `1`

Run: `grep -n '"/api/access' packages/sdk/openapi.json`
Expected: exactly five path keys — `/api/access/scopes`, `/api/access/apps`, `/api/access/apps/{clientId}`, `/api/access/api-keys`, `/api/access/api-keys/{id}`

Run: `grep -nE 'public static (listAccessScopes|listConnectedApps|revokeConnectedApp|listApiKeys|createApiKey|deleteApiKey)<' packages/sdk/src/generated/sdk.gen.ts`
Expected: six lines, all inside `export class Access`

Run: `grep -cE 'well-known|"/mcp"' packages/sdk/openapi.json`
Expected: `0` (the metadata routes are `hide: true`)

Run: `git status --short packages/sdk`
Expected: only `packages/sdk/openapi.json`, `packages/sdk/src/generated/index.ts`, `packages/sdk/src/generated/sdk.gen.ts`, `packages/sdk/src/generated/types.gen.ts` modified

- [ ] **Step 7: Export `Access` from the SDK entry point**

`packages/sdk/src/index.ts` — two exact edits.

Edit 1. Before:

```ts
import {
  Assets as AssetsGen,
```

After:

```ts
import {
  Access as AccessGen,
  Assets as AssetsGen,
```

Edit 2. Before:

```ts
export const Assets = AssetsGen as Throwing<typeof AssetsGen>;
```

After:

```ts
export const Access = AccessGen as Throwing<typeof AccessGen>;
export const Assets = AssetsGen as Throwing<typeof AssetsGen>;
```

- [ ] **Step 8: Verify**

Run: `pnpm test packages/server`
Expected: PASS

Run: `pnpm --filter @headless-lms/server typecheck && pnpm --filter @headless-lms/sdk typecheck && pnpm --filter admin typecheck`
Expected: all exit 0

Run: `pnpm lint`
Expected: exits 0

- [ ] **Step 9: Commit**

```bash
git add packages/server/src/http/schemas/access.ts packages/server/src/http/schemas/index.ts packages/server/src/http/routes/access.ts packages/server/src/http/routes/access.test.ts packages/server/src/http/routes.ts packages/sdk/openapi.json packages/sdk/src/generated/index.ts packages/sdk/src/generated/sdk.gen.ts packages/sdk/src/generated/types.gen.ts packages/sdk/src/index.ts
git commit -m "feat(api): access scopes, connected apps and api key routes"
```

---

### Task 11: Admin — OAuth sign-in continuation, org picker and the consent page with the scope picker

**Files:**
- Create: `apps/admin/src/lib/auth/oauth-flow.ts`
- Test: `apps/admin/src/lib/auth/oauth-flow.test.ts`
- Create: `apps/admin/src/components/forms/scope-picker.tsx`
- Create: `apps/admin/src/app/(auth)/oauth/consent/page.tsx`
- Create: `apps/admin/src/app/(auth)/oauth/consent/consent-form.tsx`
- Modify: `apps/admin/src/lib/auth/client.ts`
- Modify: `apps/admin/src/lib/auth/server-session.ts`
- Modify: `apps/admin/src/app/(auth)/login/page.tsx`
- Modify: `apps/admin/src/app/(auth)/login/login-form.tsx`
- Modify: `apps/admin/src/app/onboarding/select-organization/page.tsx`
- Modify: `apps/admin/src/app/onboarding/select-organization/org-picker.tsx`
- Modify: `apps/admin/src/lib/api/types.ts`
- Modify: `apps/admin/src/lib/api/server.ts`

**Interfaces:**
- Consumes:
  - Dependency task: `apps/admin/package.json` already depends on `better-auth@1.7.7`, `@better-auth/oauth-provider@1.7.7`.
  - Auth server tasks: Better Auth endpoints `POST /api/auth/oauth2/consent` (body `{ accept: boolean; scope?: string }`; `scope` must be a subset of the scopes in the signed authorize query), `POST /api/auth/oauth2/continue` (body `{ postLogin: true }`), `GET /api/auth/oauth2/public-client?client_id=…`; Better Auth sends the browser to `${adminAppUrl}/login`, `${adminAppUrl}/onboarding/select-organization` and `${adminAppUrl}/oauth/consent` with the signed authorize query (`client_id`, `scope`, `sig`, `exp`, …); `get-session` returns `organizations` for every session.
  - Task 10: SDK `Access.listAccessScopes(options)` resolving to `ListAccessScopesResponse` = `Array<{ scope: "courses:read" | … | "comments:moderate"; allowed: boolean }>` in `ACCESS_SCOPES` order.
- Produces:
  - `@/lib/auth/oauth-flow`: `SCOPE_RESOURCES: { resource: string; label: string }[]`, `SCOPE_ACTION_LABELS: Record<string, string>`, `SCOPE_NOTES: Record<string, string>` (the write scopes whose tools can remove something), `isOAuthFlow(search: URLSearchParams | Record<string, string | string[] | undefined>): boolean`, `loginRedirect(search: Record<string, string | string[] | undefined>, signedIn: boolean): string | null`, `defaultSelected(scope: string): boolean`, `isDeleteScope(scope: string): boolean`, `pickerScopes(requested: string | null | undefined, options: { scope: string; allowed: boolean }[]): string[]`, `clientDisplayName(clientId: string, ok: boolean, body: unknown): string`, `toSearchParams(search: Record<string, string | string[] | undefined>): URLSearchParams`.
  - `@/components/forms/scope-picker`: `ScopePicker(props: { scopes: string[]; value: string[]; onChange: (value: string[]) => void })`.
  - `@/lib/auth/client`: `export const API_URL` (the public API origin) and `authClient` with `oauthProviderClient()`. API keys go through `/api/access/api-keys`, so the admin app has no API-key client plugin.
  - `@/lib/api/types`: `ScopeOption = ListAccessScopesResponse[number]`, `AccessScope = ScopeOption["scope"]`.
  - `@/lib/api/server`: `serverApi.listAccessScopes(): Promise<ScopeOption[]>`.
  - `ServerSession.organizations` lists every membership, whatever the session's status.

Read `apps/admin/AGENTS.md` and `src/components/forms/event-checklist.tsx` before writing any `.tsx`. Admin unit tests run through the root vitest config (`**/src/**/*.test.{ts,tsx}`, `node` environment); there is no component test setup, so only `oauth-flow.ts` is unit-tested.

- [ ] **Step 1: Write the failing test**

Create `apps/admin/src/lib/auth/oauth-flow.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  clientDisplayName,
  defaultSelected,
  isDeleteScope,
  isOAuthFlow,
  loginRedirect,
  pickerScopes,
  SCOPE_NOTES,
  SCOPE_RESOURCES,
  toSearchParams,
} from "./oauth-flow";

describe("loginRedirect", () => {
  it("always shows the form during an oauth sign-in", () => {
    expect(loginRedirect({ client_id: "c", sig: "abc" }, true)).toBeNull();
    expect(loginRedirect({ client_id: "c", sig: "abc" }, false)).toBeNull();
  });
  it("sends a signed-in user to onboarding outside oauth", () => {
    expect(loginRedirect({}, true)).toBe("/onboarding");
    expect(loginRedirect({}, false)).toBeNull();
  });
});

describe("clientDisplayName", () => {
  it("uses the registered client name", () => {
    expect(clientDisplayName("cid", true, { client_id: "cid", client_name: "Claude" })).toBe(
      "Claude",
    );
  });
  it("falls back to the client id", () => {
    expect(clientDisplayName("cid", false, { client_name: "Claude" })).toBe("cid");
    expect(clientDisplayName("cid", true, { client_name: "" })).toBe("cid");
    expect(clientDisplayName("cid", true, { client_name: 7 })).toBe("cid");
    expect(clientDisplayName("cid", true, null)).toBe("cid");
  });
});

describe("isOAuthFlow", () => {
  it("is true when the page carries a signed authorize query", () => {
    expect(isOAuthFlow(new URLSearchParams("client_id=c&sig=abc&exp=1"))).toBe(true);
    expect(isOAuthFlow({ client_id: "c", sig: "abc" })).toBe(true);
  });
  it("is false otherwise", () => {
    expect(isOAuthFlow(new URLSearchParams(""))).toBe(false);
    expect(isOAuthFlow({ client_id: "c" })).toBe(false);
  });
});

describe("pickerScopes", () => {
  const options = [
    { scope: "courses:read", allowed: true },
    { scope: "courses:write", allowed: false },
    { scope: "courses:delete", allowed: false },
    { scope: "students:read", allowed: true },
    { scope: "comments:read", allowed: true },
  ];

  it("keeps the requested scopes the role allows, in catalogue order", () => {
    expect(
      pickerScopes("comments:read offline_access courses:write courses:read openid", options),
    ).toEqual(["courses:read", "comments:read"]);
  });
  it("is empty when nothing requested is allowed", () => {
    expect(pickerScopes("courses:write courses:delete offline_access", options)).toEqual([]);
    expect(pickerScopes(null, options)).toEqual([]);
    expect(pickerScopes(undefined, options)).toEqual([]);
  });
});

describe("scope presentation", () => {
  it("ticks only read scopes by default", () => {
    expect(
      [
        "courses:read",
        "courses:write",
        "courses:delete",
        "students:invite",
        "comments:moderate",
        "analytics:read",
      ].filter(defaultSelected),
    ).toEqual(["courses:read", "analytics:read"]);
  });
  it("flags only delete scopes", () => {
    expect(
      ["bundles:delete", "bundles:write", "automations:delete", "media:read"].filter(isDeleteScope),
    ).toEqual(["bundles:delete", "automations:delete"]);
  });
  it("notes every write scope that can remove something", () => {
    expect(Object.keys(SCOPE_NOTES)).toEqual([
      "downloads:write",
      "bundles:write",
      "access:write",
      "comments:moderate",
    ]);
  });
  it("orders the resources as the catalogue does", () => {
    expect(SCOPE_RESOURCES.map(({ resource, label }) => `${resource}=${label}`)).toEqual([
      "courses=Courses",
      "downloads=Downloads",
      "bundles=Bundles",
      "media=Media",
      "students=Students",
      "access=Access",
      "analytics=Analytics",
      "automations=Workflows and webhooks",
      "comments=Comments",
    ]);
  });
});

describe("toSearchParams", () => {
  it("round-trips repeated keys as separate entries", () => {
    const params = toSearchParams({ resource: ["https://a", "https://b"], client_id: "c" });
    expect(params.getAll("resource")).toEqual(["https://a", "https://b"]);
    expect(params.get("client_id")).toBe("c");
  });
  it("drops undefined values", () => {
    const params = toSearchParams({ a: undefined, b: "1" });
    expect(params.has("a")).toBe(false);
    expect(params.toString()).toBe("b=1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/admin/src/lib/auth/oauth-flow.test.ts`
Expected: FAIL with `Error: Failed to load url ./oauth-flow (resolved id: ./oauth-flow) … Does the file exist?`

- [ ] **Step 3: Write the implementation**

Create `apps/admin/src/lib/auth/oauth-flow.ts`:

```ts
export const SCOPE_RESOURCES: { resource: string; label: string }[] = [
  { resource: "courses", label: "Courses" },
  { resource: "downloads", label: "Downloads" },
  { resource: "bundles", label: "Bundles" },
  { resource: "media", label: "Media" },
  { resource: "students", label: "Students" },
  { resource: "access", label: "Access" },
  { resource: "analytics", label: "Analytics" },
  { resource: "automations", label: "Workflows and webhooks" },
  { resource: "comments", label: "Comments" },
];

export const SCOPE_ACTION_LABELS: Record<string, string> = {
  read: "View",
  write: "Change",
  delete: "Delete",
  invite: "Invite (sends email)",
  moderate: "Moderate",
};

export const SCOPE_NOTES: Record<string, string> = {
  "downloads:write": "Change includes removing files from a download.",
  "bundles:write": "Change includes removing items from a bundle.",
  "access:write": "Change includes revoking a student's access.",
  "comments:moderate": "Moderate includes removing comments.",
};

export function isOAuthFlow(
  search: URLSearchParams | Record<string, string | string[] | undefined>,
): boolean {
  const get = (key: string) => (search instanceof URLSearchParams ? search.get(key) : search[key]);
  return Boolean(get("sig")) && Boolean(get("client_id"));
}

export function loginRedirect(
  search: Record<string, string | string[] | undefined>,
  signedIn: boolean,
): string | null {
  return signedIn && !isOAuthFlow(search) ? "/onboarding" : null;
}

export function defaultSelected(scope: string): boolean {
  return scope.endsWith(":read");
}

export function isDeleteScope(scope: string): boolean {
  return scope.endsWith(":delete");
}

export function pickerScopes(
  requested: string | null | undefined,
  options: { scope: string; allowed: boolean }[],
): string[] {
  const wanted = new Set((requested ?? "").split(" "));
  return options
    .filter((option) => option.allowed && wanted.has(option.scope))
    .map((option) => option.scope);
}

export function clientDisplayName(clientId: string, ok: boolean, body: unknown): string {
  if (!ok || !body || typeof body !== "object") return clientId;
  const name = (body as { client_name?: unknown }).client_name;
  return typeof name === "string" && name ? name : clientId;
}

export function toSearchParams(
  search: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) params.append(key, item);
  }
  return params;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/admin/src/lib/auth/oauth-flow.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Register the OAuth-provider client plugin**

The public `API_URL` is exported because the connected-apps page (Task 12) prints the browser-facing `/mcp` URL.

In `apps/admin/src/lib/auth/client.ts`, replace:

```ts
import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
```

with:

```ts
import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
```

In `apps/admin/src/lib/auth/client.ts`, replace:

```ts
  plugins: [organizationClient()],
```

with:

```ts
  plugins: [organizationClient(), oauthProviderClient()],
```

- [ ] **Step 6: Sign-in during an OAuth flow**

During an OAuth flow the login page always shows the form (`loginRedirect` returns `null`), even for a signed-in person; outside a flow a signed-in person still goes to `/onboarding`. After a successful sign-in during a flow the form does not navigate: the oauth-provider client plugin sends the signed query with the sign-in and follows the server's redirect back into the flow.

In `apps/admin/src/app/(auth)/login/page.tsx`, replace:

```tsx
import { getServerSession } from "@/lib/auth/server-session";
import { LoginForm } from "./login-form";
```

with:

```tsx
import { loginRedirect } from "@/lib/auth/oauth-flow";
import { getServerSession } from "@/lib/auth/server-session";
import { LoginForm } from "./login-form";
```

In `apps/admin/src/app/(auth)/login/page.tsx`, replace:

```tsx
export default async function LoginPage() {
  const session = await getServerSession();
  if (session) redirect("/onboarding");
```

with:

```tsx
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const target = loginRedirect(await searchParams, Boolean(await getServerSession()));
  if (target) redirect(target);
```

In `apps/admin/src/app/(auth)/login/login-form.tsx`, replace:

```tsx
import { signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
```

with:

```tsx
import { signIn } from "@/lib/auth/client";
import { isOAuthFlow } from "@/lib/auth/oauth-flow";
import { Button } from "@/components/ui/button";
```

In `apps/admin/src/app/(auth)/login/login-form.tsx`, replace:

```tsx
      setFormError(error.message ?? "Invalid email or password");
      return;
    }
```

with:

```tsx
      setFormError(error.message ?? "Invalid email or password");
      return;
    }
    if (isOAuthFlow(new URLSearchParams(window.location.search))) return;
```

- [ ] **Step 7: Organization picker during an OAuth flow**

With a signed authorize query the picker serves any signed-in person who has at least one organization (Better Auth's post-login step and the consent page's "Choose another organization" link both land here) and, after `setActive`, hands back to Better Auth with `oauth2.continue({ postLogin: true })` instead of going to `/onboarding`.

In `apps/admin/src/app/onboarding/select-organization/page.tsx`, replace:

```tsx
import { getServerSession } from "@/lib/auth/server-session";
import { OrgPicker } from "./org-picker";
```

with:

```tsx
import { getServerSession } from "@/lib/auth/server-session";
import { isOAuthFlow } from "@/lib/auth/oauth-flow";
import { OrgPicker } from "./org-picker";
```

In `apps/admin/src/app/onboarding/select-organization/page.tsx`, replace:

```tsx
export default async function SelectOrganizationPage() {
  const session = await getServerSession();
  // This page serves one state; every other one is /onboarding's to route.
  if (session?.status !== "no-active-org") redirect("/onboarding");
```

with:

```tsx
export default async function SelectOrganizationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const oauth = isOAuthFlow(await searchParams);
  const session = await getServerSession();
  // This page serves one state; every other one is /onboarding's to route.
  if (!session || (oauth ? session.organizations.length === 0 : session.status !== "no-active-org"))
    redirect("/onboarding");
```

In `apps/admin/src/app/onboarding/select-organization/page.tsx`, replace:

```tsx
          You belong to more than one. Pick the one you want to work in — you can switch later.
        </p>
      </div>
      <OrgPicker organizations={session.organizations} />
```

with:

```tsx
          {oauth
            ? "Pick the organization this app will work in."
            : "You belong to more than one. Pick the one you want to work in — you can switch later."}
        </p>
      </div>
      <OrgPicker organizations={session.organizations} oauth={oauth} />
```

In `apps/admin/src/app/onboarding/select-organization/org-picker.tsx`, replace:

```tsx
export function OrgPicker({ organizations }: { organizations: Org[] }) {
```

with:

```tsx
export function OrgPicker({ organizations, oauth }: { organizations: Org[]; oauth?: boolean }) {
```

In `apps/admin/src/app/onboarding/select-organization/org-picker.tsx`, replace:

```tsx
      setError(failure.message ?? "Couldn't switch to that organization");
      return;
    }
```

with:

```tsx
      setError(failure.message ?? "Couldn't switch to that organization");
      return;
    }
    if (oauth) {
      const { error: continueFailure } = await authClient.oauth2.continue({ postLogin: true });
      if (continueFailure) {
        setPending(null);
        setError(continueFailure.message ?? "Couldn't continue to the app");
      }
      return;
    }
```

- [ ] **Step 8: List organizations for every session**

The consent page needs the membership list for an authenticated session too (it decides whether to offer "Choose another organization"), so the list is built before the status branch.

In `apps/admin/src/lib/auth/server-session.ts`, replace:

```ts
  /** Every org the user is a member of. Populated when no org is active yet. */
```

with:

```ts
  /** Every org the user is a member of. */
```

In `apps/admin/src/lib/auth/server-session.ts`, replace:

```ts
    : null;

  let status: ServerSession["status"];
  let organizations: ServerSession["organizations"] = [];
  if (organization && role) {
```

with:

```ts
    : null;

  const raw = data.organizations;
  const organizations: ServerSession["organizations"] = Array.isArray(raw)
    ? raw
        .filter(
          (o): o is { id: string; name?: string; slug?: string } =>
            !!o && typeof o === "object" && typeof (o as { id?: unknown }).id === "string",
        )
        .map((o) => ({ id: o.id, name: o.name ?? "", slug: o.slug ?? "" }))
    : [];

  let status: ServerSession["status"];
  if (organization && role) {
```

In `apps/admin/src/lib/auth/server-session.ts`, replace:

```ts
    //  - no memberships, nothing stamped → fresh staff signup, prompt to create
    const raw = data.organizations;
    organizations = Array.isArray(raw)
      ? raw
          .filter(
            (o): o is { id: string; name?: string; slug?: string } =>
              !!o && typeof o === "object" && typeof (o as { id?: unknown }).id === "string",
          )
          .map((o) => ({ id: o.id, name: o.name ?? "", slug: o.slug ?? "" }))
      : [];
    status =
```

with:

```ts
    //  - no memberships, nothing stamped → fresh staff signup, prompt to create
    status =
```

- [ ] **Step 9: Scope options in the server API layer**

This task owns the scope-option additions to `lib/api`; Task 12 adds the connected-apps and API-key reads. Task 10 only regenerates and exports the SDK.

In `apps/admin/src/lib/api/types.ts`, replace:

```ts
  GetWebhookResponse,
  ListActivitiesResponse,
```

with:

```ts
  GetWebhookResponse,
  ListAccessScopesResponse,
  ListActivitiesResponse,
```

In `apps/admin/src/lib/api/types.ts`, replace:

```ts
// --- entities (straight from the SDK responses) ----------------------------

export type Course = GetCourseResponse;
```

with:

```ts
// --- entities (straight from the SDK responses) ----------------------------

export type ScopeOption = ListAccessScopesResponse[number];
export type AccessScope = ScopeOption["scope"];

export type Course = GetCourseResponse;
```

In `apps/admin/src/lib/api/server.ts`, replace:

```ts
import {
  Assets,
  Automations,
```

with:

```ts
import {
  Access,
  Assets,
  Automations,
```

In `apps/admin/src/lib/api/server.ts`, replace:

```ts
  CommentListItem,
  Student,
```

with:

```ts
  CommentListItem,
  ScopeOption,
  Student,
```

In `apps/admin/src/lib/api/server.ts`, replace:

```ts
    const { triggers } = await Automations.listAutomationTriggers(await authHeaders());
    return triggers;
  },
};
```

with:

```ts
    const { triggers } = await Automations.listAutomationTriggers(await authHeaders());
    return triggers;
  },

  async listAccessScopes(): Promise<ScopeOption[]> {
    return await Access.listAccessScopes(await authHeaders());
  },
};
```

- [ ] **Step 10: The shared scope picker**

The picker is a form control used by the consent page and the API-key dialog, so it lives with the other shared form controls in `src/components/forms/` (next to `event-checklist.tsx`). It groups the given scopes by resource in `SCOPE_RESOURCES` order, renders non-delete scopes as checkboxes labelled with `SCOPE_ACTION_LABELS`, and puts every `:delete` scope in a separate "Delete" group under a `text-danger` warning. It is fully controlled; callers seed `value` with `scopes.filter(defaultSelected)`.

Create `apps/admin/src/components/forms/scope-picker.tsx`:

```tsx
"use client";

import { useId } from "react";
import { AlertTriangle } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { isDeleteScope, SCOPE_ACTION_LABELS, SCOPE_NOTES, SCOPE_RESOURCES } from "@/lib/auth/oauth-flow";

export function ScopePicker({
  scopes,
  value,
  onChange,
}: {
  scopes: string[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const id = useId();
  const selected = new Set(value);

  const toggle = (scope: string) =>
    onChange(selected.has(scope) ? value.filter((item) => item !== scope) : [...value, scope]);

  const groups = SCOPE_RESOURCES.map(({ resource, label }) => ({
    resource,
    label,
    scopes: scopes.filter((scope) => scope.startsWith(`${resource}:`) && !isDeleteScope(scope)),
  })).filter((group) => group.scopes.length > 0);

  const deletable = SCOPE_RESOURCES.flatMap(({ resource, label }) =>
    scopes
      .filter((scope) => scope.startsWith(`${resource}:`) && isDeleteScope(scope))
      .map((scope) => ({ scope, label })),
  );

  const option = (scope: string, text: string) => (
    <label
      key={scope}
      htmlFor={`${id}-${scope}`}
      className="flex items-center gap-2.5 text-sm text-ink-2"
    >
      <Checkbox
        id={`${id}-${scope}`}
        checked={selected.has(scope)}
        onChange={() => toggle(scope)}
      />
      {text}
    </label>
  );

  return (
    <div className="flex flex-col gap-6">
      {groups.length > 0 && (
        <div className="flex flex-col gap-3">
          {groups.map((group) => (
            <div
              key={group.resource}
              role="group"
              aria-labelledby={`${id}-${group.resource}`}
              className="flex items-start gap-4"
            >
              <span
                id={`${id}-${group.resource}`}
                className="w-24 shrink-0 text-sm font-medium text-ink"
              >
                {group.label}
              </span>
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {group.scopes.map((scope) =>
                    option(
                      scope,
                      SCOPE_ACTION_LABELS[scope.slice(group.resource.length + 1)] ?? scope,
                    ),
                  )}
                </div>
                {group.scopes
                  .filter((scope) => SCOPE_NOTES[scope])
                  .map((scope) => (
                    <p key={`${scope}-note`} className="text-xs text-ink-3">
                      {SCOPE_NOTES[scope]}
                    </p>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {deletable.length > 0 && (
        <div role="group" aria-labelledby={`${id}-delete`} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span id={`${id}-delete`} className="text-sm font-medium text-ink">
              Delete
            </span>
            <p className="flex items-start gap-2 text-sm text-danger">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              Lets the app permanently delete what you tick.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {deletable.map(({ scope, label }) => option(scope, label))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 11: The consent page**

Behaviour:
- No session → `/login` with the OAuth query intact. A session without a usable active organization → the org picker with the query when the person has organizations, otherwise `/onboarding` (the scope list is an org-scoped API call, so the page needs an active staff membership).
- The client's display name is fetched from `public-client` with the person's cookie (as before); the scope options come from `serverApi.listAccessScopes()` for the active organization's role.
- The picker shows `pickerScopes(scope, options)`: only requested scopes the role allows, in catalogue order. Read scopes start ticked.
- Allow is disabled while nothing is ticked and sends `scope` = the ticked scopes plus `offline_access` when the client requested it. Deny sends `accept: false`.
- When nothing requested is allowed for the role, the page says so and only Deny is offered.

Create `apps/admin/src/app/(auth)/oauth/consent/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { API_URL } from "@/lib/api/api-url";
import { serverApi } from "@/lib/api/server";
import { clientDisplayName, pickerScopes, toSearchParams } from "@/lib/auth/oauth-flow";
import { getServerSession } from "@/lib/auth/server-session";
import { ConsentForm } from "./consent-form";

export const metadata: Metadata = { title: "Connect an app — Headless LMS" };

type Search = Record<string, string | string[] | undefined>;

async function clientName(clientId: string): Promise<string> {
  if (!clientId) return clientId;
  const cookie = (await headers()).get("cookie") ?? "";
  try {
    const res = await fetch(
      `${API_URL}/api/auth/oauth2/public-client?client_id=${encodeURIComponent(clientId)}`,
      { headers: { cookie }, cache: "no-store" },
    );
    return clientDisplayName(clientId, res.ok, res.ok ? await res.json() : null);
  } catch {
    return clientId;
  }
}

export default async function ConsentPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const session = await getServerSession();
  const query = toSearchParams(sp).toString();
  if (!session) redirect(`/login?${query}`);
  if (session.status !== "authenticated" || !session.organization) {
    redirect(
      session.organizations.length > 0 ? `/onboarding/select-organization?${query}` : "/onboarding",
    );
  }

  const clientId = typeof sp.client_id === "string" ? sp.client_id : "";
  const requested = typeof sp.scope === "string" ? sp.scope : "";
  const [name, options] = await Promise.all([clientName(clientId), serverApi.listAccessScopes()]);
  const scopes = pickerScopes(requested, options);
  const offlineAccess = requested.split(" ").includes("offline_access");
  const org = session.organization.name;

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-ink text-balance">
          Connect {name}
        </h1>
        <p className="text-sm text-ink-3 text-pretty">
          {scopes.length > 0
            ? `${name} will act in ${org} as you. Choose what it can do.`
            : `${name} asked only for access your role in ${org} doesn't include.`}
        </p>
        {session.organizations.length > 1 && (
          <Link
            href={`/onboarding/select-organization?${query}`}
            className="self-start text-sm font-medium text-brand underline-offset-4 hover:underline"
          >
            Choose another organization
          </Link>
        )}
      </div>
      <ConsentForm scopes={scopes} offlineAccess={offlineAccess} />
    </>
  );
}
```

Create `apps/admin/src/app/(auth)/oauth/consent/consent-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

import { ScopePicker } from "@/components/forms/scope-picker";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { defaultSelected } from "@/lib/auth/oauth-flow";

export function ConsentForm({
  scopes,
  offlineAccess,
}: {
  scopes: string[];
  offlineAccess: boolean;
}) {
  const [selected, setSelected] = useState(() => scopes.filter(defaultSelected));
  const [pending, setPending] = useState<"allow" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(accept: boolean) {
    setError(null);
    setPending(accept ? "allow" : "deny");
    const scope = [...selected, ...(offlineAccess ? ["offline_access"] : [])].join(" ");
    const { error: failure } = await authClient.oauth2.consent(
      accept ? { accept, scope } : { accept },
    );
    if (failure) {
      setPending(null);
      setError(failure.message ?? "Couldn't record your decision");
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      {scopes.length > 0 && <ScopePicker scopes={scopes} value={selected} onChange={setSelected} />}
      <div className="flex flex-col gap-3">
        {error && (
          <div className="flex items-start gap-2.5 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-sm text-danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}
        {scopes.length > 0 && (
          <Button
            variant="primary"
            className="w-full"
            disabled={pending !== null || selected.length === 0}
            onClick={() => void decide(true)}
          >
            {pending === "allow" && <Loader2 className="animate-spin" />}
            Allow
          </Button>
        )}
        <Button
          variant="ghost"
          className="w-full"
          disabled={pending !== null}
          onClick={() => void decide(false)}
        >
          {pending === "deny" && <Loader2 className="animate-spin" />}
          Deny
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 12: Verify**

Run: `pnpm exec vitest run apps/admin/src/lib/auth/oauth-flow.test.ts`
Expected: PASS, 14 tests.

Run: `pnpm --filter admin typecheck`
Expected: exits 0 with no output from `tsc`.

Run: `pnpm --filter admin lint`
Expected: exits 0 with no problems reported.

- [ ] **Step 13: Commit**

```bash
git add apps/admin/src/lib/auth/oauth-flow.ts apps/admin/src/lib/auth/oauth-flow.test.ts apps/admin/src/lib/auth/client.ts apps/admin/src/lib/auth/server-session.ts apps/admin/src/components/forms/scope-picker.tsx "apps/admin/src/app/(auth)/login/page.tsx" "apps/admin/src/app/(auth)/login/login-form.tsx" "apps/admin/src/app/(auth)/oauth/consent/page.tsx" "apps/admin/src/app/(auth)/oauth/consent/consent-form.tsx" apps/admin/src/app/onboarding/select-organization/page.tsx apps/admin/src/app/onboarding/select-organization/org-picker.tsx apps/admin/src/lib/api/types.ts apps/admin/src/lib/api/server.ts
git commit -m "feat(admin): oauth sign-in, org choice and consent with a scope picker"
```

---

### Task 12: Admin — Connected apps and API keys settings

**Files:**
- Create: `apps/admin/src/app/(dashboard)/settings/connected-apps/actions.ts`
- Create: `apps/admin/src/app/(dashboard)/settings/connected-apps/page.tsx`
- Create: `apps/admin/src/app/(dashboard)/settings/connected-apps/connected-apps-view.tsx`
- Create: `apps/admin/src/app/(dashboard)/settings/api-keys/actions.ts`
- Create: `apps/admin/src/app/(dashboard)/settings/api-keys/page.tsx`
- Create: `apps/admin/src/app/(dashboard)/settings/api-keys/api-keys-view.tsx`
- Create: `apps/admin/src/app/(dashboard)/settings/api-keys/create-api-key-dialog.tsx`
- Modify: `apps/admin/src/app/(dashboard)/settings/settings-nav.tsx`
- Modify: `apps/admin/src/lib/api/types.ts`
- Modify: `apps/admin/src/lib/api/server.ts`

**Interfaces:**
- Consumes:
  - Task 10: SDK `Access.listConnectedApps(options)`, `Access.revokeConnectedApp({ clientId }, options)`, `Access.listApiKeys(options)`, `Access.createApiKey({ name, scopes }, options)` (resolves to the created key including `key`), `Access.deleteApiKey({ id }, options)`; types `ListConnectedAppsResponse` (items `{ clientId, name, iconUrl, scopes: string[], connectedAt: string }`) and `ListApiKeysResponse` (items `{ id, name, start, scopes: string[], createdAt: string, lastUsedAt: string | null }`).
  - Task 11: `ScopePicker`, `defaultSelected`, `ScopeOption`, `AccessScope`, `serverApi.listAccessScopes()`, `API_URL` from `@/lib/auth/client`.
  - Existing: `authHeaders()` (`@/lib/api/server-call`), `requireAuth(...pending)` (`@/lib/auth/server-session`), `SettingsSurface` / `SettingsSection` / `SettingRow`, `FormDialog`, `Field`, `ConfirmDialog`, `Badge`, `formatDate`.
- Produces:
  - Routes `/settings/connected-apps` and `/settings/api-keys`, linked from the settings nav's Account group (not manager-only).
  - `@/lib/api/types`: `ConnectedApp`, `ApiKeySummary`. `@/lib/api/server`: `serverApi.listConnectedApps(): Promise<ConnectedApp[]>`, `serverApi.listApiKeys(): Promise<ApiKeySummary[]>`.
  - Server actions `revokeConnectedAppAction(clientId: string): Promise<void>`, `createApiKeyAction(input: { name: string; scopes: AccessScope[] }): Promise<{ key: string }>`, `deleteApiKeyAction(id: string): Promise<void>`.

Read `apps/admin/AGENTS.md`, `src/components/forms/settings-section.tsx`, `src/components/forms/form-dialog.tsx`, `src/components/confirm-dialog.tsx` and `src/app/(dashboard)/automations/webhooks/_components/webhook-form-dialog.tsx` before writing. This task has no unit test: it holds no pure logic, and the admin app has no component test setup (the root vitest runs in a `node` environment without a DOM). It is verified by typecheck and lint here and end to end later.

- [ ] **Step 1: Settings navigation**

In `apps/admin/src/app/(dashboard)/settings/settings-nav.tsx`, replace:

```tsx
import { Blocks, Building2, User, Users, type LucideIcon } from "lucide-react";
```

with:

```tsx
import { Blocks, Building2, KeyRound, PlugZap, User, Users, type LucideIcon } from "lucide-react";
```

In `apps/admin/src/app/(dashboard)/settings/settings-nav.tsx`, replace:

```tsx
    items: [{ href: "/settings/account", label: "Profile", icon: User }],
```

with:

```tsx
    items: [
      { href: "/settings/account", label: "Profile", icon: User },
      { href: "/settings/connected-apps", label: "Connected apps", icon: PlugZap },
      { href: "/settings/api-keys", label: "API keys", icon: KeyRound },
    ],
```

- [ ] **Step 2: Connected-apps and API-key reads in the server API layer**

In `apps/admin/src/lib/api/types.ts`, replace:

```ts
  ListAutomationTriggersResponse,
  ListAvailableIntegrationsResponse,
  ListBundleItemsResponse,
```

with:

```ts
  ListAutomationTriggersResponse,
  ListApiKeysResponse,
  ListAvailableIntegrationsResponse,
  ListConnectedAppsResponse,
  ListBundleItemsResponse,
```

In `apps/admin/src/lib/api/types.ts`, replace:

```ts
export type AccessScope = ScopeOption["scope"];
```

with:

```ts
export type AccessScope = ScopeOption["scope"];
export type ConnectedApp = ListConnectedAppsResponse[number];
export type ApiKeySummary = ListApiKeysResponse[number];
```

In `apps/admin/src/lib/api/server.ts`, replace:

```ts
import type {
  Asset,
```

with:

```ts
import type {
  ApiKeySummary,
  Asset,
  ConnectedApp,
```

In `apps/admin/src/lib/api/server.ts`, replace:

```ts
  async listAccessScopes(): Promise<ScopeOption[]> {
    return await Access.listAccessScopes(await authHeaders());
  },
};
```

with:

```ts
  async listAccessScopes(): Promise<ScopeOption[]> {
    return await Access.listAccessScopes(await authHeaders());
  },
  async listConnectedApps(): Promise<ConnectedApp[]> {
    return await Access.listConnectedApps(await authHeaders());
  },
  async listApiKeys(): Promise<ApiKeySummary[]> {
    return await Access.listApiKeys(await authHeaders());
  },
};
```

- [ ] **Step 3: Server actions**

Create `apps/admin/src/app/(dashboard)/settings/connected-apps/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { Access } from "@headless-lms/sdk";

import { authHeaders } from "@/lib/api/server-call";

export async function revokeConnectedAppAction(clientId: string): Promise<void> {
  await Access.revokeConnectedApp({ clientId }, await authHeaders());
  revalidatePath("/settings/connected-apps");
}
```

Create `apps/admin/src/app/(dashboard)/settings/api-keys/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { Access } from "@headless-lms/sdk";

import { authHeaders } from "@/lib/api/server-call";
import type { AccessScope } from "@/lib/api/types";

export async function createApiKeyAction({
  name,
  scopes,
}: {
  name: string;
  scopes: AccessScope[];
}): Promise<{ key: string }> {
  const created = await Access.createApiKey({ name, scopes }, await authHeaders());
  revalidatePath("/settings/api-keys");
  return { key: created.key };
}

export async function deleteApiKeyAction(id: string): Promise<void> {
  await Access.deleteApiKey({ id }, await authHeaders());
  revalidatePath("/settings/api-keys");
}
```

- [ ] **Step 4: Pages**

Both pages start their reads, gate on `requireAuth`, then render the view. The API-keys page passes the scopes the person's role allows (`allowed: true`) to the create dialog.

Create `apps/admin/src/app/(dashboard)/settings/connected-apps/page.tsx`:

```tsx
import { serverApi } from "@/lib/api/server";
import { requireAuth } from "@/lib/auth/server-session";

import { ConnectedAppsView } from "./connected-apps-view";

export default async function ConnectedAppsPage() {
  const dataPromise = serverApi.listConnectedApps();
  await requireAuth(dataPromise);
  const apps = await dataPromise;

  return <ConnectedAppsView apps={apps} />;
}
```

Create `apps/admin/src/app/(dashboard)/settings/api-keys/page.tsx`:

```tsx
import { serverApi } from "@/lib/api/server";
import { requireAuth } from "@/lib/auth/server-session";

import { ApiKeysView } from "./api-keys-view";

export default async function ApiKeysPage() {
  const keysPromise = serverApi.listApiKeys();
  const optionsPromise = serverApi.listAccessScopes();
  await requireAuth(keysPromise, optionsPromise);
  const [keys, options] = await Promise.all([keysPromise, optionsPromise]);

  return (
    <ApiKeysView
      keys={keys}
      scopes={options.filter((option) => option.allowed).map((option) => option.scope)}
    />
  );
}
```

- [ ] **Step 5: Connected apps view**

One `SettingRow` per app (name, connected date, ghost Disconnect → destructive `ConfirmDialog` → `revokeConnectedAppAction`), with the granted scopes as outline badges under the row. The empty state names this server's public `/mcp` URL.

Create `apps/admin/src/app/(dashboard)/settings/connected-apps/connected-apps-view.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { SettingRow, SettingsSection, SettingsSurface } from "@/components/forms/settings-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ConnectedApp } from "@/lib/api/types";
import { API_URL } from "@/lib/auth/client";
import { formatDate } from "@/lib/format";

import { revokeConnectedAppAction } from "./actions";

export function ConnectedAppsView({ apps }: { apps: ConnectedApp[] }) {
  const router = useRouter();
  const [target, setTarget] = useState<ConnectedApp | null>(null);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    if (!target) return;
    const clientId = target.clientId;
    startTransition(async () => {
      try {
        await revokeConnectedAppAction(clientId);
        toast.success("Disconnected");
        setTarget(null);
        router.refresh();
      } catch (err) {
        toast.error("Couldn't disconnect", { description: (err as Error).message });
      }
    });
  }

  return (
    <SettingsSurface>
      <SettingsSection
        title="Connected apps"
        description="Apps that act in this organization as you, such as ChatGPT or Claude. Disconnecting signs the app out immediately."
      >
        {apps.length === 0 ? (
          <p className="text-sm text-ink-3">
            No apps connected. Add <span className="font-mono text-ink-2">{`${API_URL}/mcp`}</span>{" "}
            as a connector in ChatGPT or Claude.
          </p>
        ) : (
          apps.map((app) => (
            <div key={app.clientId} className="flex flex-col gap-2">
              <SettingRow
                id={`app-${app.clientId}`}
                label={app.name}
                hint={`Connected ${formatDate(app.connectedAt)}`}
              >
                <Button variant="ghost" onClick={() => setTarget(app)}>
                  Disconnect
                </Button>
              </SettingRow>
              <div className="flex flex-wrap gap-1.5">
                {app.scopes.map((scope) => (
                  <Badge key={scope} variant="outline" className="font-mono">
                    {scope}
                  </Badge>
                ))}
              </div>
            </div>
          ))
        )}
      </SettingsSection>

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => !open && setTarget(null)}
        title={`Disconnect ${target?.name ?? "app"}?`}
        description="The app is signed out immediately and can no longer act as you in this organization."
        confirmLabel="Disconnect"
        destructive
        pending={pending}
        onConfirm={onConfirm}
      />
    </SettingsSurface>
  );
}
```

- [ ] **Step 6: API keys view and the create dialog**

The list shows each key's scopes as outline badges under its row. The create dialog adds a `ScopePicker` bound through `Controller`; its options are the role's allowed scopes and it starts with the read scopes ticked (`defaultValues`, restored by `reset()` each time the dialog opens). Create is disabled while nothing is ticked. On success the dialog swaps to a one-time view of the key with a copy button; closing it clears the key. The submitted scopes are re-derived from the typed `scopes` prop, so the action receives `AccessScope[]` in catalogue order.

Create `apps/admin/src/app/(dashboard)/settings/api-keys/api-keys-view.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { SettingRow, SettingsSection, SettingsSurface } from "@/components/forms/settings-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AccessScope, ApiKeySummary } from "@/lib/api/types";
import { formatDate } from "@/lib/format";

import { deleteApiKeyAction } from "./actions";
import { CreateApiKeyDialog } from "./create-api-key-dialog";

export function ApiKeysView({ keys, scopes }: { keys: ApiKeySummary[]; scopes: AccessScope[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [target, setTarget] = useState<ApiKeySummary | null>(null);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    if (!target) return;
    const id = target.id;
    startTransition(async () => {
      try {
        await deleteApiKeyAction(id);
        toast.success("API key deleted");
        setTarget(null);
        router.refresh();
      } catch (err) {
        toast.error("Couldn't delete the key", { description: (err as Error).message });
      }
    });
  }

  return (
    <SettingsSurface>
      <SettingsSection
        title="API keys"
        description="Keys for scripts and agents that call this server's /mcp endpoint with an x-api-key header. A key acts as you in this organization."
        footer={
          <Button variant="primary" onClick={() => setCreating(true)}>
            Create key
          </Button>
        }
      >
        {keys.map((key) => (
          <div key={key.id} className="flex flex-col gap-2">
            <SettingRow
              id={`key-${key.id}`}
              label={key.name ?? "Untitled key"}
              hint={`${key.start ? `${key.start}… · ` : ""}Created ${formatDate(key.createdAt)} · ${
                key.lastUsedAt ? `Last used ${formatDate(key.lastUsedAt)}` : "Never used"
              }`}
            >
              <Button variant="ghost" onClick={() => setTarget(key)}>
                Delete
              </Button>
            </SettingRow>
            <div className="flex flex-wrap gap-1.5">
              {key.scopes.map((scope) => (
                <Badge key={scope} variant="outline" className="font-mono">
                  {scope}
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </SettingsSection>

      <CreateApiKeyDialog open={creating} onOpenChange={setCreating} scopes={scopes} />

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => !open && setTarget(null)}
        title={`Delete ${target?.name ?? "this key"}?`}
        description="Anything using this key stops working immediately."
        confirmLabel="Delete key"
        destructive
        pending={pending}
        onConfirm={onConfirm}
      />
    </SettingsSurface>
  );
}
```

Create `apps/admin/src/app/(dashboard)/settings/api-keys/create-api-key-dialog.tsx`:

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Copy } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/forms/field";
import { FormDialog } from "@/components/forms/form-dialog";
import { ScopePicker } from "@/components/forms/scope-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AccessScope } from "@/lib/api/types";
import { defaultSelected } from "@/lib/auth/oauth-flow";

import { createApiKeyAction } from "./actions";

const FORM_ID = "create-api-key-form";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  scopes: z.array(z.string()).min(1, "Choose at least one permission"),
});

type FormValues = z.infer<typeof schema>;

export function CreateApiKeyDialog({
  open,
  onOpenChange,
  scopes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scopes: AccessScope[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", scopes: scopes.filter(defaultSelected) },
  });
  const chosen = useWatch({ control, name: "scopes" });

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      try {
        const { key } = await createApiKeyAction({
          name: values.name,
          scopes: scopes.filter((scope) => values.scopes.includes(scope)),
        });
        setCreatedKey(key);
        router.refresh();
      } catch (err) {
        toast.error("Couldn't create the key", { description: (err as Error).message });
      }
    });
  });

  async function onCopy() {
    if (!createdKey) return;
    try {
      await navigator.clipboard.writeText(createdKey);
      toast.success("API key copied");
    } catch (err) {
      toast.error("Couldn't copy the key", { description: (err as Error).message });
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) setCreatedKey(null);
    onOpenChange(next);
  }

  if (createdKey) {
    return (
      <FormDialog
        open={open}
        onOpenChange={handleOpenChange}
        title="API key created"
        formId={FORM_ID}
        submitLabel="Done"
      >
        <form
          id={FORM_ID}
          onSubmit={(e) => {
            e.preventDefault();
            handleOpenChange(false);
          }}
          className="flex flex-col gap-3"
        >
          <div className="flex items-center gap-2">
            <Input readOnly aria-label="API key" value={createdKey} className="font-mono text-sm" />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onCopy}
              aria-label="Copy key"
            >
              <Copy />
            </Button>
          </div>
          <p className="text-sm text-ink-3">Copy this key now. It won&apos;t be shown again.</p>
        </form>
      </FormDialog>
    );
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Create API key"
      formId={FORM_ID}
      submitLabel="Create key"
      pending={pending}
      submitDisabled={chosen.length === 0}
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-5">
        <Field id="name" label="Name" required error={errors.name?.message}>
          <Input id="name" aria-invalid={!!errors.name} {...register("name")} />
        </Field>
        <Controller
          control={control}
          name="scopes"
          render={({ field }) => (
            <Field id="scopes" label="Permissions" required error={errors.scopes?.message}>
              <ScopePicker scopes={scopes} value={field.value} onChange={field.onChange} />
            </Field>
          )}
        />
      </form>
    </FormDialog>
  );
}
```

- [ ] **Step 7: Verify**

Run: `pnpm --filter admin typecheck`
Expected: exits 0 with no output from `tsc`.

Run: `pnpm --filter admin lint`
Expected: exits 0 with no problems reported.

- [ ] **Step 8: Commit**

```bash
git add "apps/admin/src/app/(dashboard)/settings/connected-apps" "apps/admin/src/app/(dashboard)/settings/api-keys" "apps/admin/src/app/(dashboard)/settings/settings-nav.tsx" apps/admin/src/lib/api/types.ts apps/admin/src/lib/api/server.ts
git commit -m "feat(admin): connected apps and api keys settings"
```

---

### Task 13: End-to-end verification against the isolated database

Runs the real API and admin app against `headless_lms_mcp` and drives the OAuth and MCP flows with HTTP. Every check below names its expected result. A failure is fixed in the task that owns the code, with a regression test there. Then this task is re-run from Step 2.

**Files:**
- Create (session scratchpad, never committed): `e2e.mjs`, a Node 22 script using `fetch`. It keeps cookies by hand, generates PKCE and DPoP with `node:crypto`, and prints one line per check: `PASS <n> <name>` or `FAIL <n> <name>: <expected> / <actual>`. It exits non-zero on any failure.

**Interfaces:**
- Consumes: everything from Tasks 1–12.
- Produces: nothing in the repo.

- [ ] **Step 1: Start the API and the admin app on the isolated database**

```bash
pnpm db:migrate
pnpm --filter @headless-lms/api dev
NEXT_PUBLIC_API_URL=http://localhost:8100 pnpm --filter admin exec next dev -p 8101
```

API on 8100 and database `headless_lms_mcp` from the worktree `.env`. Next.js reads `.env` only from `apps/admin`, which has none, so the admin app gets the API URL from `NEXT_PUBLIC_API_URL` on its command line and its port from `-p 8101`. Without them it would talk to the main checkout's API on 8000.

- [ ] **Step 2: Write and run the script with these checks, in order**

Discovery:
1. `GET /.well-known/oauth-protected-resource/mcp`: `authorization_servers[0] === 'http://localhost:8100/api/auth'`, `scopes_supported` equal to the 21 scopes, without `offline_access`.
2. `GET /.well-known/oauth-authorization-server/api/auth`: has `registration_endpoint`; `code_challenge_methods_supported` includes `S256`; `client_id_metadata_document_supported === true`; `token_endpoint_auth_methods_supported` includes `none`; `scopes_supported` includes the 21 scopes and `offline_access`.
3. `POST /mcp` without a credential → 401. `WWW-Authenticate` is exactly `Bearer resource_metadata="http://localhost:8100/.well-known/oauth-protected-resource/mcp", scope="<the 21 scopes, space-separated>"`.

Owner connection:

4. Sign up an owner (`POST /api/auth/sign-up/email`), create an org (`POST /api/organizations`), keep the cookie.
5. `GET /api/access/scopes` with the cookie → 21 entries, all `allowed: true`.
6. Register a public client by DCR: `POST /api/auth/oauth2/register` with `redirect_uris: ['http://127.0.0.1:9999/callback']` and `token_endpoint_auth_method: 'none'` → 201.
7. `GET /api/auth/oauth2/authorize` with the cookie: `response_type=code`, the client id, the redirect URI, `scope` = the 21 scopes plus `offline_access`, an S256 `code_challenge`, `state`, `resource=http://localhost:8100/mcp` → redirect to `http://localhost:8101/oauth/consent?…` with a signed query.
8. `GET` that consent URL from the admin app with the cookie → 200. The HTML contains the resource labels and the delete warning text. No delete checkbox is checked. Every `:read` checkbox is checked. No write checkbox is checked.
9. `POST /api/auth/oauth2/consent` with `{ accept: true, scope: 'courses:read courses:write offline_access', oauth_query }` → redirect with `code`.
10. `POST /api/auth/oauth2/token` (form-encoded, `authorization_code`, `code_verifier`, `resource`) → JWT `access_token` and `refresh_token`. Payload: `aud === 'http://localhost:8100/mcp'`, `iss === 'http://localhost:8100/api/auth'`, `org_id` = the org's Better Auth id. `scope` split on spaces equals the set `courses:read courses:write offline_access`.
11. `tools/list` (2025-11-25 headers) → exactly `list_courses`, `list_modules`, `create_course`, `update_course`, `update_course_settings`, `create_module`, `rename_module`, `reorder_modules`.
12. `create_course { title: 'E2E', description: 'Keep me', category: 'Ops' }` → a course. `update_course { courseId, status: 'published' }` → the course with `status: 'published'`, `description: 'Keep me'`, `category: 'Ops'`.
13. `tools/call delete_course { courseId }` → an error. `list_courses` still shows the course.
14. Refresh (`grant_type=refresh_token`) → a new access token. `tools/list` with it gives the same 8 tools.
15. Authorize again with the same client, then consent with `scope: 'courses:read courses:delete'` → new token. `tools/list` → `list_courses`, `list_modules`, `delete_course`, `delete_module`. `delete_course { courseId }` → `{ ok: true }`, and `list_courses` no longer shows it.
16. Consent with `scope: 'courses:read media:upload'` (not requested) → 400.

Instructor ceiling:

17. The owner invites an instructor (`POST /api/organizations/invites` with `role: 'instructor'`). The instructor signs up and accepts (`POST /api/organizations/invites/accept`) with their own cookie.
18. `GET /api/access/scopes` as the instructor → exactly `courses:read`, `downloads:read`, `bundles:read`, `media:read`, `automations:read`, `comments:read` allowed.
19. The instructor authorizes a new client and consents with `scope: 'courses:read courses:write'` → token. `tools/list` → only `list_courses` and `list_modules`.
20. The instructor's `POST /api/access/api-keys { name: 'x', scopes: ['courses:write'] }` → 403.

Revocation, audience and binding:

21. `DELETE /api/access/apps/<clientId>` with the owner cookie → 204. The owner token from check 15 now gets 401 on `/mcp`.
22. A token minted with `resource=http://localhost:8100/other` is either refused at the token endpoint or gets 401 on `/mcp`.
23. DPoP: authorize, consent and exchange with a `DPoP` proof header → `token_type` `DPoP`. `POST /mcp` with `Authorization: DPoP <token>` and a fresh proof (`htm: POST`, `htu: http://localhost:8100/mcp`, `ath`) → 200. The same token as `Authorization: Bearer <token>` → 401.

API keys:

24. Owner `POST /api/access/api-keys { name: 'analytics', scopes: ['analytics:read'] }` → 201 with `key` and `scopes: ['analytics:read']`.
25. `POST /mcp` with `x-api-key: <key>`: `tools/list` → exactly the 5 analytics tools. `get_dashboard` returns the overview.
26. `GET /api/access/api-keys` → the key with `scopes: ['analytics:read']` and no `key` field.
27. `DELETE /api/access/api-keys/<id>` → 204. The key now gets 401.

Org choice:

28. The owner creates a second org, which becomes the session's active org. A fresh authorize redirects to the consent page for that org, which names it and links "Choose another organization" to `http://localhost:8101/onboarding/select-organization` with the signed query. Set the first org active (`POST /api/auth/organization/set-active`), then `POST /api/auth/oauth2/continue` with `{ postLogin: true, oauth_query }` → a redirect to the consent page, not back to the picker. Consent and exchange → the token's `org_id` is the first org's Better Auth id.

OAuth off:

29. Stop the API and start it with `BETTER_AUTH_URL=http://192.168.1.10:8100`. The log has exactly one warning naming `BETTER_AUTH_URL`. `GET /.well-known/oauth-protected-resource/mcp` → 404. `POST /mcp` with a new owner API key (`scopes: ['courses:read']`) → `tools/list` gives `list_courses` and `list_modules`. Restore `BETTER_AUTH_URL` afterwards.

Run: `node <scratchpad>/e2e.mjs`
Expected: 29 `PASS` lines, exit code 0.

- [ ] **Step 3: Record the results**

Write every check's expected and actual value into the task report. For each failure: fix it in the owning task's code with a regression test, commit, and re-run Step 2 from the start.

- [ ] **Step 4: Final full verification**

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter admin lint
pnpm build:packages
```

Expected: all five exit 0.
