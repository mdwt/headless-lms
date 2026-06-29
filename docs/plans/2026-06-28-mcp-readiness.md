# MCP Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development to execute task-by-task. Spec: `docs/specs/mcp-readiness.md`.

**Goal:** Make the LMS an OAuth 2.1 / MCP provider via Better Auth so AI clients act on a signed-in user's behalf, authorized by org + role + scopes (per-user tokens, open DCR, reads + 2 guarded writes).

**Approach:** Use Better Auth's `mcp` plugin (bundles OIDC; `oidcProvider` is deprecated). Hand-write the 3 OAuth tables in the auth schema. Mount discovery at root. Add a principal/role resolver over the slice-1 permission model. Add an MCP server route (`@modelcontextprotocol/sdk`) whose tools wrap existing context services with two-gate authz (scope ∩ role).

## Global Constraints

- Node 22, ESM, `.js` import specifiers. `core/` stays framework/runtime/persistence-free.
- Better Auth is the system of record; new OAuth tables live in `adapters/auth/schema.ts` (not mirrored to core).
- No Postgres enums; discriminators are text.
- Auth is mounted at `/api/auth/*` in `server.ts` by bridging a Web `Request` to `auth.handler` (use the same bridge for new root endpoints).
- Per-request auth today: `app.requireSession` decorator sets `request.authUser` + `request.orgId` (from `session.activeOrganizationId`). No role is derived yet.
- Verify: `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test`. DB is local Postgres (`docker compose up -d`), `.env` present.

---

## Slice A — Better Auth MCP/OAuth provider setup

### Task A1: OAuth tables + `mcp` plugin

**Files:** Modify `apps/api/src/adapters/auth/schema.ts`, `apps/api/src/adapters/auth/index.ts`, `apps/api/src/composition/config.ts` (or wherever `CreateAuthOptions` is fed).

- [ ] **Add the 3 OAuth tables** to `adapters/auth/schema.ts` (fields from better-auth oidc-provider schema; text columns, snake_case):
  - `oauth_application`: `id` text pk, `name` text notNull, `icon` text, `metadata` text, `client_id` text notNull unique, `client_secret` text, `redirect_urls` text notNull, `type` text notNull, `disabled` boolean default false, `user_id` text → `user.id` (cascade), `created_at`/`updated_at` timestamps notNull.
  - `oauth_access_token`: `id` text pk, `access_token` text notNull unique, `refresh_token` text notNull unique, `access_token_expires_at`/`refresh_token_expires_at` timestamps notNull, `client_id` text → `oauth_application.client_id`... (reference by client_id; use a plain text column + index, FK optional), `user_id` text → `user.id` (cascade), `scopes` text notNull, `created_at`/`updated_at` timestamps notNull.
  - `oauth_consent`: `id` text pk, `client_id` text notNull, `user_id` text → `user.id` (cascade), `scopes` text notNull, `consent_given` boolean notNull, `created_at`/`updated_at` timestamps notNull.
- [ ] **Add `mcp` to the plugins array** in `createAuth`:
  ```ts
  import { magicLink, organization, mcp } from "better-auth/plugins";
  // ...
  mcp({
    loginPage: opts.mcpLoginPage,            // e.g. `${adminOrigin}/login`
    oidcConfig: {
      allowDynamicClientRegistration: true,  // open DCR
      storeClientSecret: "hashed",
      scopes: [
        "openid", "profile",
        "courses:read", "courses:write",
        "students:read", "progress:read",
        "enrollments:read", "enrollments:write",
        "assessments:read",
        "org:read",
      ],
      getConsentHTML: (p) => /* minimal HTML form POSTing code + accept to /api/auth/oauth2/consent */,
    },
  }),
  ```
- [ ] Add `mcpLoginPage: string` to `CreateAuthOptions` and `Config`; feed it from env (`MCP_LOGIN_PAGE`, default the admin `/login`). Add the var to `.env.example`.
- [ ] `pnpm db:generate && pnpm db:migrate` to create the tables.
- [ ] Verify `pnpm typecheck` + `pnpm build`. Boot the app; confirm no plugin init error.

### Task A2: Discovery endpoints at root

**Files:** Modify `apps/api/src/http/server.ts`.

- [ ] Import `oAuthDiscoveryMetadata`, `oAuthProtectedResourceMetadata` from `better-auth/plugins/mcp`.
- [ ] Register two root routes — `GET /.well-known/oauth-authorization-server` and `GET /.well-known/oauth-protected-resource` — each bridging the Fastify request to the helper's `(request: Request) => Promise<Response>` exactly like the existing `/api/auth/*` bridge (build a Web `Request`, call the handler, copy status/headers/body back).
- [ ] Verify: boot the app, `curl localhost:3000/.well-known/oauth-authorization-server` returns JSON metadata listing the `/api/auth/mcp/*` authorize/token/register endpoints.

---

## Slice B — Principal + authorization (outline)

- Add `organizations.getMembership(orgId, studentId): Promise<{ membershipId, role } | null>` (port + service + repo: `findMembershipByStudent`).
- Add an MCP principal resolver (inbound helper): `OAuthAccessToken.userId → identity.getStudentByAuthUserId → student`; org = active org (default the user's sole membership for v1); `organizations.getMembership` → role; `assignedCourseIds`. Returns `{ studentId, orgId, role, assignedCourseIds, scopes }`.
- Add `authorize(principal, scope, permission, courseId?)`: requires `scopes.includes(scope)` **and** `capability(role, permission)` (or `canForCourse` when `courseId`). Unit-tested pure helper.

## Slice C — MCP server route + tools (outline)

- Add `@modelcontextprotocol/sdk`. Implement an MCP server (Streamable HTTP) at `apps/api/src/http/mcp/`, the transport handler wrapped in `withMcpAuth(auth, handler)`; resolve the principal from the session token.
- Tools (each: validate input via zod, run `authorize(...)`, call the container service): `list_courses`, `get_course`, `list_enrollments`, `enroll_student` (`enrollments.grant`), `get_student_progress` (from `students.get().avgProgress` for v1).
- Register the route in `server.ts`.

## Slice D — Management (outline, optional)

- `/settings/connected-apps` admin surface to list/revoke a user's authorized clients + tokens (reads `oauth_access_token`). Deferred.

---

## Decisions baked in
- `mcp` plugin only (not deprecated `oidcProvider`); per-user tokens; open DCR; inline `getConsentHTML`; tables hand-written; `get_student_progress` v1-sourced from `students.avgProgress`; one guarded write (`enroll_student`).
