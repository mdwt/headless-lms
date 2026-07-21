# Learn API (backend) Implementation Plan — Phase 1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an entitlement-scoped `Learn` read API — three routes returning the courses a logged-in student is enrolled in and their content — so `apps/student` can render real course data.

**Architecture:** New `reporting/learn` read layer composes the existing `content` domain service (Course/Module mapping, counts) with a thin Drizzle "which published courses is this student actively enrolled in" repo. Routes resolve the session user → domain student via `identity.getStudentByExternalId`, never through org scope. Reuses the existing `Course`/`Module` contract schemas, so the wire shape (and the Plate `settings.content` blob) is identical to the back-office API.

**Tech Stack:** TypeScript (ESM, strict), Fastify 5 + `fastify-type-provider-zod`, Zod 4, Drizzle (node-postgres), Vitest, `@hey-api/openapi-ts` (SDK gen).

## Global Constraints

- Node 22, ESM, strict TypeScript. Relative imports end in `.js`.
- Import boundaries (ESLint): `reporting/` may import `core/<ctx>/index.ts` and be imported by `composition/` + `http/`; it may not import `adapters/`. `adapters/` may import `core`/`reporting` ports only. `http/` uses `composition`/`core`/`reporting`. Run `pnpm lint` after cross-layer changes.
- Domain entity types are owned by `@headless-lms/types`; contexts re-export, never re-declare. The `Learn` contract reuses existing `@headless-lms/api-contract` schemas (`Course`, `Module`).
- `openapi.json` and `packages/sdk/src/generated/` are committed; regenerate with `pnpm gen:sdk` (DB must be up) and commit the diff.
- No AI-attribution trailers in commits.
- Per-workspace commands: `pnpm --filter @headless-lms/server <script>`. Single test: `pnpm --filter @headless-lms/server vitest run <path>`.

---

### Task 1: `Learn` contract schemas

**Files:**
- Create: `packages/api-contract/src/learn.ts`
- Modify: `packages/api-contract/src/index.ts` (add `export * from "./learn.js";`)

**Interfaces:**
- Consumes: `Course` (from `./content.js`), `Module` (from `./activities.js`).
- Produces: `LearnCourses` (`z.array(Course)`), `LearnCourseIdParam` (`{ courseId }`), `LearnModules` (`z.array(Module)`).

- [ ] **Step 1: Write `learn.ts`**

```ts
// Learn resource schemas — the student-facing read surface. Reuses the Course
// and Module payloads (identical wire shape to the back-office API, including
// the opaque activity `settings` blob) so one renderer path serves both.
import { z } from "zod";
import { Course } from "./content.js";
import { Module } from "./activities.js";

/** Courses the authenticated student is actively enrolled in (published only). */
export const LearnCourses = z.array(Course);
export type LearnCourses = z.infer<typeof LearnCourses>;

/** One enrolled course's module→activity tree (published activities only). */
export const LearnModules = z.array(Module);
export type LearnModules = z.infer<typeof LearnModules>;

export const LearnCourseIdParam = z.object({ courseId: z.string() });
export type LearnCourseIdParam = z.infer<typeof LearnCourseIdParam>;
```

- [ ] **Step 2: Export from `index.ts`** — add after `export * from "./activities.js";`:

```ts
export * from "./learn.js";
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @headless-lms/api-contract typecheck`
Expected: PASS (no errors)

- [ ] **Step 4: Commit**

```bash
git add packages/api-contract/src/learn.ts packages/api-contract/src/index.ts
git commit -m "feat(api-contract): Learn resource schemas"
```

---

### Task 2: `reporting/learn` read service (model, ports, service, index) + unit tests

**Files:**
- Create: `packages/server/src/reporting/learn/model.ts`
- Create: `packages/server/src/reporting/learn/ports.ts`
- Create: `packages/server/src/reporting/learn/service.ts`
- Create: `packages/server/src/reporting/learn/index.ts`
- Test: `packages/server/src/reporting/learn/service.test.ts`

