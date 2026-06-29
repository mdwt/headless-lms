# Domain Cleanup — Spec

Status: approved design, ready for implementation plan.
Date: 2026-06-29.

## Problem

The domain decomposition under `apps/api/src/core/` and `docs/domain/` contains contexts that are not bounded contexts. Three are the same anti-pattern — one concept split into a "spec" context and an "implementation" context — and two are dead deferred placeholders. Two more are query projections masquerading as domains. The architecture docs additionally describe a build state (`adapters/inmemory/`, "in-memory / stub" contexts) that **no longer matches the code**.

### Confirmed in code

- `core/team` defines its own `Member` + `Role` union; `core/organizations` defines `Membership`/`Invitation` + an identical `Role` in `roles.ts` + the permission matrix. `team/service.ts` writes through the `OrgAdmin` port to the **same Better Auth member/invitation tables** organizations mirrors. → `team` is membership behavior split off from its data. One concept.
- `core/courses` and `core/modules` both claim the Course → Module → Item tree. `modules` requires `Module.courseId` and every write "returns the course's full module list" — the signature of a single aggregate (Course root + Module/Item/Lesson entities), not two contexts.
- `core/entitlements` and `core/enrollments` both model a student↔course access grant. entitlements is the "intended owner"; enrollments is "the live surface." One concept.
- `core/students` model is `{ name, email, enrollmentCount, avgProgress, lastActiveAt }` — the identity user record plus two fields owned by other domains (count → entitlements, avgProgress → progress). It is a composed read, owned by no domain. `core/dashboard` is a cross-context stats query. Neither owns data or rules.
- `core/offers`, `core/billing` are deferred and unused. They must not exist even as placeholders.
- **`adapters/inmemory/` does not exist.** All contexts are wired to Drizzle repositories in `composition/container.ts` against real schema in `adapters/db/schema/`. `architecture.md` and `CLAUDE.md` still describe in-memory repos and "in-memory / stub" contexts — stale.

## Target decomposition

Six domains in `core/`, plus a `reporting/` read layer outside the domains.

| `core/` domain | Absorbs | Owns |
|---|---|---|
| **identity** | — | User identity and authentication only. Better Auth handles credentials/sessions behind an auth port. Owns the domain user record other contexts reference. No org/membership. |
| **organizations** | `team` | The tenant. Organization, Membership, Invitation, and the role model (Owner/Admin/Instructor/Student; instructor course-scoped; permission matrix). Better Auth org plugin is the source of truth, mirrored into core via `databaseHooks` (read-only mirror; writes go through Better Auth). |
| **courses** | `modules` | Curriculum aggregate: Course → Module → Item → Lesson, drip/unlock rules. The Course is the aggregate root; Module/Item/Lesson are entities under it. |
| **entitlements** | `enrollments` | Access grants: a student↔course access grant, its status, and source. The grant **references the course directly** (no offer, no order). |
| **progress** | — | Per-student completion of curriculum items; derived percentage against current structure. |
| **assets** | — | Org media library; presigned upload/download via the storage adapter. |

**Removed entirely** (folders, schema, repos, routes, contract, SDK surface, docs — no placeholders): `offers`, `billing`, `team`, `modules`, `enrollments`, `students`, `dashboard` as `core/` contexts.

### Domain definitions (authoritative — these replace the `docs/domain/*.md` text)

**identity** — User identity and authentication only. Better Auth handles credentials/sessions behind an auth port. Owns the domain user record other contexts reference by id. Does not own org, membership, roles, access, or completion.

**organizations** — The tenant root every org-scoped context FKs to. Owns Organization, Membership, Invitation, and the role model: `owner | admin | instructor | student`, instructor course-scoped via a course assignment, with the permission matrix defined in code. Better Auth's organization plugin is the source of truth; core holds a **read-only mirror** populated by `databaseHooks` — all writes (invite, change-role, remove, "owner role is immutable") go through Better Auth via the `OrgAdmin` port. References the identity user id on membership and a course id on course assignments. Does not own the user record (identity), access (entitlements), or content (courses).

**courses** — The curriculum aggregate, static and shared across students. Course (root): title, slug, status, ordered modules. Module: title, order, ordered items. Item: a discriminated slot — a Lesson (`video | text | pdf | audio | download | embed`, optional `assetId`, completion rule) or a typed assessment slot (`quiz | assignment` authoring stub; the grading engine is out of scope — see Decisions). Owns drip/unlock rules defined on structure. References assets by `assetId`. Does not own per-student state.

