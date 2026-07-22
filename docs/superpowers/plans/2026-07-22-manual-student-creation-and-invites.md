# Manual Student Creation, Course Access & Unified Invites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins create students by hand and grant them course access with expiry; every user population (students + staff) is invited through one better-invite-based flow; the student portal becomes invite-only.

**Architecture:** Hexagonal monorepo (`packages/server` core/adapters/http, `apps/admin` + `apps/student` Next.js, schema-first API via `packages/api-contract` → generated `packages/sdk`). The `better-invite` better-auth plugin owns invitation records/tokens/cookies; our hooks capture invite ids into the domain (student row link / org invitation mirror) and branch acceptance (link student vs `addMember`). Manual students are inserted with `external_id = NULL` until an invitation is accepted.

**Tech Stack:** Node 22 ESM, strict TS, Fastify 5 + fastify-type-provider-zod, zod 4, better-auth (+ better-invite), Drizzle/Postgres, Next.js App Router, react-hook-form + zodResolver, vitest.

**Spec:** `docs/superpowers/specs/2026-07-22-manual-student-creation-and-enrollment-design.md`

## Global Constraints

- Never add AI-attribution trailers to commits (repo rule; overrides defaults).
- `core/` may not import adapters/http/frameworks; contexts import each other only via `index.ts` (`pnpm lint` enforces).
- Domain entities/DTOs are declared in `@headless-lms/types` and re-exported by the context — never re-declared.
- `openapi.json` and `packages/sdk/src/generated/` are committed; regenerate with `pnpm gen:sdk` whenever contract/routes change (needs the DB up: `pnpm dev` infra or docker compose).
- Invitation expiry: 7 days (`invitationTokenExpiresIn: 60 * 60 * 24 * 7`). Single-use private invitations.
- Role strings: `student` for students; staff roles are the contract enum `owner | admin | instructor` (`packages/api-contract/src/members.ts`) — no collision.
- Invite link targets: `role student → ${studentPortalUrl}/welcome?token={token}&email={email}`, staff → `${adminAppUrl}/invite?token={token}&email={email}`.
- Commands run from the repo root. Server-only test run: `pnpm --filter @headless-lms/server exec vitest run <path>`.

### Deviations from the spec (agreed rationale, follow the plan)

- Invite creation is orchestrated in the **HTTP route / adapters**, not inside `IdentityService.createStudent`: better-invite's `/invite/create` needs the admin's session headers, which don't belong in a core port. Core keeps pure domain methods (`createStudent`, `recordStudentInvite`, `linkStudentByInvite`); the `StudentInviter` port from the spec is not needed.
- The spec's `linkStudentByInviteId` gains an email fallback (`invite_id = ? OR email = ?`, both guarded by `external_id IS NULL`) so resent/old-but-unexpired tokens and multi-org invites still link.
- Staff invitation **cancel** (remove pending member from the team table) flips the domain mirror to `canceled`; the accept hook refuses non-`pending` mirrors. Reason: better-invite only lets the original creator cancel a token, which would break "any admin can cancel".

---

### Task 1: `ConflictError` + HTTP 409 mapping

**Files:**
- Modify: `packages/server/src/core/shared/errors.ts`
- Modify: `packages/server/src/http/plugins/error-handler.ts`
- Test: `packages/server/src/http/plugins/error-handler.test.ts`

**Interfaces:**
- Produces: `class ConflictError extends Error { constructor(message: string) }` exported from `core/shared/errors.ts`; the central handler maps it to `409 { error: "conflict", message }`.

- [ ] **Step 1: Write the failing test**

Open `packages/server/src/http/plugins/error-handler.test.ts`, mirror the existing `NotFoundError` test (it registers a throwing route on a bare Fastify app). Add:

```ts
import { ConflictError } from '../../core/shared/errors.js';

it('maps ConflictError to 409 conflict', async () => {
  const app = fastify();
  registerErrorHandler(app);
  app.get('/boom', () => {
    throw new ConflictError('A student with this email already exists');
  });
  const res = await app.inject({ method: 'GET', url: '/boom' });
  expect(res.statusCode).toBe(409);
  expect(JSON.parse(res.body)).toEqual({
    error: 'conflict',
    message: 'A student with this email already exists',
  });
  await app.close();
});
```