**Interfaces:**
- Consumes: `ContentService`, `Course`, `Module` from `../../core/content/index.js`.
- Produces:
  - `CourseRef = { orgId: string; courseId: string }`
  - `LearnEnrollmentReader` — `activeRefs(studentId): Promise<CourseRef[]>`, `activeRef(studentId, courseId): Promise<CourseRef | null>`
  - `LearnReportService` — `listCourses(studentId): Promise<Course[]>`, `getCourse(studentId, courseId): Promise<Course | null>`, `listModules(studentId, courseId): Promise<Module[] | null>`
  - `LearnReportServiceImpl` (constructor `(reader: LearnEnrollmentReader, content: ContentService)`)

- [ ] **Step 1: Write `model.ts`**

```ts
// reporting/learn — read model. Reuses the content domain's Course/Module
// entities (identical wire shape); adds the enrollment reference the service
// resolves against the content service.
export type { Course, Module } from "../../core/content/index.js";

/** An active-enrollment pointer: the org + course a student may consume. */
export interface CourseRef {
  orgId: string;
  courseId: string;
}
```

- [ ] **Step 2: Write `ports.ts`**

```ts
// reporting/learn — ports.
import type { Course, Module, CourseRef } from "./model.js";

/** Inbound: the student-scoped read use-cases. `null` ⇒ not enrolled (→ 404). */
export interface LearnReportService {
  listCourses(studentId: string): Promise<Course[]>;
  getCourse(studentId: string, courseId: string): Promise<Course | null>;
  listModules(studentId: string, courseId: string): Promise<Module[] | null>;
}

/**
 * Outbound: the student's active, non-expired enrollments in PUBLISHED courses.
 * Implemented by a Drizzle read repo; the service resolves each ref against the
 * content service for the full Course/Module payload.
 */
export interface LearnEnrollmentReader {
  activeRefs(studentId: string): Promise<CourseRef[]>;
  activeRef(studentId: string, courseId: string): Promise<CourseRef | null>;
}
```

- [ ] **Step 3: Write `service.ts`**

```ts
// reporting/learn — service implementation. Composes the enrollment reader
// (which published courses the student is actively enrolled in) with the content
// service (the Course/Module payload). Activities are filtered to published;
// `settings.published === false` is the only draft signal (missing ⇒ published).
import type { ContentService } from "../../core/content/index.js";
import type { Course, Module } from "./model.js";
import type { LearnEnrollmentReader, LearnReportService } from "./ports.js";

function isActivityPublished(settings: unknown): boolean {
  return (settings as { published?: boolean } | null)?.published !== false;
}

export class LearnReportServiceImpl implements LearnReportService {
  constructor(
    private readonly reader: LearnEnrollmentReader,
    private readonly content: ContentService,
  ) {}

  async listCourses(studentId: string): Promise<Course[]> {
    const refs = await this.reader.activeRefs(studentId);
    const courses = await Promise.all(
      refs.map((ref) => this.content.get(ref.orgId, ref.courseId)),
    );
    return courses.filter((c): c is Course => c !== null && c.status === "published");
  }

  async getCourse(studentId: string, courseId: string): Promise<Course | null> {
    const ref = await this.reader.activeRef(studentId, courseId);
    if (!ref) return null;
    const course = await this.content.get(ref.orgId, courseId);
    return course && course.status === "published" ? course : null;
  }

  async listModules(studentId: string, courseId: string): Promise<Module[] | null> {
    const ref = await this.reader.activeRef(studentId, courseId);
    if (!ref) return null;
    const modules = await this.content.listForCourse(ref.orgId, courseId);
    return modules.map((m) => ({
      ...m,
      activities: m.activities.filter((a) => isActivityPublished(a.settings)),
    }));
  }
}
```

- [ ] **Step 4: Write `index.ts`**

```ts
// reporting/learn — public surface.
export { LearnReportServiceImpl } from "./service.js";
export type { LearnReportService, LearnEnrollmentReader } from "./ports.js";
export type { Course, Module, CourseRef } from "./model.js";
```

