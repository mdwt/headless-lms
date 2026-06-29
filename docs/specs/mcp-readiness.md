# MCP Readiness — Spec

Expose the LMS over MCP so AI/agent clients act **on a user's behalf**, authenticated via OAuth 2.1 (Better Auth `oidcProvider` + `mcp`), authorized by **org + role + scopes**, multi-tenant. MCP is just another **inbound entry point** — its tools are thin wrappers over context services, owning no business logic.

## Better Auth setup

```ts
// adapters/auth/index.ts — plugins
oidcProvider({
  loginPage: "/sign-in",          // reuse existing Better Auth login
  consentPage: "/oauth/consent",  // new page (see Pages)
  scopes: SCOPES,                 // see Scopes
  // allowDynamicClientRegistration: true  // MCP clients self-register
}),
mcp({ loginPage: "/sign-in" }),
```

- **New auth tables** (system of record = Better Auth): run `npx @better-auth/cli generate` after adding the plugins → adds the OIDC provider tables (oauth application / access token / consent). Append them to `adapters/auth/schema.ts`, then `pnpm db:generate && db:migrate`. Not mirrored into core (auth infra).
- Add the MCP resource origin to `trustedOrigins`.

## Flows

1. MCP client hits the MCP endpoint with no token → `401` + discovery metadata.
2. **Dynamic client registration** (client self-registers) → **auth-code + PKCE**.
3. Browser opens `loginPage` → user signs in with the **existing** Better Auth login (email/magic-link/social).
4. **Consent page** lists the client + requested scopes → user approves.
5. Token exchange → access token (+ refresh). Client calls MCP with `Authorization: Bearer …`.
6. `withMcpAuth` validates the token → `getMcpSession` → principal `{ studentId, orgId, role, scopes }`.

## Pages required

| Page | Status | Purpose |
|---|---|---|
| `/sign-in` | exists / reuse | user authentication (the `loginPage`) |
| `/oauth/consent` | **new** | shows client + requested scopes; approve/deny (UI only; plugin handles the backend) |
| `/settings/connected-apps` | **new, optional** | org admin: list & revoke authorized clients/tokens |

## Endpoints (mounted by Better Auth, under `/api/auth`)

- `.well-known/oauth-authorization-server`, `.well-known/oauth-protected-resource` — discovery (`oAuthDiscoveryMetadata`).
- `authorize`, `token`, `register` (DCR), consent — OAuth/OIDC.
- **`POST /mcp`** (Streamable HTTP) — your MCP server, wrapped in `withMcpAuth`.

## Scopes (vocabulary = the permission model)

`resource:action`, mapped onto the slice-1 capabilities:

- `courses:read`, `courses:write`
- `students:read`, `progress:read`
- `enrollments:read`, `enrollments:write`
- `assessments:read`
- `org:read`
- standard: `openid`, `profile`

## Roles & authorization (two gates, both must pass)

The MCP principal's **role** = the user's org membership role (`owner|admin|instructor|student`). For every tool call:

1. **Scope gate** — the token must carry the scope the tool needs (what the *app* was granted).
2. **Role gate** — `capability(role, permission)` must allow it (what the *user* may do), and course-scoped tools also run `canForCourse(role, perm, { assignedCourseIds, courseId })`.

A token can never exceed the user's own role: **effective = scopes ∩ role-permissions**. `orgId` from the principal scopes every query → multi-tenant by construction.

### Tenant isolation (platform invariant)

Tenant isolation is enforced **at the data layer**, not per-tool: the auth token is scoped to an org, and every org-scoped table carries `org_id`. The MCP principal resolves `orgId`, and tool service calls operate within that tenant once the data layer is org-scoped. **Dependency (tracked):** the back-office contexts (`courses`, `enrollments`, `students`) are currently single global in-memory stores with no `org_id`; they must thread `org_id` through their queries/repos for the isolation guarantee to hold. Until then the MCP tools operate on the shared demo dataset. This is a known data-layer fix, not an MCP-layer change — MCP already carries the tenant on the principal.

## Capabilities — what makes a good MCP tool

A good MCP capability is **task-shaped, read-first, low-blast-radius, and a thin wrapper over a context service** (not raw CRUD). Tools map to inbound use cases, so the same authz as HTTP applies.

Principles:
- **Read tools first** — highest value (agents summarize/answer), zero write risk.
- **Reversible/idempotent writes** next, gated by scope + role.
- **Defer destructive/irreversible** (delete, publish, refund) — or require admin role + an explicit high scope.

**Recommended v1 tool set:**

| Tool | Scope | Role gate |
|---|---|---|
| `list_courses(query)` | `courses:read` | any member |
| `get_course(id)` | `courses:read` | any member |
| `get_student_progress(studentId, courseId)` | `progress:read` | admin/owner, or instructor (assigned) |
| `list_enrollments(query)` | `enrollments:read` | admin/owner/instructor |
| `enroll_student(studentId, courseId)` | `enrollments:write` | admin/owner (reversible via revoke) |

Defer: delete/publish course, billing, member management.

## Architecture placement

- **MCP server** → new inbound entry point `apps/api/src/http/mcp/` (wraps `withMcpAuth`, exposes tools that call context services through the container). No business logic — same rule as `http/` routes.
- **Auth config + OIDC tables** → `adapters/auth/`.
- Tools reuse the existing services (`courses`, `enrollments`, `progress`, `assessment`, …) and the slice-1 permission helpers.

## Decisions (resolved)

1. **v1 tool set** — reads **plus** the guarded write (`enroll_student`).
2. **Client registration** — **open DCR**. Any MCP client self-registers; the gate is per-user login + consent. Per-org allow-list deferred.
3. **Token subject** — **per-user tokens only** (the token acts as the signed-in user, scoped to their org + role). No per-org service tokens in v1.
