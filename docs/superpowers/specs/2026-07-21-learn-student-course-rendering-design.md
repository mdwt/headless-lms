# Design: Real course data in the student dashboard (the `Learn` surface)

Date: 2026-07-21
Branch: `feat--swappable-content`

## Goal

Render real course content in `apps/student`, replacing its fully-mocked
prototype. Course content is displayed through the RSC-safe `Renderer` from
`@headless-lms/content-plate` — the same rendering path admin's activity preview
uses. To feed it, add an entitlement-scoped read API (`Learn`) that the student
app consumes server-side.

## Constraints & key facts (discovered, load-bearing)

- **The existing course API is back-office only.** Every route in
  `packages/server/src/http/routes/courses.ts` runs `preHandler:
  app.requireSession` and resolves data via `resolveScope(req)` →
  `scope.orgId` (the session's active organization) + a staff domain user.
  It lists every course in the org, drafts included. There is no anonymous or
  student-scoped path. `apps/student` has no auth today.
- **`listCourses` supports a `status: "published"` filter** (`CoursesQuery` in
  `packages/api-contract`).
- **Roles are `owner | admin | instructor`** (`core/organizations/roles.ts`) —
  there is **no student role**. Students are global identities linked to orgs
  through **entitlements (enrollments)**, not org membership.
- The roles matrix already defines a `consume_content` permission with an
  `"enrolled"` capability ("access owned by entitlements"), currently
  **unassigned to any role** — the reserved hook for student consumption.
- **A session can have `activeOrganizationId: null`.** `requireSession`
  authenticates any valid session (`req.authUser` set); only `resolveScope`
  demands the org. A student with no org membership still holds a valid session.
- **`IdentityService.getStudentByExternalId(externalId)` exists** — a student
  session resolves `req.authUser.id` → a domain `Student`.
- **Renderer contract:** `Renderer({ config: unknown })` builds a server-side
  Slate editor from `BaseEditorKit` and renders via `PlateStatic` — no
  `'use client'`, no editor JS shipped. The Plate value lives at
  `activity.settings.content.config`; `settings.content` is
  `{ config, type, version }` (`ActivityContent`). Renderers must refuse a blob
  whose `type`/`version` don't match `meta` (admin does this in its preview
  page).
- **`reporting/` is the only layer allowed to read multiple contexts.**
  `container.reporting.{students,dashboard}` each wrap a dedicated Drizzle read
  repository.
- **Seed reality:** `composition/seed.ts` already inserts `students`,
  `enrollments` (studentId↔courseId), and progress. But domain rows carry a
  **random `externalId` and no better-auth account** — better-auth is the source
  of truth and normally mirrors domain rows *from* a real signup via hooks. So
  no seeded student (or their seeded enrollments) is loginable today.

## Naming

Route prefix and SDK tag: **`Learn`** (`/api/learn/*` → `Learn.listCourses()`,
`Learn.getCourse()`, `Learn.listModules()`). Chosen over `me` because these serve
content consumption, not identity/account management, and won't collide with a
future account surface. URLs are **course-shaped** (resource-per-entity), mirroring
the back-office `Courses` API; not a `/content/:id?type=` polymorphic endpoint.

---

## Part 1 — `Learn` read API (backend)

An entitlement-scoped read surface: authenticated by the student session, scoped
by the student's active enrollments, never by org membership.

### 1.1 `api-contract`

New `packages/api-contract/src/learn.ts` schemas. Reuse the existing `Course` and
`Module` shapes so the Plate blob wire shape is identical to admin's (activities
keep `{ id, moduleId, seq, settings, assetIds }` with `settings` opaque):

- `LearnCoursesResponse` — array (or page) of the flat `Course` shape.
- `LearnCourse` — the flat `Course` shape (reuse `Course`).
- `LearnModules` — the module→activity tree (reuse `Module[]`).
- `LearnCourseIdParam` — `{ courseId }`.

### 1.2 `reporting/learn/`