- [ ] **Step 5: Write `service.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { LearnReportServiceImpl } from "./service.js";
import type { LearnEnrollmentReader, CourseRef } from "./index.js";
import type { ContentService, Course, Module } from "../../core/content/index.js";

function course(id: string, status: "draft" | "published" = "published"): Course {
  return {
    id, title: `C ${id}`, slug: id, description: "", status, category: "",
    moduleCount: 0, activityCount: 0, enrolledCount: 0,
    updatedAt: "2026-01-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function fakeReader(refs: CourseRef[]): LearnEnrollmentReader {
  return {
    activeRefs: async () => refs,
    activeRef: async (_s, courseId) => refs.find((r) => r.courseId === courseId) ?? null,
  };
}

// Minimal ContentService fake: only get() and listForCourse() are exercised.
function fakeContent(
  courses: Record<string, Course>,
  modules: Record<string, Module[]>,
): ContentService {
  return {
    get: async (_org, id) => courses[id] ?? null,
    listForCourse: async (_org, courseId) => modules[courseId] ?? [],
  } as unknown as ContentService;
}

describe("LearnReportServiceImpl", () => {
  it("lists only published courses the student is enrolled in", async () => {
    const svc = new LearnReportServiceImpl(
      fakeReader([
        { orgId: "o1", courseId: "c1" },
        { orgId: "o1", courseId: "c2" },
      ]),
      fakeContent({ c1: course("c1", "published"), c2: course("c2", "draft") }, {}),
    );
    const rows = await svc.listCourses("stu_1");
    expect(rows.map((c) => c.id)).toEqual(["c1"]);
  });

  it("returns null for a course the student is not enrolled in", async () => {
    const svc = new LearnReportServiceImpl(
      fakeReader([{ orgId: "o1", courseId: "c1" }]),
      fakeContent({ c1: course("c1") }, {}),
    );
    expect(await svc.getCourse("stu_1", "cX")).toBeNull();
    expect(await svc.listModules("stu_1", "cX")).toBeNull();
  });

  it("filters unpublished activities out of the module tree", async () => {
    const modules: Module[] = [
      {
        id: "m1", courseId: "c1", title: "M1", seq: 0,
        activities: [
          { id: "a1", moduleId: "m1", seq: 0, settings: { published: true }, assetIds: [] },
          { id: "a2", moduleId: "m1", seq: 1, settings: { published: false }, assetIds: [] },
          { id: "a3", moduleId: "m1", seq: 2, settings: { title: "no flag" }, assetIds: [] },
        ],
      },
    ];
    const svc = new LearnReportServiceImpl(
      fakeReader([{ orgId: "o1", courseId: "c1" }]),
      fakeContent({ c1: course("c1") }, { c1: modules }),
    );
    const result = await svc.listModules("stu_1", "c1");
    expect(result?.[0].activities.map((a) => a.id)).toEqual(["a1", "a3"]);
  });
});
```

- [ ] **Step 6: Run tests — verify they pass**

Run: `pnpm --filter @headless-lms/server vitest run src/reporting/learn/service.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/reporting/learn
git commit -m "feat(server): reporting/learn read service"
```

---

### Task 3: Drizzle enrollment-reader repo

**Files:**
- Create: `packages/server/src/adapters/db/repositories/learn.ts`

**Interfaces:**
- Consumes: `LearnEnrollmentReader`, `CourseRef` from `../../../reporting/learn/index.js`; `enrollments`, `courses` from `../schema/index.js`.
- Produces: `DrizzleLearnRepository` (constructor `(db: NodePgDatabase)`).

- [ ] **Step 1: Write `learn.ts`**

