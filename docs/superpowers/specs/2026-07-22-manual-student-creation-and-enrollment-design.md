# Manual student creation, course access & user invites from the admin UI

Admins can create a student by hand (name + email, optional invite email), land on
the new student's profile, and grant them access to courses with an expiry — all
against the real backend. The student portal is **invite-only**: account creation
there requires a valid single-use invitation, managed by the `better-invite`
better-auth plugin; accepting an invitation links the new auth account to the
exact student row it was minted for.

Invites cover **all user populations**:
- **Students** — better-invite: gates portal account creation, links the student row.
- **Staff** — the existing better-auth org-plugin invitation (already mirrored to
  the domain and listed in the team table), completed end-to-end: the invitation
  email actually sends, and the admin app gets an accept page. Membership grant
  stays standard better-auth. Admin-app signup remains open by design (sign up →
  create your org → owner), so staff need no signup gate.

## 1. API contract (`packages/api-contract/src/students.ts`)

```ts
export const CreateStudent = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.email(),
  /** Create + send a portal invitation on creation. */
  sendInvite: z.boolean(),
});
```

- `POST /api/students` — session-guarded, `tags: ["Students"]`, `operationId: createStudent`.
  - `201` → `Student` (the existing reporting shape, fetched after insert).
  - `409` → `ErrorBody` when the org already has a student with that email.
- `POST /api/students/:id/invite` — session-guarded, `operationId: resendStudentInvite`,
  `204`; only valid while the student is unlinked (`external_id` NULL), else `409`.
- Regenerate the SDK (`pnpm gen:sdk`); `openapi.json` + `src/generated/` diffs committed.

## 2. Core (`core/identity`)

New inbound use cases on `IdentityService`:

```ts
createStudent(input: CreateStudentInput): Promise<Student>;
// CreateStudentInput = { orgId, email, firstName, lastName, sendInvite }

sendStudentInvite(orgId: string, studentId: string): Promise<void>;   // resend
linkStudentByInvite(inviteId: string, externalId: string): Promise<void>;
```

`createStudent`:
1. `repo.findStudentByEmail(orgId, email)` — exists → `ConflictError`
   (new error class in `core/shared/errors.ts` if not present; HTTP error handler
   maps it to 409).
2. Insert the student with `external_id = NULL` — the honest "no auth account
   yet" state. Migration: `students.external_id` drops NOT NULL (the
   `(org_id, external_id)` unique constraint permits multiple NULLs; lookups by
   `external_id` never match NULL rows, so login and session org-stamping are
   unaffected).
3. If `sendInvite`: create the invitation through a new outbound port and store
   its id on the row (`students.invite_id`, nullable text — added in the same
   migration):

```ts
// core/identity/ports.ts — implemented by the auth adapter over better-invite.
export interface StudentInviter {
  createInvite(input: { email: string; name: string }): Promise<{ inviteId: string }>;
  cancelInvite(inviteId: string): Promise<void>;
}
```

`sendStudentInvite` (resend): student must exist and be unlinked; cancels the
previous invitation if one is recorded, creates a fresh one, stores the new id.

`linkStudentByInvite`: `repo.linkStudentByInviteId(inviteId, externalId)` — the
row whose `invite_id` matches gets `external_id = externalId`. Token → exact row;
no email matching.

Repository additions (`IdentityRepository` + `DrizzleIdentityRepository`):
`findStudentByEmail(orgId, email)`, `insertStudent` accepting NULL `externalId`,
`setInviteId(orgId, studentId, inviteId)`, `linkStudentByInviteId(inviteId, externalId)`.

Type additions in `@headless-lms/types` (`identity.ts`): `CreateStudentInput`;
the `Student` entity's `externalId` widens to `string | null`. Re-exported from
the context's `types.ts` — never re-declared.

## 3. Auth adapter (`adapters/auth`) — better-invite integration

Register the `invite` plugin in `createAuth`:

- `sendUserInvitation` → sends through the existing `EmailSender` port
  (`opts.email`), linking to `<studentPortalUrl>/welcome?token={token}`
  (`defaultCustomInviteUrl`).
- `invitationTokenExpiresIn`: 7 days.
- Private, email-bound invitations, single-use (`defaultMaxUses: 1`).
- `inviteHooks.afterAcceptInvite` → `opts.identity.linkStudentByInvite(invitation.id, invitedUser.id)`.
  This fires after the plugin's own after-hook consumes the cookie-carried token on
  `/sign-up/email`, `/sign-in/*`, or `/callback/:id` — so linking works for
  password today and social providers whenever they're configured, no flow change.
- The plugin's role-upgrade feature is unused: invitations carry a nominal role
  and never write to staff/member state.

