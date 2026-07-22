# Manual student creation & course enrollment from the admin UI

Admins can create a student by hand (name + email, optional invite email), land on
the new student's profile, and enroll them into courses with an expiry — all against
the real backend. Invited students create their portal account through the standard
better-auth signup (password, or any social provider the installation configures);
the pending student row is linked to the auth account by email match at account
creation.

## 1. API contract (`packages/api-contract/src/students.ts`)

```ts
export const CreateStudent = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.email(),
  /** Send the portal-signup invite email on creation. */
  sendInvite: z.boolean(),
});
```

- `POST /api/students` — session-guarded, `tags: ["Students"]`, `operationId: createStudent`.
  - `201` → `Student` (the existing reporting shape, fetched after insert).
  - `409` → `ErrorBody` when the org already has a student with that email.
- Regenerate the SDK (`pnpm gen:sdk`) → `Students.createStudent`. `openapi.json` and
  `src/generated/` diffs are committed.

## 2. Core (`core/identity`)

New inbound use cases on `IdentityService`:

```ts
createStudent(input: CreateStudentInput): Promise<Student>;
// CreateStudentInput = { orgId, email, firstName, lastName, sendInvite }

linkPendingStudentByEmail(email: string, externalId: string): Promise<void>;
```

`createStudent`:
1. `repo.findStudentByEmail(orgId, email)` — exists → throw `ConflictError`
   (new error class in `core/shared/errors.ts` if not present, mapped to 409 by the
   HTTP error handler).
2. Insert the student with a **pending placeholder** `external_id`:
   `pending_<studentId>` (the row's own generated id — satisfies NOT NULL and the
   per-org unique constraint; no migration).
3. If `sendInvite`: send the invite through the existing `EmailSender` port
   (`core/shared/ports`) — subject/text linking to
   `<studentPortalUrl>/signup?email=<email>`.

`linkPendingStudentByEmail`:
- `repo.linkPendingStudentsByEmail(email, externalId)` — one UPDATE: every student
  row with this email whose `external_id` starts with `pending_` gets
  `external_id = externalId`. Cross-org by design: one global login, one row per org.

Repository additions (`IdentityRepository` + `DrizzleIdentityRepository`):
`findStudentByEmail(orgId, email)`, `insertStudent` reused with explicit
`externalId`, `linkPendingStudentsByEmail(email, externalId)`.

Type additions in `@headless-lms/types` (`identity.ts`): `CreateStudentInput`.
Re-exported from the context's `types.ts` — never re-declared.

Pending rows are invisible to login until linked: `getStudentByExternalId` /
`studentOrgExternalId` look up by `external_id`, and no session ever carries a
`pending_*` id.

## 3. Auth adapter hook (`adapters/auth/index.ts`)

`databaseHooks.user.create.after` (already registers the staff `User` mirror) gains
one call:

```ts
await opts.identity.linkPendingStudentByEmail(user.email, user.id);
```

Runs for every auth-account creation regardless of method (password signup, social,
magic link) — that is what makes the invite flow method-agnostic. Account creation
precedes session creation in better-auth, so the existing
`session.create.before` org-stamping hook finds the freshly linked row on the very
first login.

The `IdentityService` slice passed to `createAuth` (`opts.identity`) widens to
include `linkPendingStudentByEmail`.

## 4. Config

`Config` (`app/container.ts`) gains `studentPortalUrl: string` (e.g.
`http://localhost:8002` in dev), threaded from `apps/api` env → used only to build
invite links. The identity service receives `EmailSender` + `studentPortalUrl` via
the container.

## 5. HTTP route (`http/routes/students.ts`)

`POST /api/students` alongside the existing reads:

```ts
handler: async (req, reply) => {
  const scope = await resolveScope(container, req);
  const created = await container.identity.createStudent({ orgId: scope.orgId, ...req.body });
  const student = await container.reporting.students.get(scope.orgId, created.id);
  return reply.code(201).send(student);
};
```

`ConflictError` → 409 via the shared error handler (add the mapping if only
`NotFoundError` is handled today).

## 6. Student portal signup (`apps/student`)

- New `/signup` page, sibling of `/login`, same visual shell. Fields: name,
  email (pre-filled and read-only when `?email=` is present), password —
  `signUp.email` from the better-auth client. Social buttons render per provider
  the portal configures (none today; adding `socialProviders.google` to the auth
  adapter config + a button is config-plus-markup, no flow change).
- After signup the account is auto-signed-in; the email-match hook has already
  linked the student row, so the session lands org-stamped and the portal loads
  normally. A signup email with no pending student resolves to no student → the
  existing `/no-access` handling.
- `/login` links to `/signup` and vice versa.

## 7. Admin UI (`apps/admin`)

**Add student** — students list page:
- "Add student" button (managers only, consistent with existing gating) opens a
  `FormSheet` (`students/_components/add-student-sheet.tsx`), same
  react-hook-form + zodResolver pattern as `GrantAccessSheet`:
  first name, last name, email, "Send invite email" checkbox (default on).
- Server action `createStudentAction` (`students/actions.ts`):
  `Students.createStudent` via the SDK, `revalidatePath("/students")`, return the
  created student; the sheet navigates to `/students/<id>`.
- 409 surfaces as an inline error on the email field ("A student with this email
  already exists"); other failures as the standard error toast.

**Enroll from the profile** — student detail page:
- "Enroll in course" button in the Entitlements section header (managers only)
  opens `students/_components/enroll-course-sheet.tsx`: course select + expiry
  (never / date), the student fixed — the `GrantAccessSheet` form minus the student
  picker, submitting through the existing `grantEntitlementAction`.
- The detail page's Server Component fetches the course options (same lite shape
  the entitlements page already passes to `GrantAccessSheet`).
- `grantEntitlementAction` additionally revalidates `/students/[studentId]` so the
  new entitlement appears immediately.

## 8. Testing

- `core/identity/service.test.ts`: creates with pending external id; duplicate
  email → `ConflictError`; `sendInvite: true` sends exactly one email containing
  the signup link, `false` sends none; `linkPendingStudentByEmail` links all
  matching pending rows and never touches linked rows.
- Route tests (`http/`): 201 shape, 409 on duplicate, validation 400s
  (bad email, missing fields).
- Auth hook: user-create hook links a pending student (extend the existing auth
  adapter/integration test pattern).
- `pnpm gen:sdk` run; regenerated SDK committed.