```ts
// learn — Drizzle read repo (implements the reporting/learn outbound port).
// Returns the (org, course) refs a student is ACTIVELY enrolled in and whose
// course is PUBLISHED. "Active" excludes revoked and expired grants (expiry is
// derived from expires_at at read time — no row flip). Not org-scoped: a
// student's grants may span orgs, so the enrollment row supplies the orgId.
import { and, eq, gt, isNull, or, sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { LearnEnrollmentReader, CourseRef } from "../../../reporting/learn/index.js";
import { enrollments, courses } from "../schema/index.js";

export class DrizzleLearnRepository implements LearnEnrollmentReader {
  constructor(private readonly db: NodePgDatabase) {}

  private baseFilters(studentId: string): SQL {
    return and(
      eq(enrollments.studentId, studentId),
      eq(enrollments.status, "active"),
      or(isNull(enrollments.expiresAt), gt(enrollments.expiresAt, sql`now()`))!,
      eq(courses.status, "published"),
    )!;
  }

  async activeRefs(studentId: string): Promise<CourseRef[]> {
    const rows = await this.db
      .select({ orgId: enrollments.orgId, courseId: enrollments.courseId })
      .from(enrollments)
      .innerJoin(courses, and(eq(courses.orgId, enrollments.orgId), eq(courses.id, enrollments.courseId)))
      .where(this.baseFilters(studentId));
    return rows;
  }

  async activeRef(studentId: string, courseId: string): Promise<CourseRef | null> {
    const [row] = await this.db
      .select({ orgId: enrollments.orgId, courseId: enrollments.courseId })
      .from(enrollments)
      .innerJoin(courses, and(eq(courses.orgId, enrollments.orgId), eq(courses.id, enrollments.courseId)))
      .where(and(this.baseFilters(studentId), eq(enrollments.courseId, courseId)))
      .limit(1);
    return row ?? null;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @headless-lms/server typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/adapters/db/repositories/learn.ts
git commit -m "feat(server): Drizzle learn enrollment-reader repo"
```

---

### Task 4: Student scope resolver + error mapping

**Files:**
- Create: `packages/server/src/http/student-scope.ts`
- Modify: `packages/server/src/http/plugins/error-handler.ts`
- Test: `packages/server/src/http/student-scope.test.ts`

**Interfaces:**
- Consumes: `Container` from `../composition/container.js`; `FastifyRequest`.
- Produces: `resolveStudentScope(container, req): Promise<{ studentId: string }>`, `NotAStudentError`.

- [ ] **Step 1: Write `student-scope.ts`**

```ts
// Resolves a request's session into the domain student id the learn read layer
// expects. Unlike `resolveScope`, it requires NO active org — a student is a
// global identity, not an org member. `req.authUser` is set by `requireSession`.
import type { FastifyRequest } from "fastify";
import type { Container } from "../composition/container.js";

export interface StudentScope {
  /** Domain `students.id` for the session's user. */
  studentId: string;
}

/** Thrown when the session's user is not a provisioned student. Mapped to 403. */
export class NotAStudentError extends Error {}

export async function resolveStudentScope(
  container: Container,
  req: FastifyRequest,
): Promise<StudentScope> {
  const authUser = req.authUser;
  if (!authUser) throw new NotAStudentError("no authenticated user");
  const student = await container.identity.getStudentByExternalId(authUser.id);
  if (!student) throw new NotAStudentError("no student for the current user");
  return { studentId: student.id };
}
```

- [ ] **Step 2: Add a `NotAStudentError` branch to `error-handler.ts`** — import it and add the branch next to `NoActiveOrgError`:

Add import:
```ts
import { NotAStudentError } from "../student-scope.js";
```
Add branch (immediately after the `NoActiveOrgError` block):
```ts
    if (error instanceof NotAStudentError) {
      return reply.status(403).send({ error: "forbidden", message: error.message });
    }
```

- [ ] **Step 3: Write `student-scope.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { resolveStudentScope, NotAStudentError } from "./student-scope.js";
import type { Container } from "../composition/container.js";
import type { FastifyRequest } from "fastify";

function container(student: { id: string } | null): Container {
  return {
    identity: { getStudentByExternalId: async () => student },
  } as unknown as Container;
}

const req = (authUser: unknown) => ({ authUser }) as unknown as FastifyRequest;

describe("resolveStudentScope", () => {
  it("resolves the domain student id from the session user", async () => {
    const scope = await resolveStudentScope(container({ id: "stu_1" }), req({ id: "ext_1" }));
    expect(scope.studentId).toBe("stu_1");
  });

  it("throws NotAStudentError when there is no session user", async () => {
    await expect(resolveStudentScope(container(null), req(undefined))).rejects.toBeInstanceOf(
      NotAStudentError,
    );
  });

  it("throws NotAStudentError when the user is not a student", async () => {
    await expect(resolveStudentScope(container(null), req({ id: "ext_x" }))).rejects.toBeInstanceOf(
      NotAStudentError,
    );
  });
});
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @headless-lms/server vitest run src/http/student-scope.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/http/student-scope.ts packages/server/src/http/student-scope.test.ts packages/server/src/http/plugins/error-handler.ts
git commit -m "feat(server): student scope resolver + 403 mapping"
```