(Match the file's actual setup helpers — if it builds the app once at top, follow that shape instead.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @headless-lms/server exec vitest run src/http/plugins/error-handler.test.ts`
Expected: FAIL — `ConflictError` has no export.

- [ ] **Step 3: Implement**

`packages/server/src/core/shared/errors.ts` — append:

```ts
/** A command conflicts with existing state (duplicate email, already linked,
 *  …). The HTTP layer maps this to 409. */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}
```

`packages/server/src/http/plugins/error-handler.ts` — import `ConflictError` next to `NotFoundError` and add before the `OrganizationRuleError` branch:

```ts
if (error instanceof ConflictError) {
  return reply.status(409).send({ error: 'conflict', message: error.message });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @headless-lms/server exec vitest run src/http/plugins/error-handler.test.ts`
Expected: PASS (all tests in file).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/core/shared/errors.ts packages/server/src/http/plugins/error-handler.ts packages/server/src/http/plugins/error-handler.test.ts
git commit -m "feat(server): ConflictError with central 409 mapping"
```

---

### Task 2: Types + Drizzle schema + migration (nullable external_id, invite_id, better-invite tables)

**Files:**
- Modify: `packages/types/src/identity.ts`
- Modify: `packages/server/src/adapters/db/schema/identity.ts`
- Modify: `packages/server/src/adapters/auth/schema.ts`
- Modify: `packages/server/package.json` (add `better-invite` dependency)
- Create: generated migration under `packages/server/drizzle/` (via `pnpm db:generate`)

**Interfaces:**
- Produces (in `@headless-lms/types`):

```ts
export interface Student {
  readonly id: string;
  readonly orgId: string;
  /** better-auth user id once linked; NULL until an invitation is accepted. */
  readonly externalId: string | null;
  /** Latest pending better-invite invitation id; cleared on link. */
  readonly inviteId: string | null;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateStudentInput {
  orgId: string;
  email: string;
  firstName: string;
  lastName: string;
}
```

- Produces (Drizzle): `students.externalId` nullable, `students.inviteId` nullable; new auth tables `invite` + `inviteUse` exported from `adapters/auth/schema.ts`.

- [ ] **Step 1: Update `@headless-lms/types`**

In `packages/types/src/identity.ts`: change `Student.externalId` to `string | null`, add `inviteId: string | null` after it, and add `CreateStudentInput` (exact shapes above) after `RegisterStudentInput`. Leave `RegisterStudentInput` untouched.

- [ ] **Step 2: Update the students table**

`packages/server/src/adapters/db/schema/identity.ts` — in `students`, replace

```ts
externalId: text('external_id').notNull(),
```

with

```ts
// better-auth user id once the student has accepted an invitation; NULL for
// admin-created students who haven't created their account yet. Lookups by
// external_id never match NULL, so login/org-stamping ignore pending rows.
externalId: text('external_id'),
// Latest pending better-invite invitation id (set on create/resend, used by
// afterAcceptInvite to link the exact row; cleared on link).
inviteId: text('invite_id'),
```

Keep the `(org_id, external_id)` unique constraint — Postgres treats NULLs as distinct.

- [ ] **Step 3: Add better-invite dependency**

Run: `pnpm --filter @headless-lms/server add better-invite`
Then inspect the installed table contract:

Run: `grep -n "invite\|fields" node_modules/better-invite/dist/index.d.mts | head -40`
Expected: the plugin schema models `invite` and `inviteUse` with the fields below (token, expiresAt, maxUses, infinityMaxUses, createdByUserId, redirectToAfterUpgrade, shareInviterName, email, emails, role, newAccount, status / inviteId, usedAt, usedByUserId). If field names differ from the tables in Step 4, adjust Step 4 to match the installed version.

- [ ] **Step 4: Add the plugin's tables to the auth schema**

`packages/server/src/adapters/auth/schema.ts` — append (better-auth maps camelCase fields to these snake_case columns; `string[]` fields are stored as JSON text by the drizzle adapter when the column is plain text):

```ts
// --- better-invite plugin tables (all-population invitations) ---

export const invite = pgTable('invite', {
  id: text('id').primaryKey(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at'),
  expiresAt: timestamp('expires_at').notNull(),
  maxUses: integer('max_uses').notNull(),
  infinityMaxUses: boolean('infinity_max_uses')
    .$defaultFn(() => false)
    .notNull(),
  createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
  redirectToAfterUpgrade: text('redirect_to_after_upgrade'),
  shareInviterName: boolean('share_inviter_name').notNull(),
  email: text('email'),
  emails: text('emails'),
  role: text('role').notNull(),
  newAccount: boolean('new_account'),
  status: text('status').notNull(),
});

export const inviteUse = pgTable('invite_use', {
  id: text('id').primaryKey(),
  inviteId: text('invite_id')
    .notNull()
    .references(() => invite.id, { onDelete: 'set null' }),
  usedAt: timestamp('used_at').notNull(),
  usedByUserId: text('used_by_user_id').references(() => user.id, { onDelete: 'set null' }),
});
```

Add `integer` to the existing `drizzle-orm/pg-core` import. Confirm the auth schema file is included in `adapters/db/schema/index.ts`'s re-exports (the drizzle config source) — check with `grep -n "auth" packages/server/src/adapters/db/schema/index.ts`; if auth tables are re-exported there, nothing more; if not, follow however `organization`/`member` tables reach drizzle-kit today (they are in `adapters/auth/schema.ts` — verify `drizzle.config.ts`'s `schema` glob covers it: `grep -n schema packages/server/drizzle.config.ts`).

- [ ] **Step 5: Generate the migration**

Run: `pnpm db:generate`
Expected: a new SQL file under `packages/server/drizzle/` containing `ALTER TABLE "students" ALTER COLUMN "external_id" DROP NOT NULL;`, `ADD COLUMN "invite_id" text;`, and `CREATE TABLE "invite" … "invite_use" …`.

- [ ] **Step 6: Typecheck (types ripple)**

Run: `pnpm --filter @headless-lms/types build && pnpm --filter @headless-lms/server typecheck`
Expected: errors only where `externalId` is now nullable (`adapters/db/repositories/identity.ts` return types may still align since Drizzle infers nullable). Fix any strictness fallout in files this plan already touches later ONLY if the compiler forces it now (e.g. add `?? null`); otherwise leave for their tasks.

- [ ] **Step 7: Apply migration + run server tests**

Run: `pnpm db:migrate && pnpm --filter @headless-lms/server test`
Expected: migration applies; existing tests pass.

- [ ] **Step 8: Commit**

```bash
git add packages/types/src/identity.ts packages/server/src/adapters/db/schema/identity.ts packages/server/src/adapters/auth/schema.ts packages/server/package.json pnpm-lock.yaml packages/server/drizzle
git commit -m "feat(server): nullable student external_id + invite_id, better-invite tables"
```

---

### Task 3: Identity core — createStudent, recordStudentInvite, linkStudentByInvite

**Files:**
- Modify: `packages/server/src/core/identity/ports.ts`
- Modify: `packages/server/src/core/identity/service.ts`
- Modify: `packages/server/src/core/identity/types.ts`
- Modify: `packages/server/src/adapters/db/repositories/identity.ts`
- Test: `packages/server/src/core/identity/service.test.ts`

**Interfaces:**
- Consumes: `ConflictError` (Task 1), `CreateStudentInput`/`Student` (Task 2).
- Produces (on `IdentityService` + impl):

```ts
createStudent(input: CreateStudentInput): Promise<Student>;              // ConflictError on duplicate (org, email)
getStudentById(orgId: string, id: string): Promise<Student | null>;
recordStudentInvite(orgId: string, email: string, inviteId: string): Promise<void>;
linkStudentByInvite(inviteId: string, email: string, externalId: string): Promise<void>;
```

- Produces (on `IdentityRepository` + Drizzle impl):

```ts
findStudentByEmail(orgId: string, email: string): Promise<Student | null>;
findStudentById(orgId: string, id: string): Promise<Student | null>;
insertPendingStudent(input: CreateStudentInput): Promise<Student>;       // externalId NULL
setInviteIdByEmail(orgId: string, email: string, inviteId: string): Promise<void>;
linkPendingStudents(inviteId: string, email: string, externalId: string): Promise<number>; // rows updated
```

- [ ] **Step 1: Re-export the new DTO**

`packages/server/src/core/identity/types.ts` — add `CreateStudentInput` to the existing `export type { … } from '@headless-lms/types'` list.

- [ ] **Step 2: Write the failing tests**

Append to `packages/server/src/core/identity/service.test.ts` (follow the file's existing in-memory fake-repo pattern; extend the fake with the five new repo methods — `insertPendingStudent` stores `{ ...input, id: 'st_' + n, externalId: null, inviteId: null, createdAt/updatedAt: new Date() }`, `linkPendingStudents` updates rows `WHERE externalId === null && (inviteId === arg || email === arg)` and returns the count):

```ts
describe('createStudent', () => {
  it('inserts a pending student with NULL externalId', async () => {
    const student = await svc.createStudent({
      orgId: 'org1',
      email: 'jane@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
    });
    expect(student.externalId).toBeNull();
    expect(student.email).toBe('jane@example.com');
  });

  it('throws ConflictError when the org already has that email', async () => {
    await svc.createStudent({ orgId: 'org1', email: 'jane@example.com', firstName: 'Jane', lastName: 'Doe' });
    await expect(
      svc.createStudent({ orgId: 'org1', email: 'jane@example.com', firstName: 'J', lastName: 'D' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('allows the same email in a different org', async () => {
    await svc.createStudent({ orgId: 'org1', email: 'jane@example.com', firstName: 'Jane', lastName: 'Doe' });
    await expect(
      svc.createStudent({ orgId: 'org2', email: 'jane@example.com', firstName: 'Jane', lastName: 'Doe' }),
    ).resolves.toBeTruthy();
  });
});

describe('linkStudentByInvite', () => {
  it('links the row carrying the invite id', async () => {
    await svc.createStudent({ orgId: 'org1', email: 'jane@example.com', firstName: 'Jane', lastName: 'Doe' });
    await svc.recordStudentInvite('org1', 'jane@example.com', 'inv_1');
    await svc.linkStudentByInvite('inv_1', 'jane@example.com', 'usr_ext_9');
    const linked = await repo.findStudentByEmail('org1', 'jane@example.com');
    expect(linked?.externalId).toBe('usr_ext_9');
  });

  it('falls back to email match for pending rows (resent/old token, second org)', async () => {
    await svc.createStudent({ orgId: 'org2', email: 'jane@example.com', firstName: 'Jane', lastName: 'Doe' });
    // org2 row has a DIFFERENT invite id recorded
    await svc.recordStudentInvite('org2', 'jane@example.com', 'inv_other');
    await svc.linkStudentByInvite('inv_stale', 'jane@example.com', 'usr_ext_9');
    const linked = await repo.findStudentByEmail('org2', 'jane@example.com');
    expect(linked?.externalId).toBe('usr_ext_9');
  });

  it('never touches already-linked rows', async () => {
    const s = await svc.createStudent({ orgId: 'org1', email: 'a@example.com', firstName: 'A', lastName: 'B' });
    await svc.recordStudentInvite('org1', 'a@example.com', 'inv_a');
    await svc.linkStudentByInvite('inv_a', 'a@example.com', 'usr_1');
    await svc.linkStudentByInvite('inv_a', 'a@example.com', 'usr_2');
    const row = await repo.findStudentById('org1', s.id);
    expect(row?.externalId).toBe('usr_1');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @headless-lms/server exec vitest run src/core/identity/service.test.ts`
Expected: FAIL — methods missing.

- [ ] **Step 4: Implement ports + service**

`packages/server/src/core/identity/ports.ts` — import `CreateStudentInput` from `./types.js`; add the four service methods to `IdentityService` and the five repo methods to `IdentityRepository` (signatures from the Interfaces block above).

`packages/server/src/core/identity/service.ts`:

```ts
import { ConflictError } from '../shared/errors.js';
// … existing imports; add CreateStudentInput to the types import.

async createStudent(input: CreateStudentInput): Promise<Student> {
  const existing = await this.repo.findStudentByEmail(input.orgId, input.email);
  if (existing) {
    throw new ConflictError('A student with this email already exists');
  }
  const student = await this.repo.insertPendingStudent(input);
  this.logger.info('student created', { orgId: input.orgId, studentId: student.id });
  return student;
}

async getStudentById(orgId: string, id: string): Promise<Student | null> {
  return this.repo.findStudentById(orgId, id);
}

async recordStudentInvite(orgId: string, email: string, inviteId: string): Promise<void> {
  await this.repo.setInviteIdByEmail(orgId, email, inviteId);
  this.logger.info('student invite recorded', { orgId, inviteId });
}

async linkStudentByInvite(inviteId: string, email: string, externalId: string): Promise<void> {
  const linked = await this.repo.linkPendingStudents(inviteId, email, externalId);
  this.logger.info('student invite accepted', { inviteId, linked });
}
```

- [ ] **Step 5: Implement the Drizzle repository methods**

`packages/server/src/adapters/db/repositories/identity.ts` — add (import `isNull, or, sql` from `drizzle-orm`; import `CreateStudentInput`):

```ts
async findStudentByEmail(orgId: string, email: string): Promise<Student | null> {
  const [row] = await this.db
    .select()
    .from(students)
    .where(and(eq(students.orgId, orgId), eq(students.email, email)))
    .limit(1);
  return row ?? null;
}

async findStudentById(orgId: string, id: string): Promise<Student | null> {
  const [row] = await this.db
    .select()
    .from(students)
    .where(and(eq(students.orgId, orgId), eq(students.id, id)))
    .limit(1);
  return row ?? null;
}

async insertPendingStudent(input: CreateStudentInput): Promise<Student> {
  const [row] = await this.db
    .insert(students)
    .values({
      orgId: input.orgId,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
    })
    .returning();
  if (!row) {
    throw new Error('failed to insert student');
  }
  return row;
}

async setInviteIdByEmail(orgId: string, email: string, inviteId: string): Promise<void> {
  await this.db
    .update(students)
    .set({ inviteId })
    .where(and(eq(students.orgId, orgId), eq(students.email, email), isNull(students.externalId)));
}

// Link every still-pending row minted for this invite OR carrying the invited
// email (resent tokens, one login across orgs). Pending guard makes it idempotent.
async linkPendingStudents(inviteId: string, email: string, externalId: string): Promise<number> {
  const rows = await this.db
    .update(students)
    .set({ externalId, inviteId: null })
    .where(
      and(isNull(students.externalId), or(eq(students.inviteId, inviteId), eq(students.email, email))),
    )
    .returning({ id: students.id });
  return rows.length;
}
```

If `Student` (drizzle row) now type-errors against the domain `Student` because `inviteId` was added to the type: the schema column exists (Task 2), so `.returning()`/`select()` rows include it — no mapping needed.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @headless-lms/server exec vitest run src/core/identity/service.test.ts`
Expected: PASS.

- [ ] **Step 7: Lint + typecheck + commit**

```bash
pnpm --filter @headless-lms/server typecheck && pnpm lint
git add packages/server/src/core/identity packages/server/src/adapters/db/repositories/identity.ts
git commit -m "feat(identity): manual student creation and invite-based account linking"
```

---

### Task 4: Auth adapter — register better-invite (email, capture, accept branching) + config plumbing

**Files:**
- Create: `packages/server/src/adapters/auth/invites.ts`
- Test: `packages/server/src/adapters/auth/invites.test.ts`
- Modify: `packages/server/src/adapters/auth/index.ts`
- Modify: `packages/server/src/app/container.ts` (Config + createAuth opts)
- Modify: `apps/api/src/config.ts`

**Interfaces:**
- Consumes: `identity.recordStudentInvite/linkStudentByInvite` (Task 3), `organizations.getByExternalId/recordInvitation/acceptInvitation/getMembershipByUser`, `EmailSender` port.
- Produces:
  - `Config` gains `studentPortalUrl: string; adminAppUrl: string`.
  - `createAuth` opts gain the same two fields.
  - `adapters/auth/invites.ts` exports:

```ts
export const STUDENT_ROLE = 'student';
export function inviteLinkFor(role: string, token: string, email: string, urls: { studentPortalUrl: string; adminAppUrl: string }): string;
export interface InviteRecord { status: string; expiresAt: Date; email?: string | null; emails?: string[] | null; }
export function inviteAllowsSignup(invite: InviteRecord | null, email: string, now: Date): boolean;
```

  - `Auth` interface `api` gains:

```ts
createInvite: (input: { body: { email: string; role: string }; headers: Headers }) => Promise<unknown>;
addMember: (input: { body: { userId: string; organizationId: string; role: string } }) => Promise<unknown>;
```

- [ ] **Step 1: Write failing tests for the pure helpers**

Create `packages/server/src/adapters/auth/invites.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { inviteLinkFor, inviteAllowsSignup, STUDENT_ROLE } from './invites.js';

const urls = { studentPortalUrl: 'http://localhost:8002', adminAppUrl: 'http://localhost:8001' };

describe('inviteLinkFor', () => {
  it('sends students to the portal welcome page', () => {
    expect(inviteLinkFor(STUDENT_ROLE, 'tok1', 'jane@example.com', urls)).toBe(
      'http://localhost:8002/welcome?token=tok1&email=jane%40example.com',
    );
  });
  it('sends staff to the admin invite page', () => {
    expect(inviteLinkFor('instructor', 'tok2', 'sam@example.com', urls)).toBe(
      'http://localhost:8001/invite?token=tok2&email=sam%40example.com',
    );
  });
});

describe('inviteAllowsSignup', () => {
  const now = new Date('2026-07-22T12:00:00Z');
  const base = { status: 'pending', expiresAt: new Date('2026-07-29T12:00:00Z') };

  it('accepts a pending, unexpired invite for the matching email (emails array)', () => {
    expect(inviteAllowsSignup({ ...base, emails: ['jane@example.com'] }, 'jane@example.com', now)).toBe(true);
  });
  it('accepts via the legacy single-email field', () => {
    expect(inviteAllowsSignup({ ...base, email: 'jane@example.com' }, 'jane@example.com', now)).toBe(true);
  });
  it('rejects a missing invite', () => {
    expect(inviteAllowsSignup(null, 'jane@example.com', now)).toBe(false);
  });
  it('rejects a non-pending invite', () => {
    expect(inviteAllowsSignup({ ...base, status: 'used', emails: ['jane@example.com'] }, 'jane@example.com', now)).toBe(false);
  });
  it('rejects an expired invite', () => {
    expect(
      inviteAllowsSignup(
        { ...base, expiresAt: new Date('2026-07-21T12:00:00Z'), emails: ['jane@example.com'] },
        'jane@example.com',
        now,
      ),
    ).toBe(false);
  });
  it('rejects an email mismatch', () => {
    expect(inviteAllowsSignup({ ...base, emails: ['other@example.com'] }, 'jane@example.com', now)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @headless-lms/server exec vitest run src/adapters/auth/invites.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `invites.ts`**

```ts
// Pure invite helpers for the better-invite integration: which app an invite
// link lands on, and whether a staged invite entitles a portal signup. Kept
// framework-free so the hook wiring in index.ts stays thin and this logic is
// unit-testable.

export const STUDENT_ROLE = 'student';

export function inviteLinkFor(
  role: string,
  token: string,
  email: string,
  urls: { studentPortalUrl: string; adminAppUrl: string },
): string {
  const base =
    role === STUDENT_ROLE ? `${urls.studentPortalUrl}/welcome` : `${urls.adminAppUrl}/invite`;
  const query = new URLSearchParams({ token, email });
  return `${base}?${query.toString()}`;
}

export interface InviteRecord {
  status: string;
  expiresAt: Date;
  email?: string | null;
  emails?: string[] | null;
}

export function inviteAllowsSignup(invite: InviteRecord | null, email: string, now: Date): boolean {
  if (!invite || invite.status !== 'pending') {
    return false;
  }
  if (new Date(invite.expiresAt) < now) {
    return false;
  }
  const invited = invite.emails ?? (invite.email ? [invite.email] : []);
  return invited.includes(email);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @headless-lms/server exec vitest run src/adapters/auth/invites.test.ts`
Expected: PASS.

- [ ] **Step 5: Thread config**

`packages/server/src/app/container.ts` — `Config` interface gains:

```ts
/** Student portal origin — invite links for students, and the origin whose signups are invite-gated. */
studentPortalUrl: string;
/** Admin app origin — invite links for staff. */
adminAppUrl: string;
```

Pass both into `createAuth({ … })` at the existing call site (`studentPortalUrl: config.studentPortalUrl, adminAppUrl: config.adminAppUrl`).

`apps/api/src/config.ts` — in `loadContainerConfig()` return, add:

```ts
studentPortalUrl: process.env.STUDENT_PORTAL_URL ?? "http://localhost:8002",
adminAppUrl: process.env.ADMIN_APP_URL ?? "http://localhost:8001",
```

Fix the DB-less test configs that build a `Config` literal (`packages/server/src/http/discovery.test.ts`, `packages/server/src/http/oauth-token.test.ts`, `packages/server/src/app/container.test.ts` — find them all with `grep -rln "authBaseURL" packages/server/src`): add the two new fields with the localhost values above.

- [ ] **Step 6: Register the plugin in `createAuth`**

`packages/server/src/adapters/auth/index.ts`:

1. Imports:

```ts
import { invite } from 'better-invite';
import { inviteLinkFor, STUDENT_ROLE } from './invites.js';
```

2. `CreateAuthOptions` (the `opts` type — find it near the top) gains `studentPortalUrl: string; adminAppUrl: string;`. Its `identity` field must expose `recordStudentInvite`, `linkStudentByInvite` (it already carries the `IdentityService`-shaped slice — widen the type there if it is a narrow inline type). Its `organizations` slice must expose `getByExternalId`, `recordInvitation`, `acceptInvitation`, `getMembershipByUser`.

3. Add a lazy self-reference above the `betterAuth({ … })` call so hooks can drive better-auth's own server API:

```ts
// afterAcceptInvite needs auth.api.addMember, but hooks are defined before
// betterAuth() returns — resolved via this ref, assigned right after creation.
const authRef: { current: Auth | null } = { current: null };
```

…and after `}) as unknown as Auth;` change the return to:

```ts
const auth = betterAuth({ … }) as unknown as Auth;
authRef.current = auth;
return auth;
```

4. In the `plugins: [ … ]` array, after `magicLink(…)`, add:

```ts
invite({
  invitationTokenExpiresIn: 60 * 60 * 24 * 7, // 7 days
  defaultMaxUses: 1,
  // Only staff (users with an org membership) may mint invitations; blocks
  // authenticated portal students from hitting /invite/create.
  canCreateInvite: async ({ inviterUser }) => {
    const domainUser = await opts.identity.getUserByExternalId(inviterUser.id);
    if (!domainUser) return false;
    const membership = await opts.organizations.getMembershipByUser(domainUser.id);
    return membership !== null;
  },
  sendUserInvitation: async ({ email, role, token }) => {
    const link = inviteLinkFor(role, token, email, {
      studentPortalUrl: opts.studentPortalUrl,
      adminAppUrl: opts.adminAppUrl,
    });
    await opts.email.send({
      to: email,
      subject: role === STUDENT_ROLE ? "You've been invited to start learning" : "You've been invited to join the team",
      text: `You've been invited. Accept your invitation: ${link}`,
    });
  },
  inviteHooks: {
    // Capture which domain record each invitation belongs to, using the
    // inviter's active org (the surface that minted it).
    afterCreateInvite: async ({ ctx, invitations }) => {
      const session = ctx.context.session as {
        user: { id: string };
        session: { activeOrganizationId?: string | null };
      } | null;
      const orgExternalId = session?.session?.activeOrganizationId ?? null;
      if (!orgExternalId) return;
      for (const inv of invitations) {
        const email = (inv.emails?.[0] ?? inv.email) as string | undefined;
        if (!email) continue;
        if (inv.role === STUDENT_ROLE) {
          const org = await opts.organizations.getByExternalId(orgExternalId);
          if (org) await opts.identity.recordStudentInvite(org.id, email, inv.id);
        } else {
          const inviter = await requireUser(session!.user.id);
          await opts.organizations.recordInvitation({
            orgExternalId,
            authInvitationId: inv.id,
            email,
            role: inv.role,
            status: 'pending',
            inviterUserId: inviter.id,
            expiresAt: inv.expiresAt ?? null,
          });
        }
      }
    },
    // One accept path for every auth method: link the student row, or grant
    // the staff membership recorded for this invitation.
    afterAcceptInvite: async ({ invitation, invitedUser }) => {
      if (invitation.role === STUDENT_ROLE) {
        await opts.identity.linkStudentByInvite(invitation.id, invitedUser.email, invitedUser.id);
        return;
      }
      const record = await opts.organizations.invitationForAccept(invitation.id);
      if (!record || record.status !== 'pending') return; // canceled/unknown → no grant
      await authRef.current!.api.addMember({
        body: { userId: invitedUser.id, organizationId: record.orgExternalId, role: record.role },
      });
      await opts.organizations.acceptInvitation({ authInvitationId: invitation.id });
    },
  },
}),
```

(`organizations.invitationForAccept` is created in Task 5 — implement Tasks 4+5 together before typechecking, or stub the method on the opts type first.)

5. Extend the `Auth` interface's `api` block with `createInvite` and `addMember` (signatures in the Interfaces block above).

- [ ] **Step 7: Typecheck + full server tests**

Run: `pnpm --filter @headless-lms/server typecheck && pnpm --filter @headless-lms/server test`
Expected: clean once Task 5's `invitationForAccept` exists (see note above; if executing strictly in order, add the method's port signature in this task and its implementation in Task 5).

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/adapters/auth packages/server/src/app/container.ts apps/api/src/config.ts packages/server/src/http/discovery.test.ts packages/server/src/http/oauth-token.test.ts packages/server/src/app/container.test.ts
git commit -m "feat(auth): better-invite plugin — role-branched invite emails, capture + accept hooks"
```

---

### Task 5: Organizations — invitationForAccept + staff invite rewiring + mirror-side cancel

**Files:**
- Modify: `packages/server/src/core/organizations/ports.ts`
- Modify: `packages/server/src/core/organizations/service.ts`
- Modify: `packages/server/src/adapters/db/repositories/organizations.ts` (the repo implementing `insertInvitation`; locate with `grep -rn "insertInvitation" packages/server/src/adapters`)
- Modify: `packages/server/src/adapters/auth/org-admin.ts`
- Modify: `packages/server/src/adapters/auth/index.ts` (remove dead org-plugin invitation hooks)
- Test: `packages/server/src/core/organizations/service.test.ts`

**Interfaces:**
- Consumes: `Auth.api.createInvite` (Task 4).
- Produces:

```ts
// OrganizationsService (+ inbound port):
invitationForAccept(authInvitationId: string): Promise<{ orgExternalId: string; role: string; status: string } | null>;

// OrganizationsRepository:
findInvitationByAuthId(authInvitationId: string): Promise<{ orgExternalId: string; role: string; status: string } | null>;
```

- `OrgAdmin.invite` now drives better-invite (`POST /invite/create`) instead of the org plugin's `createInvitation`.
- `removeMember` for `kind === 'invitation'` cancels the **domain mirror** (`setInvitationStatusByAuthId(id, 'canceled')`) instead of calling the auth provider.

- [ ] **Step 1: Write failing service tests**

In `packages/server/src/core/organizations/service.test.ts` (reuse the file's existing fakes; the fake repo gains `findInvitationByAuthId` backed by its invitation store):

```ts
it('invitationForAccept returns the mirror record for a pending invitation', async () => {
  await svc.recordInvitation({
    orgExternalId: 'org_ext_1',
    authInvitationId: 'inv_1',
    email: 'sam@example.com',
    role: 'instructor',
    status: 'pending',
    inviterUserId: 'user_1',
    expiresAt: null,
  });
  const record = await svc.invitationForAccept('inv_1');
  expect(record).toMatchObject({ orgExternalId: 'org_ext_1', role: 'instructor', status: 'pending' });
});

it('removeMember cancels a pending invitation in the mirror only', async () => {
  // Arrange an invitation-kind member via the fakes (see how the existing
  // removeMember invitation-cancel test seeds one), then:
  const removed = await svc.removeMember(ctx, invitationMemberId);
  expect(removed).toBe(true);
  expect(fakeRepo.invitationStatus('inv_1')).toBe('canceled');
  expect(fakeOrgAdmin.cancelInvitationCalls).toHaveLength(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @headless-lms/server exec vitest run src/core/organizations/service.test.ts`
Expected: FAIL — `invitationForAccept` missing; cancel still routed to orgAdmin.

- [ ] **Step 3: Implement**

`ports.ts`: add `invitationForAccept` to the service inbound port and `findInvitationByAuthId` to the repository port (shapes above). Remove `cancelInvitation` from the `OrgAdmin` port.

`service.ts`:

```ts
async invitationForAccept(
  authInvitationId: string,
): Promise<{ orgExternalId: string; role: string; status: string } | null> {
  return this.repo.findInvitationByAuthId(authInvitationId);
}
```

In `removeMember`, replace the `kind === 'invitation'` branch body:

```ts
} else if (member.kind === 'invitation' && member.authInvitationId) {
  // better-invite tokens can only be canceled by their creator; the domain
  // mirror is authoritative for staff grants (afterAcceptInvite refuses
  // non-pending mirrors), so canceling the mirror is canceling the invite.
  await this.repo.setInvitationStatusByAuthId(member.authInvitationId, 'canceled');
}
```

Drizzle repo — implement `findInvitationByAuthId` joining the domain invitations table to `organizations` for `externalId` (mirror the existing invitation queries in that file; select `{ orgExternalId: organizations.externalId, role, status }`, `LIMIT 1`, null when absent).

`org-admin.ts` — replace `invite` and delete `cancelInvitation`:

```ts
async invite(ctx: MemberWriteContext, input: InviteMemberInput): Promise<void> {
  // One invite system for all populations: mint a better-invite invitation
  // (role = staff role); its afterCreateInvite hook mirrors it into the
  // domain, which the members list reads.
  await auth.api.createInvite({
    body: { email: input.email, role: input.role },
    headers: headersOf(ctx),
  });
},
```

`adapters/auth/index.ts` — delete the `afterCreateInvitation` and `afterAcceptInvitation` entries from `organizationHooks` (org-plugin invitations are no longer minted; the better-invite hooks own the mirror now).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @headless-lms/server exec vitest run src/core/organizations/service.test.ts`
Expected: PASS (update any existing tests that asserted `cancelInvitation` was called on the orgAdmin fake — they now assert the mirror status flip).

- [ ] **Step 5: Full server suite + lint + commit**

```bash
pnpm --filter @headless-lms/server test && pnpm lint
git add packages/server/src/core/organizations packages/server/src/adapters/db/repositories packages/server/src/adapters/auth
git commit -m "feat(organizations): staff invites minted via better-invite, mirror-side cancel"
```

---

### Task 6: Invite-only signup gate (portal origin)

**Files:**
- Modify: `packages/server/src/adapters/auth/index.ts`
- Test: `packages/server/src/adapters/auth/invites.test.ts` (already covers the decision function — this task wires it)

**Interfaces:**
- Consumes: `inviteAllowsSignup`, `InviteRecord` (Task 4).
- Produces: `hooks.before` in the betterAuth options — portal-origin `/sign-up/email` without a valid staged invite → 403.

- [ ] **Step 1: Wire the before-hook**

In `createAuth`'s `betterAuth({ … })` options (sibling of `databaseHooks`), add:

```ts
hooks: {
  before: createAuthMiddleware(async (ctx) => {
    if (ctx.path !== '/sign-up/email') return;
    // Only the student portal is invite-only; the admin app keeps open
    // signup (the create-your-org funnel), and invited staff sign up there.
    const origin = ctx.headers?.get('origin') ?? '';
    if (origin !== new URL(opts.studentPortalUrl).origin) return;

    const cookie = ctx.context.createAuthCookie(INVITE_COOKIE_NAME, { maxAge: 60 * 10 });
    const token = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
    const email = (ctx.body as { email?: string } | undefined)?.email ?? '';
    const invite = token
      ? await ctx.context.adapter.findOne<InviteRecord>({
          model: 'invite',
          where: [{ field: 'token', value: token }],
        })
      : null;
    if (!inviteAllowsSignup(invite, email, new Date())) {
      throw new APIError('FORBIDDEN', { message: 'The student portal is invite-only' });
    }
  }),
},
```

Imports to add at the top of the file:

```ts
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { inviteAllowsSignup, type InviteRecord } from './invites.js';
const INVITE_COOKIE_NAME = 'invite_token'; // matches better-invite's constant
```

Verify the constant against the installed package: `grep -rn "INVITE_COOKIE_NAME" node_modules/better-invite/dist/ | head -3` — it must resolve to `"invite_token"`; if the package exports it, import it instead of redeclaring.

- [ ] **Step 2: Typecheck + server tests**

Run: `pnpm --filter @headless-lms/server typecheck && pnpm --filter @headless-lms/server test`
Expected: PASS. (The decision logic is covered by Task 4's `inviteAllowsSignup` tests; the hook is thin wiring.)

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/adapters/auth/index.ts
git commit -m "feat(auth): invite-only signup gate for the student portal origin"
```

---

### Task 7: Contract + routes + SDK — createStudent, resend invite, hasAccount

**Files:**
- Modify: `packages/api-contract/src/students.ts`
- Modify: `packages/server/src/http/routes/students.ts`
- Modify: `packages/server/src/adapters/db/repositories/students.ts` (reporting repo — add `hasAccount` to both `list` and `findById` selects)
- Modify: `packages/sdk/openapi.json` + `packages/sdk/src/generated/*` (via `pnpm gen:sdk`)

**Interfaces:**
- Consumes: `identity.createStudent/getStudentById` (Task 3), `auth.api.createInvite` (Task 4), `ConflictError` (Task 1), `reporting.students.get`.
- Produces (contract):

```ts
export const CreateStudent = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.email(),
  /** Create + send a portal invitation on creation. */
  sendInvite: z.boolean(),
});
export type CreateStudent = z.infer<typeof CreateStudent>;
// Student gains:  hasAccount: z.boolean(),
```

- Produces (SDK, after gen): `Students.createStudent({ body })`, `Students.resendStudentInvite({ path: { id } })`.

- [ ] **Step 1: Contract**

`packages/api-contract/src/students.ts`: add `hasAccount: z.boolean(),` to the `Student` object (after `avgProgress`), and append the `CreateStudent` schema above.

- [ ] **Step 2: Reporting repo**

In `packages/server/src/adapters/db/repositories/students.ts`, add to the selected columns of both the list and by-id queries (matching however the file aliases the students table):

```ts
hasAccount: isNotNull(students.externalId),
```

Import `isNotNull` from `drizzle-orm`. If the file computes the row object in JS instead, use `hasAccount: row.externalId !== null`.

- [ ] **Step 3: Routes**

`packages/server/src/http/routes/students.ts` — add imports `CreateStudent` (contract), `ConflictError` (`../../core/shared/errors.js`), `fromNodeHeaders` (`better-auth/node`), `z` (`zod`), and two routes after the existing GETs:

```ts
r.route({
  method: 'POST',
  url: '/api/students',
  preHandler: app.requireSession,
  schema: {
    operationId: 'createStudent',
    tags: ['Students'],
    summary: 'Create a student manually',
    body: CreateStudent,
    response: { 201: Student, 409: ErrorBody },
  },
  handler: async (req, reply) => {
    const scope = await resolveScope(container, req);
    const created = await container.identity.createStudent({
      orgId: scope.orgId,
      email: req.body.email,
      firstName: req.body.firstName,
      lastName: req.body.lastName,
    });
    if (req.body.sendInvite) {
      // Mint the better-invite invitation as the acting admin; the plugin's
      // afterCreateInvite hook records the invite id on the student row and
      // sendUserInvitation emails the portal welcome link.
      await container.auth.api.createInvite({
        body: { email: created.email, role: 'student' },
        headers: fromNodeHeaders(req.headers),
      });
    }
    const student = await students.get(scope.orgId, created.id);
    return reply.code(201).send(student);
  },
});

r.route({
  method: 'POST',
  url: '/api/students/:id/invite',
  preHandler: app.requireSession,
  schema: {
    operationId: 'resendStudentInvite',
    tags: ['Students'],
    summary: 'Resend the portal invitation for a pending student',
    params: StudentIdParam,
    response: { 204: z.void(), 404: ErrorBody, 409: ErrorBody },
  },
  handler: async (req, reply) => {
    const scope = await resolveScope(container, req);
    const student = await container.identity.getStudentById(scope.orgId, req.params.id);
    if (!student) {
      throw new NotFoundError('Student', req.params.id);
    }
    if (student.externalId !== null) {
      throw new ConflictError('This student already has an account');
    }
    await container.auth.api.createInvite({
      body: { email: student.email, role: 'student' },
      headers: fromNodeHeaders(req.headers),
    });
    return reply.code(204).send();
  },
});
```

- [ ] **Step 4: Typecheck + tests**

Run: `pnpm --filter @headless-lms/api-contract build && pnpm --filter @headless-lms/server typecheck && pnpm --filter @headless-lms/server test`
Expected: PASS.

- [ ] **Step 5: Regenerate the SDK**

DB must be running (same env `pnpm dev` uses). Run: `pnpm gen:sdk`
Expected: `packages/sdk/openapi.json` gains `POST /api/students` + `POST /api/students/{id}/invite`; `Students.createStudent` and `Students.resendStudentInvite` appear in `packages/sdk/src/generated/sdk.gen.ts`; `Student` type gains `hasAccount: boolean`.

- [ ] **Step 6: Commit**

```bash
git add packages/api-contract/src/students.ts packages/server/src/http/routes/students.ts packages/server/src/adapters/db/repositories/students.ts packages/sdk
git commit -m "feat(api): createStudent + resendStudentInvite routes, hasAccount on Student"
```

---

### Task 8: Admin UI — Add student sheet + actions

**Files:**
- Create: `apps/admin/src/app/(dashboard)/students/_components/add-student-sheet.tsx`
- Create: `apps/admin/src/app/(dashboard)/students/actions.ts`
- Modify: `apps/admin/src/app/(dashboard)/students/students-table.tsx`
- Modify: `apps/admin/src/lib/api/types.ts` only if it hand-picks `Student` fields (check `grep -n "Student" apps/admin/src/lib/api/types.ts`; if it re-exports the SDK type, `hasAccount` flows automatically).

**Interfaces:**
- Consumes: `Students.createStudent`, `Students.resendStudentInvite` (SDK, Task 7); `FormSheet`, `Field`, `Input` components; `ensureConfigured/authHeaders/unwrap/expectOk` from `@/lib/api/server-call`; `ApiError` from `@/lib/api/http`.
- Produces: `createStudentAction(input): Promise<Student>`, `resendStudentInviteAction(id): Promise<void>` (used again in Task 9's profile work).

- [ ] **Step 1: Server actions**

`apps/admin/src/app/(dashboard)/students/actions.ts`:

```ts
"use server";

// Server actions for student mutations (list page + detail page).

import { revalidatePath } from "next/cache";
import { Students } from "@headless-lms/sdk";

import { ensureConfigured, authHeaders, unwrap, expectOk } from "@/lib/api/server-call";
import type { Student } from "@/lib/api/types";

export interface CreateStudentInput {
  firstName: string;
  lastName: string;
  email: string;
  sendInvite: boolean;
}

export async function createStudentAction(input: CreateStudentInput): Promise<Student> {
  ensureConfigured();
  const student = unwrap(
    await Students.createStudent({ body: input, ...(await authHeaders()) }),
  );
  revalidatePath("/students");
  return student;
}

export async function resendStudentInviteAction(id: string): Promise<void> {
  ensureConfigured();
  expectOk(
    await Students.resendStudentInvite({ path: { id }, ...(await authHeaders()) }),
  );
  revalidatePath(`/students/${id}`);
}
```

- [ ] **Step 2: Add-student sheet**

`apps/admin/src/app/(dashboard)/students/_components/add-student-sheet.tsx` (pattern: `entitlements/_components/grant-access-sheet.tsx`):

```tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { FormSheet } from "@/components/forms/form-sheet";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ApiError } from "@/lib/api/http";

import { createStudentAction } from "../actions";

const FORM_ID = "add-student-form";

const schema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.email("Enter a valid email"),
  sendInvite: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const DEFAULTS: FormValues = { firstName: "", lastName: "", email: "", sendInvite: true };

export function AddStudentSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: DEFAULTS });

  React.useEffect(() => {
    if (open) reset(DEFAULTS);
  }, [open, reset]);

  const sendInvite = watch("sendInvite");

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      try {
        const student = await createStudentAction(values);
        toast.success(values.sendInvite ? "Student added — invitation sent" : "Student added");
        onOpenChange(false);
        router.push(`/students/${student.id}`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          setError("email", { message: "A student with this email already exists" });
          return;
        }
        toast.error("Couldn't add student", { description: (err as Error).message });
      }
    });
  });

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Add student"
      description="Create a student record. Send an invitation so they can set up their portal account."
      formId={FORM_ID}
      submitLabel="Add student"
      pending={pending}
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-4">
          <Field id="firstName" label="First name" required error={errors.firstName?.message}>
            <Input id="firstName" aria-invalid={!!errors.firstName} {...register("firstName")} />
          </Field>
          <Field id="lastName" label="Last name" required error={errors.lastName?.message}>
            <Input id="lastName" aria-invalid={!!errors.lastName} {...register("lastName")} />
          </Field>
        </div>
        <Field id="email" label="Email" required error={errors.email?.message}>
          <Input id="email" type="email" aria-invalid={!!errors.email} {...register("email")} />
        </Field>
        <Field
          id="sendInvite"
          label="Invitation"
          hint="Email a single-use link to the student portal where they create their account."
        >
          <label className="flex items-center gap-2 text-sm text-ink">
            <Checkbox
              id="sendInvite"
              checked={sendInvite}
              onCheckedChange={(v) => setValue("sendInvite", v === true)}
            />
            Send invite email
          </label>
        </Field>
      </form>
    </FormSheet>
  );
}
```

If there is no `@/components/ui/checkbox` (check `ls apps/admin/src/components/ui/`), use a native `<input type="checkbox" {...register("sendInvite")} className="size-4 accent-current" />` inside the label and drop `watch/setValue`.

- [ ] **Step 3: Header button on the students table**

`apps/admin/src/app/(dashboard)/students/students-table.tsx` — inside `StudentsTableInner`, add state + wire the sheet:

```tsx
const [addOpen, setAddOpen] = React.useState(false);
```

Replace `<PageHeader title="Students" />` with:

```tsx
<PageHeader
  title="Students"
  actions={
    <Button variant="primary" onClick={() => setAddOpen(true)}>
      <Plus />
      Add student
    </Button>
  }
/>
<AddStudentSheet open={addOpen} onOpenChange={setAddOpen} />
```

Imports: `Plus` from `lucide-react`, `Button` from `@/components/ui/button`, `AddStudentSheet` from `./_components/add-student-sheet`. Check `PageHeader`'s actual prop name for the right slot (`grep -n "actions\|children" apps/admin/src/components/page-header.tsx`) and match it.

- [ ] **Step 4: Verify in the browser**

Run: `pnpm dev` → http://localhost:8001/students → "Add student" → submit valid values.
Expected: toast, navigation to the new profile, student visible in the list; with a duplicate email the form shows the inline email error. With Resend configured (`RESEND_API_KEY`), an invitation email is dispatched; without it, the email adapter logs `email send failed: no transport configured` — createInvite still succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/app/\(dashboard\)/students
git commit -m "feat(admin): add-student sheet with invite email option"
```

---

### Task 9: Admin UI — profile Grant access + pending state + resend

**Files:**
- Create: `apps/admin/src/app/(dashboard)/students/_components/grant-access-sheet.tsx`
- Modify: `apps/admin/src/app/(dashboard)/students/[studentId]/page.tsx`
- Modify: `apps/admin/src/app/(dashboard)/students/[studentId]/student-detail-view.tsx`
- Modify: `apps/admin/src/app/(dashboard)/entitlements/actions.ts`

**Interfaces:**
- Consumes: `grantEntitlementAction` (existing), `resendStudentInviteAction` (Task 8), `serverApi.coursesLite()` (existing — verify name in `apps/admin/src/lib/api/server.ts`), `Student.hasAccount` (Task 7).
- Produces: `GrantAccessSheet({ open, onOpenChange, studentId, courses })` — course + expiry form, student fixed.

- [ ] **Step 1: Revalidate the profile after grants**

`apps/admin/src/app/(dashboard)/entitlements/actions.ts` — in `grantEntitlementAction`, after `revalidatePath("/entitlements");` add:

```ts
revalidatePath(`/students/${input.studentId}`);
```

- [ ] **Step 2: Student-fixed grant sheet**

`apps/admin/src/app/(dashboard)/students/_components/grant-access-sheet.tsx` — copy the form structure of `entitlements/_components/grant-access-sheet.tsx` with these deltas (full file):

```tsx
"use client";

import * as React from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { FormSheet } from "@/components/forms/form-sheet";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { grantEntitlementAction } from "../../entitlements/actions";

const FORM_ID = "student-grant-access-form";

export type LiteCourse = { id: string; title: string };

const schema = z
  .object({
    courseId: z.string().min(1, "Select a course"),
    expiryMode: z.enum(["never", "date"]),
    expiresAt: z.string().optional(),
  })
  .refine((d) => d.expiryMode === "never" || (!!d.expiresAt && d.expiresAt.length > 0), {
    message: "Pick an expiry date",
    path: ["expiresAt"],
  });

type FormValues = z.infer<typeof schema>;

export function GrantAccessSheet({
  open,
  onOpenChange,
  studentId,
  courses,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  courses: LiteCourse[];
}) {
  const [pending, startTransition] = React.useTransition();

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { courseId: "", expiryMode: "never", expiresAt: "" },
  });

  React.useEffect(() => {
    if (open) reset({ courseId: "", expiryMode: "never", expiresAt: "" });
  }, [open, reset]);

  const expiryMode = useWatch({ control, name: "expiryMode" });

  const onSubmit = handleSubmit((values) => {
    const input = {
      studentId,
      contentId: values.courseId,
      expiresAt:
        values.expiryMode === "never" || !values.expiresAt
          ? null
          : new Date(values.expiresAt).toISOString(),
    };
    startTransition(async () => {
      try {
        await grantEntitlementAction(input);
        toast.success("Access granted");
        onOpenChange(false);
      } catch (err) {
        toast.error("Couldn't grant access", { description: (err as Error).message });
      }
    });
  });

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Grant access"
      description="Grant this student access to a course. They'll get immediate access."
      formId={FORM_ID}
      submitLabel="Grant access"
      pending={pending}
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-5">
        <Controller
          control={control}
          name="courseId"
          render={({ field }) => (
            <Field id="courseId" label="Course" required error={errors.courseId?.message}>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="courseId" aria-invalid={!!errors.courseId}>
                  <SelectValue placeholder="Select a course" />
                </SelectTrigger>
                <SelectContent>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        />

        <Controller
          control={control}
          name="expiryMode"
          render={({ field }) => (
            <Field
              id="expiryMode"
              label="Access expiry"
              hint="Lifetime access never expires; set a date to time-box this entitlement."
            >
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="expiryMode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Never expires</SelectItem>
                  <SelectItem value="date">Expires on a date</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}
        />

        {expiryMode === "date" ? (
          <Field id="expiresAt" label="Expiry date" required error={errors.expiresAt?.message}>
            <Input
              id="expiresAt"
              type="date"
              aria-invalid={!!errors.expiresAt}
              {...register("expiresAt")}
            />
          </Field>
        ) : null}
      </form>
    </FormSheet>
  );
}
```

- [ ] **Step 3: Wire the profile**

`[studentId]/page.tsx` — fetch courses alongside (check the exact lite-list method name used by `entitlements/page.tsx`, e.g. `serverApi.coursesLite()`):

```ts
const dataPromise = Promise.all([
  serverApi.getStudent(studentId),
  serverApi.studentEntitlements(studentId),
  serverApi.coursesLite(),
]);
await requireManager(dataPromise);
const [student, entitlements, courses] = await dataPromise;

return <StudentDetailView student={student} entitlements={entitlements} courses={courses} />;
```

`student-detail-view.tsx`:

1. Props gain `courses: LiteCourse[]`; import `GrantAccessSheet, type LiteCourse` from `../_components/grant-access-sheet` and `resendStudentInviteAction` from `../actions`.
2. In `StudentDetailView`, add `const [grantOpen, setGrantOpen] = React.useState(false);` (add the `* as React` import and `"use client"` is already present) and render next to the entitlements heading:

```tsx
<div className="flex items-baseline justify-between gap-4">
  <h2 className="text-lg font-semibold tracking-tight text-ink">Entitlements</h2>
  <div className="flex items-center gap-3">
    {entitlements.length > 0 ? (
      <span className="text-sm text-ink-3">{entitlements.length} total</span>
    ) : null}
    <Button variant="primary" size="sm" onClick={() => setGrantOpen(true)}>
      Grant access
    </Button>
  </div>
</div>
…
<GrantAccessSheet
  open={grantOpen}
  onOpenChange={setGrantOpen}
  studentId={student.id}
  courses={courses}
/>
```

3. Pending-account state in `StudentHeader` — under the email line, when `!student.hasAccount`:

```tsx
{!student.hasAccount ? (
  <p className="flex items-center gap-2 text-xs text-ink-4">
    <span className="inline-flex items-center rounded-full border border-line px-2 py-0.5 font-medium text-ink-3">
      Invite pending
    </span>
    <button
      type="button"
      onClick={onResendInvite}
      className="underline-offset-4 hover:text-ink hover:underline"
    >
      Resend invite
    </button>
  </p>
) : null}
```

`StudentHeader` gains an `onResendInvite: () => void` prop; the parent implements it:

```tsx
const [resending, startResend] = React.useTransition();
const onResendInvite = () =>
  startResend(async () => {
    try {
      await resendStudentInviteAction(student.id);
      toast.success("Invitation sent");
    } catch (err) {
      toast.error("Couldn't resend invite", { description: (err as Error).message });
    }
  });
```

(Import `toast` from `sonner`. `resending` may disable the button.)

- [ ] **Step 4: Verify in the browser**

http://localhost:8001/students/<id> for a pending student: "Invite pending" badge + working resend toast; "Grant access" opens the sheet, granting adds the entitlement to the list without a manual refresh (revalidate). Empty-state copy on the list page still makes sense — update `emptyDescription` in `students-table.tsx` to `"Add a student or wait for enrollments to appear here."`

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/app/\(dashboard\)/students apps/admin/src/app/\(dashboard\)/entitlements/actions.ts
git commit -m "feat(admin): profile grant-access sheet, invite-pending state with resend"
```

---

### Task 10: Landing pages — admin `/invite`, portal `/welcome`, remove `/no-access`

**Files:**
- Create: `apps/admin/src/app/invite/page.tsx`
- Create: `apps/admin/src/app/invite/invite-view.tsx`
- Create: `apps/student/src/app/welcome/page.tsx`
- Create: `apps/student/src/app/welcome/welcome-view.tsx`
- Modify: `apps/admin/src/lib/auth/client.ts`, `apps/student/src/lib/auth/client.ts` (add `inviteClient`)
- Modify: `apps/student/src/lib/api/shared.ts` (401 → `/login?reset=1`)
- Modify: `apps/student/src/app/login/login-view.tsx` (handle `reset`)
- Delete: `apps/student/src/app/no-access/` (entire directory)
- Modify: `apps/admin/package.json`, `apps/student/package.json` (add `better-invite` for the client plugin type)

**Interfaces:**
- Consumes: better-invite endpoints `POST /invite/activate { token, callbackURL }` (sets the signed cookie when logged out — response `action: "SIGN_IN_UP_REQUIRED"`; consumes immediately when logged in), signup gate (Task 6), accept hooks (Task 4).
- Produces: invite links from Task 4 (`/welcome?token=…&email=…`, `/invite?token=…&email=…`) resolve end-to-end.

- [ ] **Step 1: Client plugins**

Run: `pnpm --filter admin add better-invite && pnpm --filter student add better-invite` (use the actual package names from each app's package.json — check `grep '"name"' apps/admin/package.json apps/student/package.json`).

In both `lib/auth/client.ts` files add:

```ts
import { inviteClient } from "better-invite";
```

and add `inviteClient()` to the `plugins` array (student client has none yet — add `plugins: [inviteClient()],`). Export nothing new; pages call `authClient.invite.activate`.

- [ ] **Step 2: Portal `/welcome`**

`apps/student/src/app/welcome/page.tsx`:

```tsx
import { Suspense } from "react";
import { WelcomeView } from "./welcome-view";

export default function WelcomePage() {
  return (
    <Suspense fallback={null}>
      <WelcomeView />
    </Suspense>
  );
}
```

`apps/student/src/app/welcome/welcome-view.tsx` — same two-column shell/classes as `login-view.tsx`; core logic:

```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";

import { authClient, signIn, signUp } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Stage = "activating" | "create" | "signin" | "invalid";

export function WelcomeView() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const email = params.get("email") ?? "";
  const [stage, setStage] = React.useState<Stage>("activating");
  const [error, setError] = React.useState<string | null>(null);

  // Stage the invite token: logged out → better-invite stores it in a signed
  // cookie and the sign-up/in that follows consumes it; already logged in →
  // it is consumed right here and the account is linked.
  React.useEffect(() => {
    if (!token) {
      setStage("invalid");
      return;
    }
    let cancelled = false;
    authClient.invite
      .activate({ token, callbackURL: "/" })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setStage("invalid");
          return;
        }
        if (data?.action === "SIGN_IN_UP_REQUIRED") {
          setStage("create");
        } else {
          // Session existed — invite consumed and linked; straight in.
          router.replace("/");
        }
      })
      .catch(() => !cancelled && setStage("invalid"));
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  // …render per stage:
  // activating → centered <Loader2 className="animate-spin" />
  // invalid    → "This invitation link is invalid or has expired." + hint to
  //              ask the course admin for a new invite. No other actions.
  // create     → CreateAccountForm (below) + "Already have an account?
  //              Sign in" link → setStage("signin")
  // signin     → the same email/password form as login-view's SignInForm with
  //              email locked to the invite email; submit → signIn.email; the
  //              staged cookie is consumed on sign-in and links this org's row.
}

function CreateAccountForm({ email, onDone }: { email: string; onDone: () => void }) {
  const [name, setName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } = await signUp.email({ email, password, name });
    if (error) {
      setError(error.message ?? "Couldn't create your account");
      setSubmitting(false);
      return;
    }
    onDone(); // router.replace("/")
  }

  // fields: Name (text, required), Email (type=email, value={email}, readOnly,
  // muted style), Password (type=password, autoComplete="new-password",
  // minLength 8) — same inputClass as login-view; submit label "Create account".
}
```

Write the full JSX for every stage — reuse `inputClass`, the error banner markup, and the showcase column verbatim from `login-view.tsx` so the two pages look like siblings. Copy: heading "Welcome" / sub "You've been invited. Create your account to start learning."

- [ ] **Step 3: Portal 401 handling + delete `/no-access`**

`apps/student/src/lib/api/shared.ts` — replace `if (status === 401) redirect("/no-access");` with `if (status === 401) redirect("/login?reset=1");` and update the file's comment (401 = stale/unlinked session → back to login).

`apps/student/src/app/login/login-view.tsx`:

```tsx
import { signIn, signOut, useSession } from "@/lib/auth/client";
// …
const reset = params.get("reset") === "1";

React.useEffect(() => {
  if (!session) return;
  if (reset) {
    // The API said this session doesn't resolve to a portal student — drop it
    // instead of bouncing back and forth.
    void signOut().then(() => router.replace("/login"));
    return;
  }
  router.replace(next);
}, [session, reset, router, next]);
```

Delete the page: `git rm -r apps/student/src/app/no-access`
Then confirm nothing else references it: `grep -rn "no-access" apps/student/src` → only comments may remain; update them.

- [ ] **Step 4: Admin `/invite`**

`apps/admin/src/app/invite/page.tsx` + `invite-view.tsx` — same stage machine as the portal `welcome-view` (activate → create/sign-in/invalid) but:
- Uses the **admin** `authClient` / `signIn` / `signUp` from `@/lib/auth/client`.
- Visual shell: single centered card like `create-organization.tsx` (Logo + `rounded-card border border-line bg-surface p-6`), not the two-column login layout.
- Copy: heading "Join the team" / sub "You've been invited to an organization. Create your account or sign in to accept."
- On success (`signUp.email` / `signIn.email` resolve, or activate consumed a live session): `window.location.assign("/")` — a full reload so the server session resolver picks up the new membership/active org (same rationale as `create-organization.tsx`).
- Note: admin signup is open (no gate), so no cookie subtleties — the staged cookie is consumed by the after-hook on sign-up/in and `afterAcceptInvite` adds the membership.

- [ ] **Step 5: Verify end-to-end in the browser**

With `pnpm dev` and a mail-less env (read the invite link from the API logs if Resend isn't configured — add a temporary `console.log` is NOT needed: the `EmailAdapter` no-transport path logs an error; for local verification set `RESEND_API_KEY` or read the invite token from the `invite` table):

1. Admin adds a student with "Send invite email" → copy `/welcome?token=…` link → open in an incognito window → create account → lands in the portal, `students.external_id` populated (`psql`: `select external_id, invite_id from students where email='…'`).
2. Portal signup WITHOUT an invite (direct `POST` from the portal login page origin or temporarily re-exposing a signup form) → 403 `The student portal is invite-only`.
3. Team → invite an instructor → `/invite?token=…` → create account → lands on the dashboard as a member; member row visible in Settings → Team.
4. `/welcome` with a garbage token → invalid state.

- [ ] **Step 6: Commit**

```bash
git add apps/student/src/app apps/student/src/lib apps/admin/src/app/invite apps/admin/src/lib/auth/client.ts apps/admin/package.json apps/student/package.json pnpm-lock.yaml
git rm -r --cached apps/student/src/app/no-access 2>/dev/null; true
git commit -m "feat(apps): invite landing pages, invite-only portal onboarding, drop no-access"
```

---

### Task 11: Full verification sweep

**Files:** none new — fixes only where checks fail.

- [ ] **Step 1: Static checks**

Run: `pnpm lint && pnpm typecheck`
Expected: clean. Boundary rules especially: `core/identity` must not have gained adapter/framework imports.

- [ ] **Step 2: Full test suite**

Run: `pnpm test`
Expected: all workspaces green.

- [ ] **Step 3: SDK freshness**

Run: `pnpm gen:sdk && git status --short packages/sdk`
Expected: no diff (already regenerated in Task 7; a diff here means routes changed after — commit it).

- [ ] **Step 4: Builds**

Run: `pnpm build`
Expected: all workspaces build (Next apps compile the new pages).

- [ ] **Step 5: Commit any stragglers**

```bash
git add -A && git commit -m "chore: verification fixes for student creation + invites" || echo "clean"
```

---

## Self-review notes (already applied)

- Spec §2's `StudentInviter` core port is replaced by route-level orchestration (Global Constraints → Deviations) because `/invite/create` needs the acting admin's session headers.
- Spec §7 pending indicator requires `Student.hasAccount` — added to contract/reporting in Task 7 (the spec implied but never named it).
- better-invite's private-create response returns no invitation id, so capture happens in `afterCreateInvite` (Task 4), not from the route's response.
- Staff cancel uses the domain mirror + accept-time guard (Task 5) because better-invite tokens are creator-cancel-only.