**entitlements** — The access grant: student↔course access, its validity, and lifecycle. Status `active | expired | revoked`; source `manual | import` (see Decisions). Use cases `grant` / `list` / `setStatus`. Grant references the course by id directly; denormalizes student/course display fields for list rendering. Access ≠ completion: a grant and progress move independently. Does not own money, content, or completion.

**progress** — Per-student completion records (student + curriculum item + `completed_at`) and derived percentage computed against the course's current published structure at read time (no stored percentage). Resume point. Two completion paths: direct (presentational lessons) and event-driven (assessment outcome events, if/when an assessment engine exists). References items (courses) and the user (identity) by id. Does not own structure, access, or outcomes.

**assets** — The org's media library: a registry row per stored object, its lifecycle, and the org-scoped storage key. Upload/serve via short-lived presigned URLs (bytes never transit the API). Implemented over the `ObjectStorage` port (MinIO/S3). Org-scoped; cross-org reads return null.

## Reporting read layer (`src/reporting/`)

A dedicated read-side that exists only for composed reads across contexts. It calls each context's public service (or reads purpose-built read tables) and assembles views such as the students list and the dashboard overview. It owns no write logic and no domain rules — it is a query layer.

**Why it lives outside `core/`:** a domain owns data and business rules and depends on nothing outward. Reporting owns no data and no rules — it reads many domains' public surfaces. Putting it in `core/` next to the domains would grant it the one privilege domains explicitly do not have: depending on multiple other contexts. That would break the symmetry that makes the core's boundaries enforceable. Reporting is structurally different from a domain, so it sits apart.

**Location:** `apps/api/src/reporting/`, a sibling of `core/`, `http/`, `composition/`. It is an application-level concern that composes domain outputs, not a domain itself.

**Contents:**
- `reporting/students/` — the students-list view (identity user + `enrollmentCount` from entitlements + `avgProgress` from progress), paged/filtered/org-scoped.
- `reporting/dashboard/` — the cross-domain overview stats.

**Dependency rules (new, enforced by the boundary linter):**
- `reporting/` may import any `core/<ctx>/index.ts` public surface (the only place allowed to read multiple contexts).
- `reporting/` may not import `adapters/`, `http/`, or another context's internals.
- `core/` may not import `reporting/`.
- Inbound (`http/`) and `composition/` may import `reporting/`.

If a composed read needs its own persistence for performance, reporting may own purpose-built **read tables** populated from domain events; these are read models, not domain tables, and live under `adapters/db/schema/reporting.ts`. (Not required initially — the first cut composes public services.)

## Code changes (`apps/api/src/`)

### core/
- **Delete** `core/offers`, `core/billing`, `core/students`, `core/dashboard`.
- **Merge `core/team` → `core/organizations`:** move invite/change-role/remove/list member operations onto the organizations service (or an `organizations` member sub-service); delete `team`'s duplicate `Member` and `Role`; reuse `organizations/roles.ts`. Member writes continue through the `OrgAdmin` port. `TeamRuleError` → `OrganizationRuleError` (still surfaces as `409`).
- **Merge `core/modules` → `core/courses`:** Module/Item/Lesson become part of the courses model/service; the module-editor write surface (`listForCourse`, `reorder*`, `saveItem`, `delete*`) become courses use cases. One aggregate.
- **Merge `core/enrollments` → `core/entitlements`:** keep the name `entitlements`; move `grant`/`list`/`setStatus` and the `Enrollment` model in; grant references course id directly.
- Keep `core/identity`, `core/progress`, `core/assets` as-is (definitions retuned per above).