---

### Task 5: `Learn` routes + registration

**Files:**
- Create: `packages/server/src/http/routes/learn.ts`
- Modify: `packages/server/src/http/routes.ts` (import + register inside the session-guarded plugin)

**Interfaces:**
- Consumes: `container.reporting.learn` (added in Task 6 — the handler references it; Task 6 makes it exist), `resolveStudentScope`, contract schemas `LearnCourses`/`LearnModules`/`LearnCourseIdParam`/`Course`/`ErrorBody`.
- Produces: `learnRoutes(app, container)`.

- [ ] **Step 1: Write `learn.ts`**

```ts
// HTTP routes for the student-facing Learn surface (read-only; served by the
// reporting layer). Session-guarded like every back-office route, but scoped by
// the student's enrollments via `resolveStudentScope` — never by org.
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  Course,
  ErrorBody,
  LearnCourseIdParam,
  LearnCourses,
  LearnModules,
} from "@headless-lms/api-contract";
import type { Container } from "../../composition/container.js";
import { resolveStudentScope } from "../student-scope.js";

export async function learnRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const learn = container.reporting.learn;

  r.route({
    method: "GET",
    url: "/api/learn/courses",
    preHandler: app.requireSession,
    schema: {
      operationId: "listLearnCourses",
      tags: ["Learn"],
      summary: "List the student's enrolled courses",
      response: { 200: LearnCourses },
    },
    handler: async (req) => {
      const scope = await resolveStudentScope(container, req);
      return learn.listCourses(scope.studentId);
    },
  });

  r.route({
    method: "GET",
    url: "/api/learn/courses/:courseId",
    preHandler: app.requireSession,
    schema: {
      operationId: "getLearnCourse",
      tags: ["Learn"],
      summary: "Get one enrolled course",
      params: LearnCourseIdParam,
      response: { 200: Course, 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveStudentScope(container, req);
      const course = await learn.getCourse(scope.studentId, req.params.courseId);
      if (!course)
        return reply.code(404).send({ error: "not_found", message: "Course not found" });
      return course;
    },
  });

  r.route({
    method: "GET",
    url: "/api/learn/courses/:courseId/modules",
    preHandler: app.requireSession,
    schema: {
      operationId: "listLearnModules",
      tags: ["Learn"],
      summary: "List an enrolled course's module/activity tree",
      params: LearnCourseIdParam,
      response: { 200: LearnModules, 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveStudentScope(container, req);
      const modules = await learn.listModules(scope.studentId, req.params.courseId);
      if (!modules)
        return reply.code(404).send({ error: "not_found", message: "Course not found" });
      return modules;
    },
  });
}
```

- [ ] **Step 2: Register in `routes.ts`** — add the import next to the others:

```ts
import { learnRoutes } from "./routes/learn.js";
```
and register it inside the session-guarded `app.register(async (instance) => { ... })` block, after `await coursesRoutes(instance, container);`:

```ts
    await learnRoutes(instance, container);
```

- [ ] **Step 3: Typecheck** (will still error until Task 6 adds `reporting.learn` — expected)

Run: `pnpm --filter @headless-lms/server typecheck`
Expected: FAIL — `Property 'learn' does not exist on type '{ students: ...; dashboard: ...; }'`. Proceed to Task 6.

- [ ] **Step 4: Commit** (with Task 6, since typecheck only passes together)

Defer commit to Task 6.

---

### Task 6: Wire `reporting.learn` into the container

**Files:**
- Modify: `packages/server/src/composition/container.ts`

**Interfaces:**
- Consumes: `LearnReportServiceImpl` (Task 2), `DrizzleLearnRepository` (Task 3), the already-constructed `content` service.
- Produces: `container.reporting.learn: LearnReportServiceImpl`.

