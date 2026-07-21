# Design: Org-scoped students

Date: 2026-07-21
Branch: `feat--swappable-content`

## Goal

Make `students` a per-org tenant entity (like every other org-scoped table) so the student portal is org-scoped and customizable per org. Reverses the current "students are global" model.

## Decisions (locked)

- A student belongs to **exactly one org**. Same email in two orgs = two independent student rows (two separate "worlds"). Rare, allowed.
- **Login is one global better-auth account** (students authenticate against the same better-auth as staff). The **portal entry point supplies the org**; `(external_id, portalOrgId)` resolves the right student row.
- Portal org = `student.org_id` → per-org branding/customization.
- **No incremental migration** — regenerate the baseline schema and re-seed the dev DB (pre-production).

## Schema

`adapters/db/schema/identity.ts` — `students` becomes org-scoped, mirroring the composite-key tenant shape:

```ts
export const students = pgTable(
  "students",
  {
    orgId: text("org_id").notNull().references(() => organizations.id),
    id: text("id").notNull().$defaultFn(() => genId("student")),
    externalId: text("external_id").notNull(), // better-auth user id (global login)
    email: text("email").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    emailUq: unique().on(t.orgId, t.email),          // unique per org, not global
    externalUq: unique().on(t.orgId, t.externalId),  // one login → one row per org
  }),
);
```

Note: `identity.ts` currently doesn't import `organizations`/`primaryKey`/`unique` — add them (org-scoped tables live under the same `organizations` FK).

`adapters/db/schema/entitlements.ts` — the `enrollments.student_id` single-column FK (`references(() => students.id)`) breaks (composite PK). Replace with a composite FK:

```ts
studentFk: foreignKey({
  columns: [t.orgId, t.studentId],
  foreignColumns: [students.orgId, students.id],
}),
```

Types (`@headless-lms/types` `identity.ts`) — add `readonly orgId: string` to `Student`.

## Identity

`core/identity/ports.ts` + `service.ts` + `adapters/db/repositories/identity.ts`:

- `getStudentByExternalId(externalId)` → `getStudentByExternalId(orgId, externalId)`; likewise `findStudentByExternalId(orgId, externalId)`. The repo query filters on both `org_id` and `external_id`.
- `registerStudent` input carries `orgId` (creation is org-scoped).

## Portal org resolution

The student app resolves the org from its request host and forwards it to the API:

- `apps/student` — a helper resolves `orgId`/slug from the host (subdomain `acme.portal…`) or path, with a **dev fallback** to a configured `PORTAL_ORG_SLUG` env (dev has one org). It forwards the org via a request header (e.g. `x-portal-org: <slug>`) on every Learn call, alongside the session cookie.
- API — a small resolver maps the org slug → `organizations.id`.

## Scope resolver

`http/student-scope.ts` — `resolveStudentScope(container, req)` now reads **both** the session user and the portal org header:

```ts
// authUser (from requireSession) + portal org (header) → the org's student row
const orgId = await resolvePortalOrg(container, req);          // slug → org id, 400/404 if unknown
const student = await container.identity.getStudentByExternalId(orgId, req.authUser.id);
if (!student) throw new NotAStudentError();                    // → 403
return { studentId: student.id, orgId };
```

`resolveStudentScope` returns `{ studentId, orgId }` (was `{ studentId }`). Update `student-scope.test.ts`.

## Learn API

`reporting/learn` is scoped by `(studentId, orgId)`:

- `LearnReportService` / `LearnEnrollmentReader` methods take `orgId` alongside `studentId`.
- `adapters/db/repositories/learn.ts` — add `eq(enrollments.orgId, orgId)` to the base filters (no cross-org).
- `content.get(orgId, courseId)` / `listForCourse(orgId, courseId)` already take `orgId` — pass the scope's org.
- Route handlers pass `scope.orgId` through.

`reporting/students` repo joins (`eq(students.id, enrollments.studentId)`) become composite: `and(eq(students.orgId, enrollments.orgId), eq(students.id, enrollments.studentId))`.

## Portal customization (baseline)

Expose the resolved org's display identity so the portal can theme against it:

- `GET /api/learn/org` → `{ id, name, slug }` for the portal's org (scoped by the same resolver). The student app reads it for the header brand/name (replaces the hardcoded "Atelier"/"A").
- Full theming (colors/logo per org) is a later layer hung off this; the baseline just resolves and surfaces the org.

## Creation flow (baseline)

Students are created **by an org**, with `org_id` known at creation:

- Dev: `seed-dev-student.ts` sets `orgId` on the student (and its enrollment already carries it). The random seed's students already loop inside an org — set their `orgId`.
- A real invite/enroll UI is a later vertical; the baseline just makes the org-scoped model work end-to-end with seeded data. (Today students are created only by the seed — auth signup makes a staff user, never a student.)

## Baseline regen

- Update schema files → `pnpm db:generate` to regenerate the baseline (drop/recreate the dev DB, not an ALTER migration) → `pnpm db:migrate` → `pnpm --filter @headless-lms/api seed` + `seed:dev`.
- Regenerate the SDK if any Learn contract shape changes (the `/api/learn/org` addition).

## Docs

Update `AGENTS.md` multi-tenancy note: students are **org-scoped** `(org_id, id)`, unique per `(org_id, email)`; the org↔student link is the student's `org_id`, resolved at the portal boundary from the login + portal org.

## Testing

- `identity` service test: `getStudentByExternalId(orgId, externalId)` returns only the matching org's student; same external_id in two orgs resolves independently.
- `student-scope` test: resolves `{ studentId, orgId }` from user + portal org; unknown org → error; no student for org → 403.
- `reporting/learn` test: scoping by `(studentId, orgId)`; a student's course in another org is not returned.
- Manual: portal resolves the dev org, dashboard + player render its courses, brand shows the org name.
