# Org-scoped students — Implementation Plan

> Executes the spec `docs/superpowers/specs/2026-07-21-org-scoped-students-design.md`. Baseline regen (no ALTER migration). Everything is interdependent — do it as one vertical so the app stays working.

**Goal:** `students` become org-scoped `(org_id, id)`; the student portal resolves its org at the boundary; a seeded, loginable org-scoped dev student is enrolled in a deterministic **Foundations** course (with the captured authored content) inside a dev org.

## Order of work

### 1. Schema
- `packages/server/src/adapters/db/schema/identity.ts` — `students`: add `orgId` (`text("org_id").notNull().references(() => organizations.id)`), composite `primaryKey({ columns: [t.orgId, t.id] })`, `unique().on(t.orgId, t.email)`, `unique().on(t.orgId, t.externalId)`. Add imports: `primaryKey`, `unique`, `organizations` (from `./organizations.js`). `id` keeps `$defaultFn(genId("student"))`.
- `packages/server/src/adapters/db/schema/entitlements.ts` — remove the single-col `references(() => students.id)` on `student_id`; add composite FK `foreignKey({ columns: [t.orgId, t.studentId], foreignColumns: [students.orgId, students.id] })`.
- `packages/types/src/identity.ts` — add `readonly orgId: string;` to `Student`.

### 2. Identity (org param)
- `core/identity/ports.ts`, `service.ts`, `adapters/db/repositories/identity.ts`: `getStudentByExternalId(orgId, externalId)` and `findStudentByExternalId(orgId, externalId)` — repo filters `and(eq(students.orgId, orgId), eq(students.externalId, externalId))`. `RegisterStudentInput` gains `orgId`; `registerStudent`/`insertStudent` set it.
- Update `core/identity/service.test.ts` fakes to the new signatures.

### 3. Portal org resolution + scope
- New `http/portal-org.ts`: `resolvePortalOrg(container, req): Promise<string>` — reads org slug from header `x-portal-org` (fallback env `PORTAL_ORG_SLUG`); resolves slug → `organizations.id` via `container.organizations` (add a `getBySlug` if absent — check `core/organizations` surface; else query). Throw a typed `UnknownPortalOrgError` (→ 400) if unresolved.
- `http/student-scope.ts`: `resolveStudentScope` returns `{ studentId: string; orgId: string }`. Body: `orgId = await resolvePortalOrg(...)`; `student = await identity.getStudentByExternalId(orgId, authUser.id)`; `NotAStudentError` → 403. Map `UnknownPortalOrgError` in `plugins/error-handler.ts` (→ 400).
- Update `http/student-scope.test.ts` for `{ studentId, orgId }` and the org-resolution path.

### 4. Learn API (org-scoped)
- `reporting/learn/ports.ts` + `service.ts`: methods take `(orgId, studentId, …)`. `LearnEnrollmentReader.activeRefs(orgId, studentId)` / `activeRef(orgId, studentId, courseId)`. Service passes `orgId` to `content.get(orgId, …)`/`listForCourse(orgId, …)`.
- `adapters/db/repositories/learn.ts`: add `eq(enrollments.orgId, orgId)` to `baseFilters`.
- `http/routes/learn.ts`: pass `scope.orgId` + `scope.studentId`. Add `GET /api/learn/org` → `{ id, name, slug }` for `scope.orgId` (new `LearnOrg` schema in `api-contract/learn.ts`, tag `Learn`, `operationId: getLearnOrg`).
- Update `reporting/learn/service.test.ts` for the org param.
- `adapters/db/repositories/students.ts` (reporting/students): joins `eq(students.id, enrollments.studentId)` → `and(eq(students.orgId, enrollments.orgId), eq(students.id, enrollments.studentId))`; the `user` leftJoin on `students.externalId` is unaffected.

### 5. Seed (org-scoped)
- `composition/seed.ts` random loop: students already created inside an org loop — set `orgId` on each pushed student row.
- `composition/seed-dev-student.ts`:
  - Dev student row gets `orgId: ORG_ID` (the existing `org_dev_academy`).
  - Give the dev org a known slug (it already is `dev-academy`).
  - **Add a deterministic Foundations course** in `ORG_ID`: read `/private/tmp/claude-501/-Users-mdwt-dev-headless-lms-headless-lms-content/f2d94ba4-e5f2-44ec-a12e-d3f64238aa65/scratchpad/foundations-capture.json`; recreate course `crs_dev_foundations` (title "Foundations", published, category from capture), module `mod_dev_foundations` (title "This is my cool course", seq 0), activity `act_dev_foundations` (seq 0, settings = the captured activity's settings with `published:true` and its `content` blob verbatim — embed the JSON). Enroll the dev student (`enr_dev_foundations2`) active. All `onConflictDoNothing`.
  - Keep the existing "Welcome to Atelier" course + enrollment.

### 6. Student app (portal org)
- `apps/student/src/lib/api/server-call.ts`: `authHeaders()` also sends `x-portal-org` — resolve the portal org slug: read from the request host (subdomain) else env `NEXT_PUBLIC_PORTAL_ORG_SLUG ?? "dev-academy"`. For the baseline, a `portalOrgSlug()` helper returning the env/default is enough (host-based can come later).
- `apps/student/src/lib/api/server.ts`: add `learnApi.org()` → `Learn.getLearnOrg(...)` returning `{ id, name, slug }`.
- Branding: `app/page.tsx` (and the course page) fetch `learnApi.org()`; pass `orgName` to `DashboardHeader`/`PlayerHeader` to replace the hardcoded "Atelier"/"A" brand with the org name/initial.

### 7. Baseline regen + verify
- Stop running servers (`pkill -f "next dev"`, `pkill -f "@headless-lms/api"`).
- Wipe DB: `docker exec headless-lms-postgres psql -U postgres -d headless_lms -c "drop schema public cascade; create schema public;"`.
- Regenerate baseline: `rm -rf packages/server/drizzle/*` then `pnpm --filter @headless-lms/server db:generate` (fresh `0000_baseline.sql`).
- Apply: `pnpm --filter @headless-lms/api db:migrate`.
- Seed: `pnpm --filter @headless-lms/api seed` then `pnpm --filter @headless-lms/api seed:dev`.
- Regenerate SDK (DB up, api buildable): `pnpm gen:sdk`; commit `packages/sdk/openapi.json` + `src/generated`.
- Gate (paste output): `pnpm --filter @headless-lms/server test && pnpm --filter @headless-lms/server typecheck && pnpm --filter @headless-lms/server lint && pnpm --filter student typecheck && pnpm --filter student lint && pnpm --filter student build`.
- Live check: boot api; `POST /api/auth/sign-in/email` as `student@example.com`/`password123` → 200; `GET /api/learn/courses` (with cookie + `x-portal-org: dev-academy`) returns **Foundations** and **Welcome to Atelier**; `GET /api/learn/org` returns the dev org. Stop the server after.
- Update `AGENTS.md` multi-tenancy note (students org-scoped).

## Commits (per section, no AI-attribution trailer)
schema+types · identity · portal-org+scope · learn-api+reporting · seed · student-app · sdk regen · docs.

## Notes
- Everything above is interdependent; the app will not typecheck until the whole backend chain (2→4) is consistent. Do 1→4 before running the gate.
- The captured Foundations content references a seed asset (a PDF file node) whose asset row is wiped; the file node still renders (download 404s) — fine for a dev baseline.