- [ ] **Step 1: Add imports** next to the existing reporting imports:

```ts
import { LearnReportServiceImpl } from "../reporting/learn/index.js";
```
and next to the repo imports:
```ts
import { DrizzleLearnRepository } from "../adapters/db/repositories/learn.js";
```

- [ ] **Step 2: Add to the `Container` interface** — extend the `reporting` block:

```ts
  reporting: {
    students: StudentsReportServiceImpl;
    dashboard: DashboardReportServiceImpl;
    learn: LearnReportServiceImpl;
  };
```

- [ ] **Step 3: Construct it** — extend the `reporting` object (`content` is already in scope above it):

```ts
  const reporting = {
    students: new StudentsReportServiceImpl(new DrizzleStudentsRepository(db)),
    dashboard: new DashboardReportServiceImpl(new DrizzleDashboardRepository(db)),
    learn: new LearnReportServiceImpl(new DrizzleLearnRepository(db), content),
  };
```

- [ ] **Step 4: Typecheck (whole server) + lint**

Run: `pnpm --filter @headless-lms/server typecheck && pnpm --filter @headless-lms/server lint`
Expected: PASS (Task 5's routes now resolve `reporting.learn`)

- [ ] **Step 5: Run the server test suite**

Run: `pnpm --filter @headless-lms/server test`
Expected: PASS (new learn tests included; existing tests unaffected)

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/http/routes/learn.ts packages/server/src/http/routes.ts packages/server/src/composition/container.ts
git commit -m "feat(server): Learn routes + container wiring"
```

---

### Task 7: Regenerate the SDK

**Files:**
- Modify (generated): `packages/sdk/openapi.json`, `packages/sdk/src/generated/**`

**Interfaces:**
- Produces: `Learn` SDK class — `Learn.listLearnCourses()`, `Learn.getLearnCourse({ path: { courseId } })`, `Learn.listLearnModules({ path: { courseId } })`.

- [ ] **Step 1: Regenerate** (DB must be up — it is: `headless-lms-postgres` healthy)

Run: `pnpm gen:sdk`
Expected: writes `packages/sdk/openapi.json` + regenerates `packages/sdk/src/generated`; a new `Learn` class appears.

- [ ] **Step 2: Verify the `Learn` class exists**

Run: `grep -n "class Learn" packages/sdk/src/generated/sdk.gen.ts`
Expected: a match for `export class Learn`.

- [ ] **Step 3: Typecheck the SDK**

Run: `pnpm --filter @headless-lms/sdk typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/openapi.json packages/sdk/src/generated
git commit -m "chore(sdk): regenerate with Learn resource"
```

---

## Self-Review

- **Spec coverage (Part 1 of the design):** contract (Task 1), `reporting/learn` + read repo (Tasks 2–3), `resolveStudentScope` (Task 4), three `/api/learn/*` routes registered in the session plugin (Task 5), container wiring (Task 6), `gen:sdk` → `Learn` class (Task 7). The dormant `consume_content` capability is satisfied structurally by the entitlement-scoped reader; no matrix edit is required for reads.
- **Placeholder scan:** none — every step has concrete code/commands.
- **Type consistency:** `LearnEnrollmentReader.activeRefs/activeRef` return `CourseRef`; the service consumes them and calls `ContentService.get`/`listForCourse` (verified signatures: `get(orgId, id)`, `listForCourse(orgId, courseId)`). `getStudentByExternalId(externalId)` returns `Student` with `.id`. Contract reuses `Course`/`Module` from `content.js`/`activities.js`. Route `operationId`s (`listLearnCourses`, `getLearnCourse`, `listLearnModules`) are what drive the generated SDK method names in Task 7.

## Follow-on phases (separate plans, after this lands)

Phases 2–4 from the spec depend on this phase's generated SDK for exact `Learn.*` signatures, so they are planned after Task 7:
- **Phase 2** — seed a deterministic, loginable student with enrollments in published courses that have Plate content.
- **Phase 3** — `apps/student` better-auth login + server-session.
- **Phase 4** — `apps/student` server-side `Learn.*` reads, view-model adapter, Renderer-only content, styling/token wiring.