**Invite-only enforcement** (the plugin consumes invites but does not require
them): a `hooks.before` on `/sign-up/email` scoped by request `Origin` — signups
originating from the student portal (`studentPortalUrl`) are rejected unless a
valid, unexpired invitation token (the plugin's signed cookie / request token)
matches the signup email. Signups from other trusted origins (the admin app's
open sign-up → create-org funnel, and invited staff creating their account
before accepting) pass through untouched.

The plugin's schema additions (invite tables) are generated into
`adapters/auth/schema.ts` alongside the existing better-auth tables.

`opts.identity` widens to include `linkStudentByInvite`; the container passes the
`StudentInviter` implementation (auth adapter) into the identity service.

### Staff invitations (org plugin) — completed

- `sendInvitationEmail` configured on the organization plugin: sends through the
  same `EmailSender` port, linking to `<adminAppUrl>/accept-invitation/<id>`.
  `adminAppUrl` joins `studentPortalUrl` in `Config`.
- Admin app gains `/accept-invitation/[id]`: unauthenticated users log in or sign
  up first (open admin signup), then the page calls the better-auth client's
  `organization.acceptInvitation` and lands on the dashboard. Invalid/expired →
  clear error state. The existing `afterAcceptInvitation` hook already mirrors
  acceptance into the domain; the team table already lists pending invitations.
- No new invite machinery for staff — the org-plugin invitation is the token.

## 4. Config

`Config` (`app/container.ts`) gains `studentPortalUrl: string` (e.g.
`http://localhost:8002` in dev) and `adminAppUrl: string` (e.g.
`http://localhost:8001`), threaded from `apps/api` env — invite link targets and
the origin scope for signup enforcement.

## 5. HTTP routes (`http/routes/students.ts`)

`POST /api/students`:

```ts
handler: async (req, reply) => {
  const scope = await resolveScope(container, req);
  const created = await container.identity.createStudent({ orgId: scope.orgId, ...req.body });
  const student = await container.reporting.students.get(scope.orgId, created.id);
  return reply.code(201).send(student);
};
```

`POST /api/students/:id/invite` → `identity.sendStudentInvite(scope.orgId, id)` → 204.

`ConflictError` → 409 via the shared error handler (mapping added if only
`NotFoundError` is handled today).

## 6. Student portal (`apps/student`)

- **No open signup.** New `/welcome` page (sibling of `/login`, same visual
  shell), reached only from the invite email (`?token=…`). It uses the plugin's
  client (`inviteClient()` added to the better-auth client) to stage the token
  and read the invitation (invitee email, inviter/org context):
  - Invalid/expired/used token → clear error state with nothing actionable.
  - No account for the email → "create your account": email locked, password
    fields → `signUp.email` (passes the enforcement hook because the staged
    invite is valid). Social buttons appear per configured provider later —
    the plugin consumes the token on `/callback/:id` the same way.
  - Account already exists (same person invited by a second org) → sign-in form;
    the plugin's after-hook on `/sign-in/*` consumes the token and
    `afterAcceptInvite` links the second org's student row.
  - Either way the session lands org-stamped (existing `session.create.before`
    hook) and redirects into the portal.
- **Remove `/no-access`.** With invite-only accounts, "authenticated but no
  student" is a broken state, not a destination: the 401 handling in
  `lib/api/shared.ts` signs the session out and redirects to `/login` instead.
  The `no-access` page directory is deleted.

## 7. Admin UI (`apps/admin`)

**Add student** — students list page:
- "Add student" button (managers only, consistent with existing gating) opens a
  `FormSheet` (`students/_components/add-student-sheet.tsx`), same
  react-hook-form + zodResolver pattern as `GrantAccessSheet`:
  first name, last name, email, "Send invite email" checkbox (default on).
- Server action `createStudentAction` (`students/actions.ts`):
  `Students.createStudent` via the SDK, `revalidatePath("/students")`; the sheet
  navigates to `/students/<id>`.
- 409 surfaces as an inline error on the email field ("A student with this email
  already exists"); other failures as the standard error toast.

**Student profile**:
- **Grant access** button in the entitlements section header (managers only) —
  same name and form as the entitlements page's grant sheet: content select +
  expiry (never / date), the student fixed
  (`students/_components/grant-access-sheet.tsx`, submitting through the
  existing `grantEntitlementAction`, which additionally revalidates
  `/students/[studentId]`).
- Unlinked students (no portal account yet) show a pending indicator and a
  "Resend invite" action → `resendStudentInvite` via the SDK.

## 8. Testing

- `core/identity/service.test.ts`: creates with NULL external id; duplicate
  email → `ConflictError`; `sendInvite: true` calls the `StudentInviter` port and
  stores the invite id, `false` does neither; resend cancels the old invitation
  and stores the new id; `linkStudentByInvite` links exactly the matching row.
- Auth adapter: uninvited portal-origin `/sign-up/email` is rejected by the
  enforcement hook; admin-origin signup passes without an invite; a valid staged
  invitation passes and `afterAcceptInvite` links the student row; staff
  invitation creation triggers `sendInvitationEmail` through the email port.
- Route tests: 201 shape, 409 on duplicate, validation 400s, resend 204/409.
- Portal: `/welcome` states (valid / expired / account-exists) at the component
  level. Admin: `/accept-invitation/[id]` states (signed-out, valid, expired).
- `pnpm gen:sdk` run; regenerated SDK committed. Drizzle migration
  (`external_id` nullable + `invite_id`) and better-invite schema committed.