New read layer composing `entitlements` (the student's active enrollments) +
`content` (courses/modules/activities). Given a `studentId`:

- List the student's **active** enrollments; enrollment rows carry
  `orgId`/`courseId`/`status`, which drives the org-scoped joins.
- Keep only **`published`** courses.
- Expose module→activity trees with **`published`** activities only, each
  activity carrying `settings.content` + `assetIds`.

Files: `reporting/learn/{service.ts,model.ts,types.ts,index.ts,service.test.ts}`
following the reporting-service contract. Backed by a dedicated read repo
`adapters/db/repositories/learn.ts` (joins `enrollments` → `courses` → `modules`
→ `activities`, filtered by `studentId`, `status='active'`, `courses.status=
'published'`, and the activity published flag). Wire into `composition/container.ts`
as `reporting.learn = new LearnReportServiceImpl(new DrizzleLearnRepository(db))`.

### 1.3 Student scope resolver

New `resolveStudentScope(container, req)` in `packages/server/src/http/`
(sibling of `scope.ts`):

- Requires `req.authUser` (set by `requireSession`); does **not** require
  `req.orgId`.
- Resolves `authUser.id` → `identity.getStudentByExternalId(...)` → `studentId`.
- Throws a typed error (e.g. `NotAStudentError`) → `403` if no domain student.

### 1.4 Routes

New `packages/server/src/http/routes/learn.ts`, registered inside the **existing
session-guarded plugin** in `http/routes.ts` (students need a session; they use
`resolveStudentScope`, not `resolveScope`):

| Method / path | Handler behavior |
|---|---|
| `GET /api/learn/courses` | `resolveStudentScope` → `reporting.learn.listCourses(studentId)` → enrolled published courses |
| `GET /api/learn/courses/:courseId` | enrolled published course; `403`/`404` if not enrolled |
| `GET /api/learn/courses/:courseId/modules` | module→activity tree (published activities) for an enrolled course |

Each route keeps `preHandler: app.requireSession` as belt-and-suspenders (matches
existing convention). Schemas attached via the Zod type provider with
`tags: ["Learn"]`.

### 1.5 SDK

`pnpm gen:sdk` (DB must be up) regenerates `packages/sdk/openapi.json` +
`src/generated`, producing a `Learn` resource class. Commit both.

---

## Part 2 — Student auth (`apps/student`)

The app has no auth today. Mirror admin's cross-origin shared-cookie model,
trimmed of org/role:

- `lib/auth/client.ts` — better-auth client (mirror `apps/admin/src/lib/auth/client.ts`).
- `lib/auth/server-session.ts` — read the raw `Cookie:` header via `next/headers`,
  forward it verbatim to `${API_URL}/api/auth/get-session`, resolve the user.
  Wrapped in `React.cache`. No org/role resolution — a valid session that maps to
  a `Student` is sufficient. Exposes `getServerSession()` and a `requireAuth()`
  gate that redirects to the login page when unauthenticated.
- A **login page** (`app/login/page.tsx`) using the better-auth client
  (email/password, matching admin's login mechanism).

---

## Part 3 — Student app reads + rendering

### 3.1 API plumbing (`apps/student/src/lib/api/`)

Mirror admin:

- `server-call.ts` — `API_URL`, one-time `ensureConfigured()` (`configureSdk({
  baseUrl })`), and per-call `authHeaders()` forwarding the request cookie
  (never `client.setConfig` with request state).
- `server.ts` — `learnApi.listCourses()`, `learnApi.getCourse(courseId)`,
  `learnApi.listModules(courseId)` via `Learn.*`, each `unwrap`ping the result.
- `types.ts` — re-export SDK types (`Course`, `Module`, `Activity`) plus
  `ActivitySettings` / `ActivityContent` (identical to admin's `lib/api/types.ts`).

### 3.2 RSC reads replace mock imports

- `app/page.tsx` — RSC: `requireAuth()`, `learnApi.listCourses()`, adapt to the
  view model (§3.4), pass to the client `Dashboard` as props.
- `app/courses/[courseId]/page.tsx` — RSC: `requireAuth()`,
  `learnApi.getCourse(courseId)` + `learnApi.listModules(courseId)`, adapt, pass
  to the client player.
- Delete `lib/mock-data.ts`. `lib/store.tsx`'s `initialCompletion` seed becomes
  an empty `{}` (progress starts fresh; see §3.5).

### 3.3 Content rendering = `Renderer` only

- `components/player/content/content-area.tsx` becomes a single render of
  `<Renderer config={content.config} />`, guarded by `type`/`version` against the
  editor `meta` (mirror admin's preview page): "No content yet" when
  `settings.content == null`; a "saved in another format" notice on mismatch;
  otherwise the `Renderer`.
- The student app imports the Renderer via its own `editor.config.tsx`
  (mirror admin) → `@headless-lms/content-plate`.
- **Delete** `content/{video,audio,quiz,pdf,download,overview,text}.tsx`.
- **Remove** media-timer, quiz, and pdf state/handlers from
  `components/player/course-player.tsx`. Delete `components/player/expired-gate.tsx`
  (no enrollment expiry in the `Learn` surface — it returns only active-entitlement
  published courses).

### 3.4 Adapter (`lib/adapt.ts`)

Map backend → the view model the existing presentational components already
expect (`lib/types.ts`), so the UI shell is preserved:

| View-model field | Source |
|---|---|
| `Course.id/title/description/category` | backend `Course` |
| `Course.tone` | derived deterministically from `course.id` (flat `Course` has no tone) |
| `Course.instructor`, `Course.thumbnail` | **dropped** — not in backend; instructor line removed from UI, cover uses the gradient |
| `Module.order` | backend `module.seq` |
| `Lesson` (from `Activity`) `id` | `activity.id` |
| `Lesson.title` | `settings.title` (fallback "Untitled activity") |
| `Lesson.order` | `activity.seq` |
| `Lesson.content` | `settings.content` (`ActivityContent`) — consumed by the Renderer |
| `Lesson.type`, `Lesson.durationSeconds` | **dropped** — single content type, no duration UI |
| activity inclusion | filter to `published` activities with content present |

`lib/types.ts` is trimmed to what remains (drop `LessonType`, `LessonContent`
media/quiz/pdf fields, `Enrollment` expiry, etc.). `lib/progress.ts` math operates
on the adapted view model unchanged (flatten activities as "lessons").

### 3.5 Progress (local-only)

Keep `store.tsx` completion state and the derived progress UI (header %, sidebar
counts, sequential locking, auto-advance, mark-complete + toast), keyed by real
course/activity ids. No backend persistence — completion starts empty and resets
on reload. The dashboard greeting name comes from the session user; the "this
month" hours stat (backed by nothing real) is dropped.

---

## Part 4 — Styling + seed/login

### 4.1 Styling

For the Renderer to render correctly in `apps/student`:

- Add `@headless-lms/content-plate` (and `@headless-lms/editor-contract`,
  `@headless-lms/sdk`) to `apps/student/package.json` and to `transpilePackages`
  in `next.config.ts`.
- Add `@source "../../../../plugins/content-plate/src";` to
  `apps/student/src/app/globals.css` so the package's Tailwind utilities generate.
- Add the shadcn/plate semantic tokens the Renderer references that the student
  token set lacks (audit against `plugins/content-plate/src` + admin's
  `globals.css`): at minimum `--muted-foreground`, `--ring`, `--border`,
  `--background`, `--ring-offset-background`. Map them onto the student ramp.

### 4.2 Seed / dev login (net-new)

Seeded students are not loginable (see Constraints). Add a **deterministic,
loginable student** for dev:

- A better-auth user + credential account (email/password) whose id matches a
  domain `Student.externalId`.
- That student holds **active enrollments in published courses that have Plate
  content**, so the dashboard renders non-empty.

The exact mechanism (extend `composition/seed.ts` to write better-auth
`user`/`account` rows for one student, vs. a separate auth seed) is settled in the
implementation plan. Verify whether any better-auth account seeding exists for
staff first and follow that pattern if so.

---

## Data flow (end to end)

```
student login (better-auth, apps/student)
  → session cookie (shared-cookie, cross-origin)
apps/student RSC (page.tsx)
  → learnApi.listCourses()  [forwards cookie]
API GET /api/learn/courses
  → requireSession → resolveStudentScope → studentId
  → reporting.learn.listCourses(studentId)
     → entitlements (active enrollments for studentId)
     → content (published courses)
  → LearnCoursesResponse
apps/student adapt → Dashboard (client) renders course cards

open course → courses/[courseId]/page.tsx RSC
  → learnApi.getCourse + learnApi.listModules  [forwards cookie]
  → adapt → CoursePlayer (client)
     → ContentArea → <Renderer config={activity.settings.content.config} />
```

## Testing

- `reporting/learn/service.test.ts` — enrollment scoping: a student sees only
  their active-enrollment published courses; drafts and unpublished activities are
  excluded; non-enrolled course → not returned / 404.
- Route-level: `403` for a session that resolves to no student; `404`/`403` for a
  course the student isn't enrolled in.
- Existing back-office `courses.ts` routes and their tests remain unchanged.
- `pnpm lint` (import-boundary rules) after the backend layering changes;
  `pnpm typecheck`; `pnpm gen:sdk` diff committed.
- Manual: log in as the seeded student in `apps/student`, confirm the dashboard
  lists enrolled published courses and the player renders Plate content via the
  Renderer.

## Sequencing

Four subsystems with a dependency chain (3 needs 1 + 2). Build order:

1. **Backend `Learn` API** — contract, `reporting/learn`, read repo, scope
   resolver, routes, container wiring, tests, `gen:sdk`.
2. **Seed/dev login** — loginable student + enrollments in published courses.
3. **Student auth** — better-auth client, server-session, login page.
4. **Student reads + rendering** — API plumbing, RSC reads, adapter, Renderer
   wiring, component deletions, styling.

## Open items to settle in the implementation plan

- Exact better-auth account seeding mechanism for the dev student (§4.2), after
  confirming whether staff logins are seeded at all.
- Whether `GET /api/learn/courses` returns a bare array or a paged envelope
  (match whichever the dashboard needs; back-office `listCourses` is paged).
- The precise set of missing shadcn/plate tokens (§4.1), from an audit of
  `plugins/content-plate/src` against `apps/student` globals.