### adapters/db/
- **schema/:** delete `offers.ts`, `billing.ts`; fold `modules.ts` into `courses.ts`; fold `enrollments.ts` into `entitlements.ts` (or keep table names, re-home them under the owning context's schema file); drop `students`/`dashboard` projection tables if any. Update `schema/index.ts`.
- **repositories/:** delete `offers.ts`, `billing.ts`, `students.ts`, `dashboard.ts`; merge `team.ts` into `organizations.ts`, `modules.ts` into `courses.ts`, `enrollments.ts` into `entitlements.ts`.
- Generate a migration for dropped tables (`offers`, `billing`, and any `students`/`dashboard` tables) once schema settles.

### reporting/
- Create `reporting/students/` and `reporting/dashboard/` composing `core` public services (move the read logic out of the deleted `core/students` and `core/dashboard`).

### composition/container.ts
- Remove offers/billing/students/dashboard/team/modules/enrollments service + repo wiring.
- Wire `organizations` (with member ops + `OrgAdmin`), `courses` (with modules), `entitlements` (with enrollments).
- Wire reporting services (`StudentsReport`, `DashboardReport`) with the `core` public services they compose.

### http/routes/
- Delete `offers.ts`, `billing.ts`.
- Fold `team.ts` routes into `organizations` routes; `modules.ts` into `courses` routes; `enrollments.ts` into `entitlements` routes (resolve the existing duplicate `entitlements.ts` + `enrollments.ts`).
- Move `students.ts` and `dashboard.ts` routes to call the `reporting` services (the routes can stay; their handlers call reporting, not a `core` domain).
- Update `server.ts` registrations.

### packages/api-contract + packages/sdk
- Remove offers/billing schemas. Consolidate modules schemas under courses, enrollments under entitlements; keep students/dashboard contract (now served by reporting).
- Run `pnpm gen:sdk`; commit `openapi.json` + `src/generated/`.

### .eslintrc.cjs
- Update the context list to the 6-domain set.
- Add the `reporting/` boundary rules (above): reporting may import any `core/*` index; core may not import reporting.

## Doc changes (`docs/`)

### docs/domain/
- **Keep + rewrite:** `identity.md`, `organizations.md`, `courses.md`, `entitlements.md`, `progress.md`, `assets.md` — to the authoritative definitions above, with build-state notes that match the code (all six persisted via Drizzle).
- **Delete:** `team.md`, `modules.md`, `enrollments.md`, `offers.md`, `billing.md`.
- **Add:** `docs/domain/reporting.md` (or a `docs/reporting.md`) documenting the read layer and the "why it lives outside core" rationale above.

### docs/architecture.md
- Replace the contexts section with the 6-domain map + the reporting layer.
- **Remove the stale build-state framing:** no `adapters/inmemory`, no "in-memory / stub" tags — all six domains are built and Drizzle-persisted. State plainly that offers/billing are not part of the system (no deferred placeholders).
- Remove the read-models section (students/dashboard) and the money/access/billing-separation paragraphs.
- Update the Layout block: `core/` lists the six domains + `shared/`; add `reporting/` as a sibling of `core/`, `http/`, `composition/`; `adapters/` has no `inmemory/`.
- Update the boundaries section with the reporting rules.

## CLAUDE.md changes

- Architecture paragraph: 6 domains (`identity`, `organizations`, `courses`, `entitlements`, `progress`, `assets`) + `core/shared`; `reporting/` read layer outside core. Remove the "14 bounded contexts", in-memory/stub enumeration, and the `adapters/inmemory/` description.
- Multi-tenancy section: unchanged in substance (organizations is the tenant root) — verify wording.
- API contract section: drop offers/billing from "specced resources"; note students/dashboard are served by reporting.
- Import-boundaries section: add the `reporting/` rules.

## Decisions

1. **`source` enum:** drop `purchase` from the entitlement source enum, leaving `manual | import`, so there is zero billing footprint. Re-add only if a billing context is ever built.
2. **Assessment:** there is no assessment domain (the assessment/grading concept is archived under `docs/archive/`). Course assessment **items** remain typed authoring slots inside the courses aggregate. Reframe the "assessment context" references in the courses/progress docs as typed item-slots + (for progress) an optional future outcome-event source — not a referenced domain. Do not create an `assessment` placeholder.

## Verification

- `pnpm lint` passes (boundary rules for 6 domains + reporting).
- `pnpm typecheck` passes.
- `pnpm test` passes (merged-context unit tests).
- `pnpm gen:sdk` produces no unexpected diff after regeneration; `openapi.json` has no offers/billing/modules/enrollments tags.
- `grep -ri "inmemory\|offers\|billing" docs/ CLAUDE.md apps/api/src` returns only intentional matches (e.g. `OrgAdmin`, unrelated words) — no stale context references.
- `core/` contains exactly: `identity`, `organizations`, `courses`, `entitlements`, `progress`, `assets`, `shared`.
