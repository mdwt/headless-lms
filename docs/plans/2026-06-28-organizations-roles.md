# Organizations Roles Implementation Plan

> **Status: ✅ Done (implemented 2026-06).**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text `membership.role` with a structured, code-defined role model (`owner | admin | instructor | student`), a permission matrix, and a course-assignment link for instructor scope — with Better Auth's organization plugin configured to use those four roles as its system-of-record roles.

**Architecture:** `organizations` core context owns the domain `Role` union, the permission matrix (a pure function — no DB enum), and `CourseAssignment` (instructor↔course). The Better Auth org plugin (the system of record) is configured with matching custom roles via its access-control API; mirrored roles are validated into the domain `Role` at the repository boundary.

**Tech Stack:** TypeScript (strict, ESM), Drizzle + Postgres, Better Auth (organization plugin + access control), Vitest, ESLint boundaries.

## Global Constraints

- Node 22, ESM. Every relative import uses a `.js` specifier (e.g. `./roles.js`).
- `core/` is framework-, runtime-, and persistence-free: no `drizzle-orm`, `pg`, `fastify`. Enforced by ESLint.
- No Postgres enums. Discriminator/role/status fields are `text` columns; allowed values are TypeScript string-literal unions defined in `core/`.
- Org-scoped tables use a composite `(org_id, id)` primary key; cross-references within a tenant use composite FKs `(org_id, <target>_id) → target(org_id, id)`.
- Drizzle schema lives in `apps/api/src/adapters/db/schema/`; repository implementations in `apps/api/src/adapters/db/repositories/`. The schema barrel is `schema/index.ts`.
- Verify with `pnpm typecheck`, `pnpm lint`, `pnpm test` (run from repo root). Lint must exit 0.
- Commit messages end with the footer:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_019hvttxxvnMNzeCrS1jprWo
  ```

---

### Task 1: Domain roles + permission matrix

**Files:**
- Create: `apps/api/src/core/organizations/roles.ts`
- Test: `apps/api/src/core/organizations/roles.test.ts`

**Interfaces:**
- Produces:
  - `ROLES: readonly ["owner","admin","instructor","student"]`
  - `type Role = "owner" | "admin" | "instructor" | "student"`
  - `isRole(value: string): value is Role`
  - `parseRole(value: string): Role` (throws on unknown)
  - `type Permission` (8 string-literal members, see code)
  - `type Capability = true | "assigned" | "enrolled"`
  - `capability(role: Role, permission: Permission): Capability | false`
  - `canForCourse(role: Role, permission: Permission, ctx: { assignedCourseIds: readonly string[]; courseId: string }): boolean`

- [x] **Step 1: Write the failing test**

```ts
// apps/api/src/core/organizations/roles.test.ts
import { describe, it, expect } from "vitest";
import { ROLES, isRole, parseRole, capability, canForCourse } from "./roles.js";

describe("roles", () => {
  it("exposes the four roles", () => {
    expect([...ROLES]).toEqual(["owner", "admin", "instructor", "student"]);
  });

  it("parseRole accepts a known role and rejects an unknown one", () => {
    expect(parseRole("instructor")).toBe("instructor");
    expect(isRole("member")).toBe(false);
    expect(() => parseRole("member")).toThrow(/unknown role/);
  });

  it("capability reflects the permission matrix", () => {
    expect(capability("owner", "manage_billing")).toBe(true);
    expect(capability("admin", "manage_billing")).toBe(false);
    expect(capability("instructor", "edit_assigned_course")).toBe("assigned");
    expect(capability("student", "consume_content")).toBe("enrolled");
    expect(capability("student", "create_course")).toBe(false);
  });

  it("canForCourse resolves unconditional and assigned scopes", () => {
    expect(canForCourse("admin", "grade_assessments", { assignedCourseIds: [], courseId: "c1" })).toBe(true);
    expect(canForCourse("instructor", "grade_assessments", { assignedCourseIds: ["c1"], courseId: "c1" })).toBe(true);
    expect(canForCourse("instructor", "grade_assessments", { assignedCourseIds: ["c2"], courseId: "c1" })).toBe(false);
    expect(canForCourse("student", "consume_content", { assignedCourseIds: [], courseId: "c1" })).toBe(false);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/api/src/core/organizations/roles.test.ts`
Expected: FAIL — `Cannot find module './roles.js'`.

- [x] **Step 3: Write the implementation**

```ts
// apps/api/src/core/organizations/roles.ts
// organizations context — roles and the authorization matrix.
// Defined in code (no DB enum). The DB stores role as text; the domain narrows
// it to Role and answers authorization questions here.

export const ROLES = ["owner", "admin", "instructor", "student"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function parseRole(value: string): Role {
  if (!isRole(value)) throw new Error(`unknown role: ${value}`);
  return value;
}

export type Permission =
  | "manage_billing"
  | "manage_org_settings"
  | "manage_users"
  | "create_course"
  | "edit_assigned_course"
  | "grade_assessments"
  | "view_student_progress"
  | "consume_content";

// Unconditional (true), course-scoped ("assigned" — requires the course to be
// assigned to the member), or enrollment-scoped ("enrolled" — access owned by
// entitlements). Absent ⇒ denied.
export type Capability = true | "assigned" | "enrolled";

const MATRIX: Record<Role, Partial<Record<Permission, Capability>>> = {
  owner: {
    manage_billing: true,
    manage_org_settings: true,
    manage_users: true,
    create_course: true,
    edit_assigned_course: true,
    grade_assessments: true,
    view_student_progress: true,
  },
  admin: {
    manage_org_settings: true,
    manage_users: true,
    create_course: true,
    edit_assigned_course: true,
    grade_assessments: true,
    view_student_progress: true,
  },
  instructor: {
    edit_assigned_course: "assigned",
    grade_assessments: "assigned",
    view_student_progress: "assigned",
  },
  student: {
    consume_content: "enrolled",
  },
};

export function capability(role: Role, permission: Permission): Capability | false {
  return MATRIX[role][permission] ?? false;
}

export function canForCourse(
  role: Role,
  permission: Permission,
  ctx: { assignedCourseIds: readonly string[]; courseId: string },
): boolean {
  const cap = capability(role, permission);
  if (cap === true) return true;
  if (cap === "assigned") return ctx.assignedCourseIds.includes(ctx.courseId);
  return false;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run apps/api/src/core/organizations/roles.test.ts`
Expected: PASS (4 tests).

- [x] **Step 5: Commit**

```bash
git add apps/api/src/core/organizations/roles.ts apps/api/src/core/organizations/roles.test.ts
git commit -m "feat(organizations): add structured roles + permission matrix"
```

---

### Task 2: Type `Membership.role` as `Role` and validate at the boundary

**Files:**
- Modify: `apps/api/src/core/organizations/model.ts`
- Modify: `apps/api/src/core/organizations/index.ts`
- Modify: `apps/api/src/adapters/db/repositories/organizations.ts`
- Modify: `apps/api/src/core/organizations/service.test.ts`

**Interfaces:**
- Consumes: `Role`, `parseRole` from `./roles.js` (Task 1).
- Produces: `Membership.role` is now `Role` (was `string`). Public surface re-exports `Role`, `parseRole`, `capability`, `canForCourse`, `Permission`, `Capability`, `ROLES`. The repository narrows `role` via `parseRole` on membership reads so the build stays green.

- [x] **Step 1: Update the membership model to use `Role`**

In `apps/api/src/core/organizations/model.ts`, add the import at the top and change the `Membership.role` field type:

```ts
import type { Role } from "./roles.js";
```

Change:
```ts
  readonly role: string;
```
to:
```ts
  readonly role: Role;
```
(within the `Membership` interface only — leave `Invitation.role` as `string`).

- [x] **Step 2: Re-export the role surface from the context index**

In `apps/api/src/core/organizations/index.ts`, add:

```ts
export { ROLES, isRole, parseRole, capability, canForCourse } from "./roles.js";
export type { Role, Permission, Capability } from "./roles.js";
```

- [x] **Step 3: Narrow `role` to `Role` in the repository (keeps the build green)**

In `apps/api/src/adapters/db/repositories/organizations.ts`, add the import:

```ts
import { parseRole } from "../../../core/organizations/index.js";
```

In `insertMembership`, the DB returns `role` as `text` (`string`) but `Membership.role` is now `Role`. Map the two membership returns:

```ts
    if (row) return { ...row, role: parseRole(row.role) };
    // ...existing "already mirrored" lookup unchanged...
    if (!existing) throw new Error("failed to insert membership");
    return { ...existing, role: parseRole(existing.role) };
```

- [x] **Step 4: Add a test asserting the mirrored role is a typed Role**

Append to `apps/api/src/core/organizations/service.test.ts` (inside the existing `describe("OrganizationService", ...)` block):

```ts
  it("stores the membership role as a domain Role", async () => {
    const { repo } = fakeRepo();
    const svc = new OrganizationServiceImpl(repo);
    await svc.provisionOrganization(orgInput);
    const m = await svc.addMembership({
      authOrgId: "org_1",
      authMemberId: "mem_1",
      studentId: "s2",
      role: "instructor",
    });
    expect(m.role).toBe("instructor");
  });
```

- [x] **Step 5: Run typecheck and the org tests**

Run: `pnpm typecheck`
Expected: Done (no errors). The `fakeRepo` in `service.test.ts` builds `Membership` objects with `role: input.role` — `input.role` is `string`; change the fake's membership build to `role: input.role as Role` and add `import type { Role } from "./roles.js";` at the top of the test if typecheck complains.

Run: `pnpm vitest run apps/api/src/core/organizations/service.test.ts`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add apps/api/src/core/organizations apps/api/src/adapters/db/repositories/organizations.ts
git commit -m "feat(organizations): type membership role as domain Role"
```

---

### Task 3: Course assignment — model, types, ports, service

**Files:**
- Modify: `apps/api/src/core/organizations/model.ts`
- Modify: `apps/api/src/core/organizations/types.ts`
- Modify: `apps/api/src/core/organizations/ports.ts`
- Modify: `apps/api/src/core/organizations/service.ts`
- Modify: `apps/api/src/core/organizations/index.ts`
- Modify: `apps/api/src/core/organizations/service.test.ts`

**Interfaces:**
- Consumes: `OrganizationsRepository`, `Organization` (existing).
- Produces:
  - `interface CourseAssignment { id; orgId; membershipId; courseId; createdAt }`
  - `interface AssignCourseInput { authOrgId: string; membershipId: string; courseId: string }`
  - On `OrganizationService`: `assignCourse(input: AssignCourseInput): Promise<CourseAssignment>`, `unassignCourse(input: AssignCourseInput): Promise<void>`, `assignedCourseIds(orgId: string, membershipId: string): Promise<string[]>`
  - On `OrganizationsRepository`: `insertCourseAssignment(orgId, input): Promise<CourseAssignment>`, `deleteCourseAssignment(orgId, membershipId, courseId): Promise<void>`, `findAssignedCourseIds(orgId, membershipId): Promise<string[]>`

- [x] **Step 1: Write failing service tests**

Append to `apps/api/src/core/organizations/service.test.ts` inside the describe block:

```ts
  it("assigns and lists instructor course assignments", async () => {
    const { repo } = fakeRepo();
    const svc = new OrganizationServiceImpl(repo);
    const org = await svc.provisionOrganization(orgInput);
    const a = await svc.assignCourse({ authOrgId: "org_1", membershipId: "m1", courseId: "c1" });
    expect(a.orgId).toBe(org.id);
    expect(a.courseId).toBe("c1");
    expect(await svc.assignedCourseIds(org.id, "m1")).toEqual(["c1"]);
  });

  it("unassigns a course", async () => {
    const { repo } = fakeRepo();
    const svc = new OrganizationServiceImpl(repo);
    const org = await svc.provisionOrganization(orgInput);
    await svc.assignCourse({ authOrgId: "org_1", membershipId: "m1", courseId: "c1" });
    await svc.unassignCourse({ authOrgId: "org_1", membershipId: "m1", courseId: "c1" });
    expect(await svc.assignedCourseIds(org.id, "m1")).toEqual([]);
  });
```

- [x] **Step 2: Extend the fake repo in the test to support assignments**

In `apps/api/src/core/organizations/service.test.ts`, inside `fakeRepo()`, add an `assignments` array and three methods to the `repo` object:

```ts
  const assignments: { id: string; orgId: string; membershipId: string; courseId: string; createdAt: Date }[] = [];
```

and within the `repo` object literal:

```ts
    async insertCourseAssignment(orgId, input) {
      const row = { id: `a${++n}`, orgId, membershipId: input.membershipId, courseId: input.courseId, createdAt: new Date(0) };
      assignments.push(row);
      return row;
    },
    async deleteCourseAssignment(orgId, membershipId, courseId) {
      const i = assignments.findIndex((x) => x.orgId === orgId && x.membershipId === membershipId && x.courseId === courseId);
      if (i >= 0) assignments.splice(i, 1);
    },
    async findAssignedCourseIds(orgId, membershipId) {
      return assignments.filter((x) => x.orgId === orgId && x.membershipId === membershipId).map((x) => x.courseId);
    },
```

- [x] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run apps/api/src/core/organizations/service.test.ts`
Expected: FAIL — `svc.assignCourse is not a function` (and type errors on the new repo methods).

- [x] **Step 4: Add the model and input types**

In `apps/api/src/core/organizations/model.ts`, append:

```ts
export interface CourseAssignment {
  readonly id: string;
  readonly orgId: string;
  readonly membershipId: string;
  readonly courseId: string;
  readonly createdAt: Date;
}
```

In `apps/api/src/core/organizations/types.ts`, append:

```ts
export interface AssignCourseInput {
  authOrgId: string;
  membershipId: string;
  courseId: string;
}
```

- [x] **Step 5: Extend the ports**

In `apps/api/src/core/organizations/ports.ts`:

Add to the import from `./model.js`: `CourseAssignment`, and from `./types.js`: `AssignCourseInput`.

Add to `OrganizationService` (after `getByAuthOrgId`):
```ts
  assignCourse(input: AssignCourseInput): Promise<CourseAssignment>;
  unassignCourse(input: AssignCourseInput): Promise<void>;
  assignedCourseIds(orgId: string, membershipId: string): Promise<string[]>;
```

Add to `OrganizationsRepository`:
```ts
  insertCourseAssignment(orgId: string, input: AssignCourseInput): Promise<CourseAssignment>;
  deleteCourseAssignment(orgId: string, membershipId: string, courseId: string): Promise<void>;
  findAssignedCourseIds(orgId: string, membershipId: string): Promise<string[]>;
```

- [x] **Step 6: Implement the service methods**

In `apps/api/src/core/organizations/service.ts`, add imports `CourseAssignment` (from `./model.js`) and `AssignCourseInput` (from `./types.js`), then add methods to `OrganizationServiceImpl`:

```ts
  async assignCourse(input: AssignCourseInput): Promise<CourseAssignment> {
    const org = await this.requireOrg(input.authOrgId);
    return this.repo.insertCourseAssignment(org.id, input);
  }

  async unassignCourse(input: AssignCourseInput): Promise<void> {
    const org = await this.requireOrg(input.authOrgId);
    await this.repo.deleteCourseAssignment(org.id, input.membershipId, input.courseId);
  }

  async assignedCourseIds(orgId: string, membershipId: string): Promise<string[]> {
    return this.repo.findAssignedCourseIds(orgId, membershipId);
  }
```

- [x] **Step 7: Re-export from index**

In `apps/api/src/core/organizations/index.ts`, add `CourseAssignment` to the `model.js` type export and `AssignCourseInput` to the `types.js` type export.

- [x] **Step 8: Run tests + typecheck**

Run: `pnpm vitest run apps/api/src/core/organizations/service.test.ts`
Expected: PASS.
Run: `pnpm typecheck`
Expected: Done.

- [x] **Step 9: Commit**

```bash
git add apps/api/src/core/organizations
git commit -m "feat(organizations): add course-assignment use cases for instructor scope"
```

---

### Task 4: DB schema — `course_assignments` table

**Files:**
- Modify: `apps/api/src/adapters/db/schema/organizations.ts`

**Interfaces:**
- Consumes: `organizations`, `memberships` tables (existing); `courses` table from `./courses.js`.
- Produces: `courseAssignments` Drizzle table with composite `(org_id, id)` PK, FKs to memberships and courses.

- [x] **Step 1: Add the table**

In `apps/api/src/adapters/db/schema/organizations.ts`, add `foreignKey` and `unique` to the `drizzle-orm/pg-core` import, import the courses table, and append the table:

```ts
import { pgTable, uuid, text, timestamp, primaryKey, foreignKey, unique } from "drizzle-orm/pg-core";
import { courses } from "./courses.js";
```

```ts
export const courseAssignments = pgTable(
  "course_assignments",
  {
    id: uuid("id").notNull().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    membershipId: uuid("membership_id").notNull(),
    courseId: uuid("course_id").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    uniqueAssignment: unique().on(t.orgId, t.membershipId, t.courseId),
    membershipFk: foreignKey({
      columns: [t.orgId, t.membershipId],
      foreignColumns: [memberships.orgId, memberships.id],
    }),
    courseFk: foreignKey({
      columns: [t.orgId, t.courseId],
      foreignColumns: [courses.orgId, courses.id],
    }),
  }),
);
```

The unique constraint on `(org_id, membership_id, course_id)` is what makes the repository's `onConflictDoNothing()` idempotent (Task 5).

- [x] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: Done. (The schema barrel `schema/index.ts` already re-exports `./organizations.js` via `export *`, so `courseAssignments` is exported automatically.)

- [x] **Step 3: Commit**

```bash
git add apps/api/src/adapters/db/schema/organizations.ts
git commit -m "feat(db): add course_assignments table"
```

---

### Task 5: Repository — course-assignment methods

**Files:**
- Modify: `apps/api/src/adapters/db/repositories/organizations.ts`

**Interfaces:**
- Consumes: `courseAssignments` table (Task 4); `CourseAssignment`, `AssignCourseInput` from core organizations. (`parseRole` import + membership role-narrowing were added in Task 2.)
- Produces: `DrizzleOrganizationsRepository` implements the three assignment methods.

- [x] **Step 1: Add imports**

In `apps/api/src/adapters/db/repositories/organizations.ts`, add `and` to the `drizzle-orm` import, add `courseAssignments` to the schema import, and import the assignment types (the `parseRole` import already exists from Task 2):

```ts
import { eq, and } from "drizzle-orm";
import { organizations, memberships, invitations, courseAssignments } from "../schema/organizations.js";
import type { CourseAssignment } from "../../../core/organizations/model.js";
import type { AssignCourseInput } from "../../../core/organizations/types.js";
```

- [x] **Step 2: Implement the assignment methods**

Append to `DrizzleOrganizationsRepository`:

```ts
  async insertCourseAssignment(orgId: string, input: AssignCourseInput): Promise<CourseAssignment> {
    const [row] = await this.db
      .insert(courseAssignments)
      .values({ orgId, membershipId: input.membershipId, courseId: input.courseId })
      .onConflictDoNothing()
      .returning();
    if (row) return row;
    const [existing] = await this.db
      .select()
      .from(courseAssignments)
      .where(
        and(
          eq(courseAssignments.orgId, orgId),
          eq(courseAssignments.membershipId, input.membershipId),
          eq(courseAssignments.courseId, input.courseId),
        ),
      )
      .limit(1);
    if (!existing) throw new Error("failed to insert course assignment");
    return existing;
  }

  async deleteCourseAssignment(orgId: string, membershipId: string, courseId: string): Promise<void> {
    await this.db
      .delete(courseAssignments)
      .where(
        and(
          eq(courseAssignments.orgId, orgId),
          eq(courseAssignments.membershipId, membershipId),
          eq(courseAssignments.courseId, courseId),
        ),
      );
  }

  async findAssignedCourseIds(orgId: string, membershipId: string): Promise<string[]> {
    const rows = await this.db
      .select({ courseId: courseAssignments.courseId })
      .from(courseAssignments)
      .where(and(eq(courseAssignments.orgId, orgId), eq(courseAssignments.membershipId, membershipId)));
    return rows.map((r) => r.courseId);
  }
```

- [x] **Step 3: Verify typecheck + lint**

Run: `pnpm typecheck`
Expected: Done.
Run: `pnpm lint`
Expected: exit 0 (adapter importing `core/organizations` public index is allowed).

- [x] **Step 4: Commit**

```bash
git add apps/api/src/adapters/db/repositories/organizations.ts
git commit -m "feat(db): implement course-assignment repository methods"
```

---

### Task 6: Better Auth custom roles (system of record)

**Files:**
- Create: `apps/api/src/adapters/auth/access.ts`
- Create: `apps/api/src/adapters/auth/access.test.ts`
- Modify: `apps/api/src/adapters/auth/index.ts`

**Interfaces:**
- Consumes: Better Auth `createAccessControl`, the org plugin's `defaultStatements`/`ownerAc`/`adminAc`.
- Produces: `ac` (AccessControl) and `roles` (`{ owner, admin, instructor, student }`) for the organization plugin; `creatorRole: "owner"`.

- [x] **Step 1: Write the access-control config**

```ts
// apps/api/src/adapters/auth/access.ts
// Better Auth org-plugin access control. Better Auth is the system of record for
// roles; these four roles mirror the domain Role union (core/organizations/roles).
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, ownerAc, adminAc } from "better-auth/plugins/organization/access";

export const statement = {
  ...defaultStatements,
  course: ["create", "read", "update", "delete", "grade"],
  progress: ["view"],
} as const;

const ac = createAccessControl(statement);

export const roles = {
  owner: ac.newRole({
    ...ownerAc.statements,
    course: ["create", "read", "update", "delete", "grade"],
    progress: ["view"],
  }),
  admin: ac.newRole({
    ...adminAc.statements,
    course: ["create", "read", "update", "delete", "grade"],
    progress: ["view"],
  }),
  instructor: ac.newRole({
    course: ["read", "update", "grade"],
    progress: ["view"],
  }),
  student: ac.newRole({
    course: ["read"],
  }),
};

export { ac };
```

- [x] **Step 2: Write a smoke test**

```ts
// apps/api/src/adapters/auth/access.test.ts
import { describe, it, expect } from "vitest";
import { roles } from "./access.js";

describe("auth access control", () => {
  it("defines exactly the four domain roles", () => {
    expect(Object.keys(roles).sort()).toEqual(["admin", "instructor", "owner", "student"]);
  });
});
```

- [x] **Step 3: Run the smoke test**

Run: `pnpm vitest run apps/api/src/adapters/auth/access.test.ts`
Expected: PASS.

- [x] **Step 4: Wire the roles into the organization plugin**

In `apps/api/src/adapters/auth/index.ts`:

Add the import near the other imports:
```ts
import { ac, roles } from "./access.js";
```

In the `organization({ ... })` plugin call, add these options alongside `organizationHooks` (as sibling keys of the object passed to `organization(...)`):
```ts
        ac,
        roles,
        creatorRole: "owner",
```

- [x] **Step 5: Verify typecheck, lint, full test run**

Run: `pnpm typecheck`
Expected: Done.
Run: `pnpm lint`
Expected: exit 0.
Run: `pnpm test`
Expected: all suites pass (identity, organizations, roles, access; web App test skipped/passes).

- [x] **Step 6: Commit**

```bash
git add apps/api/src/adapters/auth
git commit -m "feat(auth): configure org plugin with owner/admin/instructor/student roles"
```

---

## Self-Review

**Spec coverage** (`docs/domain/organizations.md`):
- Structured roles `owner|admin|instructor|student`, code-defined, stored as text → Task 1 (`roles.ts`) + Task 2 (membership typed) + Task 5 (text column narrowed via `parseRole`). ✓
- Permission matrix in code → Task 1 (`MATRIX`, `capability`, `canForCourse`). ✓
- Course assignment for instructor scope → Task 3 (use cases) + Task 4 (table) + Task 5 (repo). ✓
- Better Auth org plugin as system of record for roles → Task 6 (`ac`/`roles`/`creatorRole`). ✓

**Placeholder scan:** No TBD/TODO; every code step contains full code. ✓

**Type consistency:** `Role`, `parseRole`, `capability`, `canForCourse` (Task 1) used unchanged in Tasks 2/5. `CourseAssignment`/`AssignCourseInput` defined in Task 3, consumed in Tasks 4/5 with matching shapes. Repository method names (`insertCourseAssignment`, `deleteCourseAssignment`, `findAssignedCourseIds`) identical across ports (Task 3) and impl (Task 5). ✓

## Remaining slices (separate plans, written when reached)

2. **courses** — Course → Module → Item(slot = Lesson | assessment-ref); lesson `content` jsonb discriminated union; completion/drip/unlock rules.
3. **progress** — completion records, derived %, resume point; consumes assessment events.
4. **assessment** — quiz/assignment/attempt/submission/grade; emits outcome events.
5. **entitlements + gating** — grant-only `enroll()`, access checks, access-resolution composing entitlement + course rules + progress.
6. **HTTP routes** per context.

(Offers + billing deferred.)
