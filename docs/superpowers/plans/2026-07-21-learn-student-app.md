# Student App Implementation Plan — Phases 2–4

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make a real student log into `apps/student` and see their enrolled published courses rendered via the Plate `Renderer`, backed by the Phase-1 `Learn` API.

**Architecture:** Seed a deterministic, loginable student with a published course whose activities carry real Plate `settings.content` (Phase 2). Mirror admin's cross-origin shared-cookie auth into `apps/student`, trimmed of org/role (Phase 3). Replace the mock data layer with server-side `Learn.*` SDK reads, adapt the wire shape to the existing view-model, and render activity content through the RSC-safe `Renderer` (Phase 4).

**Tech Stack:** Next.js 16 (App Router, RSC), `better-auth ^1.6` client, `@headless-lms/sdk` (`Learn` resource), `@headless-lms/content-plate` (`Renderer`), Tailwind v4, Drizzle (seed).

## Global Constraints

- Node 22, ESM, strict TS. Relative server imports end in `.js`.
- Phase-1 SDK is live: `Learn.listLearnCourses(opts?)` → `ListLearnCoursesResponse` (`Course[]`); `Learn.getLearnCourse({ path: { courseId }, ...headers })` → `GetLearnCourseResponse` (`Course`); `Learn.listLearnModules({ path: { courseId }, ...headers })` → `ListLearnModulesResponse` (`Module[]`). All are `RequestResult` (awaitable `{ data, error }`), non-throwing by default.
- Course routes are session-guarded; the student app forwards the better-auth session cookie on every server-side read (mirror admin's `authHeaders()`).
- No AI-attribution trailers in commits. DB is up (`headless-lms-postgres`).
- `apps/student` runs on `:8002`; `apps/api` on `:8000`; admin on `:8001`.

---

## Phase 2 — Seed a loginable dev student

Existing seeded students have random externalIds and **no better-auth account** (unloginable), and seeded activities carry **no Plate `content` blob**. This phase adds one deterministic, idempotent, loginable student wired to a published course with real Plate content.

### Task 2.1: `seedDevStudent` module

**Files:**
- Create: `packages/server/src/composition/seed-dev-student.ts`
- Modify: `packages/server/src/composition/seed.ts` (call it from `runSeed`; export `runSeedDevStudent`)
- Modify: `packages/server/src/index.ts` (export `runSeedDevStudent`)

**Interfaces:**
- Produces: `seedDevStudent(db): Promise<void>`, `runSeedDevStudent(databaseUrl): Promise<void>`.
- Consumes: `hashPassword` from `better-auth/crypto`; `user`, `account` from `../adapters/auth/schema.js`; `schema`, `createDb` from `./db.js`.

- [ ] **Step 1: Write `seed-dev-student.ts`**

```ts
/**
 * Seeds ONE deterministic, loginable student for dev/demo:
 *   email `student@example.com` / password `password123`.
 * Idempotent (fixed ids + onConflictDoNothing) so it can run repeatedly and
 * against an already-seeded DB without disturbing existing data. Wires the full
 * chain the Learn API needs: better-auth user+credential account → domain
 * student (externalId = the auth user id) → a PUBLISHED course whose activities
 * carry real Plate `settings.content` → an active enrollment.
 */
import { hashPassword } from "better-auth/crypto";
import { createDb, schema } from "./db.js";
import { user, account } from "../adapters/auth/schema.js";

const AUTH_USER_ID = "usr_dev_student";
const STUDENT_EMAIL = "student@example.com";
const STUDENT_PASSWORD = "password123";
const ORG_ID = "org_dev_academy";
const OWNER_USER_ID = "usr_dev_owner";
const COURSE_ID = "crs_dev_welcome";

// A small Plate value the RSC Renderer can display (nodes the BaseEditorKit
// renders: h1/h2, paragraphs with marks, blockquote).
function plate(nodes: unknown[]) {
  return { type: "plate", version: 1, config: nodes };
}

const lessonOne = plate([
  { type: "h1", children: [{ text: "Welcome to Atelier" }] },
  {
    type: "p",
    children: [
      { text: "This lesson is rendered from real course data by the " },
      { text: "Plate renderer", bold: true },
      { text: "." },
    ],
  },
  { type: "h2", children: [{ text: "What you'll learn" }] },
  {
    type: "p",
    children: [{ text: "How the student player pulls content from the Learn API and renders it." }],
  },
  {
    type: "blockquote",
    children: [{ text: "Seeing is a decision — a small act of refusal against the familiar." }],
  },
]);

const lessonTwo = plate([
  { type: "h1", children: [{ text: "The Second Lesson" }] },
  {
    type: "p",
    children: [
      { text: "Content here is the activity's " },
      { text: "settings.content.config", italic: true },
      { text: " Plate value, guarded by type/version." },
    ],
  },
]);

export async function seedDevStudent(db: ReturnType<typeof createDb>): Promise<void> {
  const passwordHash = await hashPassword(STUDENT_PASSWORD);
  const now = new Date();

  await db.transaction(async (tx) => {
    // Org owner (domain staff user; needed only for organizations.ownerId).
    await tx
      .insert(schema.users)
      .values({
        id: OWNER_USER_ID,
        externalId: "ext_dev_owner",
        email: "dev-owner@example.com",
        displayName: "Dev Owner",
      })
      .onConflictDoNothing();

    await tx
      .insert(schema.organizations)
      .values({
        id: ORG_ID,
        externalId: "ext_org_dev_academy",
        name: "Dev Academy",
        slug: "dev-academy",
        ownerId: OWNER_USER_ID,
      })
      .onConflictDoNothing();

    // better-auth user + credential account (the login).
    await tx
      .insert(user)
      .values({
        id: AUTH_USER_ID,
        name: "Dev Student",
        email: STUDENT_EMAIL,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();
    await tx
      .insert(account)
      .values({
        id: "acc_dev_student",
        accountId: AUTH_USER_ID,
        providerId: "credential",
        userId: AUTH_USER_ID,
        password: passwordHash,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();

    // Domain student — externalId links the session user to this student.
    await tx
      .insert(schema.students)
      .values({
        id: "stu_dev_student",
        externalId: AUTH_USER_ID,
        email: STUDENT_EMAIL,
        firstName: "Dev",
        lastName: "Student",
      })
      .onConflictDoNothing();

    // Published course + modules + activities with real Plate content.
    await tx
      .insert(schema.courses)
      .values({
        orgId: ORG_ID,
        id: COURSE_ID,
        title: "Welcome to Atelier",
        slug: "welcome-to-atelier",
        description: "A demo course rendered from real data via the Learn API and Plate renderer.",
        status: "published",
        category: "Design",
      })
      .onConflictDoNothing();
    await tx
      .insert(schema.modules)
      .values({ orgId: ORG_ID, id: "mod_dev_1", courseId: COURSE_ID, title: "Getting Started", seq: 0 })
      .onConflictDoNothing();
    await tx
      .insert(schema.activities)
      .values([
        {
          orgId: ORG_ID,
          id: "act_dev_1",
          moduleId: "mod_dev_1",
          seq: 0,
          settings: { title: "Welcome", published: true, content: lessonOne },
        },
        {
          orgId: ORG_ID,
          id: "act_dev_2",
          moduleId: "mod_dev_1",
          seq: 1,
          settings: { title: "The Second Lesson", published: true, content: lessonTwo },
        },
      ])
      .onConflictDoNothing();

    // Active enrollment — what the Learn reader scopes to.
    await tx
      .insert(schema.enrollments)
      .values({
        orgId: ORG_ID,
        id: "enr_dev_student",
        studentId: "stu_dev_student",
        courseId: COURSE_ID,
        status: "active",
        source: "manual",
        expiresAt: null,
      })
      .onConflictDoNothing();
  });

  console.log(`Seeded dev student ${STUDENT_EMAIL} / ${STUDENT_PASSWORD} → course "${COURSE_ID}".`);
}

export async function runSeedDevStudent(databaseUrl: string): Promise<void> {
  if (!databaseUrl) throw new Error("DATABASE_URL is not set.");
  const db = createDb(databaseUrl);
  try {
    await seedDevStudent(db);
  } finally {
    await db.$client.end();
  }
}
```

- [ ] **Step 2: Call it from `runSeed`** — in `seed.ts`, add the import and invoke after `main`:

Add near the top imports:
```ts
import { seedDevStudent } from "./seed-dev-student.js";
```
Change `runSeed`'s `try` block body to run both (dev student in its own transaction, after the random graph):
```ts
  try {
    await main(db);
    await seedDevStudent(db);
  } finally {
    await db.$client.end();
  }
```
Re-export for standalone use — add at the end of `seed.ts`:
```ts
export { runSeedDevStudent } from "./seed-dev-student.js";
```

- [ ] **Step 3: Export from the server package index** — in `packages/server/src/index.ts`, add `runSeedDevStudent` next to the existing `runSeed` export (find the line exporting `runSeed` and add `runSeedDevStudent`). If `runSeed` is exported via `export * from "./composition/seed.js"`, the re-export in Step 2 already surfaces it — verify with `grep -n "runSeed" packages/server/src/index.ts` and only add if absent.

- [ ] **Step 4: Add a standalone `seed:dev` script** — `apps/api/package.json` scripts, next to `"seed"`:

```json
    "seed:dev": "tsx --env-file=../../.env scripts/seed-dev-student.ts",
```
Create `apps/api/scripts/seed-dev-student.ts`:
```ts
import { runSeedDevStudent } from "@headless-lms/server";

await runSeedDevStudent(process.env.DATABASE_URL ?? "");
console.log("Dev student seed complete.");
```

- [ ] **Step 5: Typecheck the server + build**

Run: `pnpm --filter @headless-lms/server typecheck && pnpm --filter @headless-lms/server build`
Expected: PASS

- [ ] **Step 6: Run the standalone dev-student seed against the live DB**

Run: `pnpm --filter @headless-lms/api seed:dev`
Expected: prints `Seeded dev student student@example.com / password123 → course "crs_dev_welcome".` then `Dev student seed complete.` Re-run once more — Expected: same output, no unique-constraint error (idempotent).

- [ ] **Step 7: Verify the login actually works against the running API**

Ensure the API is running (`pnpm --filter @headless-lms/api dev` in another shell, or check `:8000`). Then:
```bash
curl -sS -X POST http://localhost:8000/api/auth/sign-in/email \
  -H 'content-type: application/json' \
  -d '{"email":"student@example.com","password":"password123"}' -i | head -20
```
Expected: `HTTP/…  200`, a `set-cookie: better-auth.session_token=…`, and a JSON body with a `user`/`token`. A 401 means the password hash is wrong — stop and report.

- [ ] **Step 8: Verify the Learn API returns the course for this student**

Capture the cookie from Step 7 into `$COOKIE`, then:
```bash
curl -sS http://localhost:8000/api/learn/courses -H "cookie: $COOKIE" | head -c 400
```
Expected: a JSON array containing the `crs_dev_welcome` course (title "Welcome to Atelier", status "published").

- [ ] **Step 9: Commit**

```bash
git add packages/server/src/composition/seed-dev-student.ts packages/server/src/composition/seed.ts packages/server/src/index.ts apps/api/package.json apps/api/scripts/seed-dev-student.ts
git commit -m "feat(seed): deterministic loginable dev student with Plate-content course"
```

---

## Phase 3 — Student authentication (`apps/student`)

Mirror admin's cross-origin shared-cookie auth, trimmed of all org/role logic. Read the admin source files named below and adapt them; do NOT port org/role code.

### Task 3.1: deps + client + proxy

**Files:**
- Modify: `apps/student/package.json` (add `"better-auth": "^1.6.22"`, `"@headless-lms/sdk": "workspace:*"`, `"server-only": "^0.0.1"`)
- Modify: `apps/student/next.config.ts` (`transpilePackages: ["@headless-lms/sdk"]`)
- Create: `apps/student/src/lib/auth/client.ts`
- Create: `apps/student/src/proxy.ts`

- [ ] **Step 1: package.json + next.config** — add the deps above; set `next.config.ts`:
```ts
import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  transpilePackages: ["@headless-lms/sdk"],
};
export default nextConfig;
```
Run `pnpm install` from repo root.

- [ ] **Step 2: `client.ts`** (mirror `apps/admin/src/lib/auth/client.ts`, DROP `organizationClient`):
```ts
"use client";
import { createAuthClient } from "better-auth/react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const authClient = createAuthClient({ baseURL: API_URL });
export const { signIn, signOut, signUp, useSession } = authClient;
```

- [ ] **Step 3: `proxy.ts`** — copy `apps/admin/src/proxy.ts` verbatim (cookie-presence edge gate → redirect to `/login?next=…`; matcher excludes `login`, `_next/*`, `favicon.ico`, `api`). Read the admin file and reproduce it exactly.

- [ ] **Step 4: Typecheck** — `pnpm --filter student typecheck` (will pass once server-session/login exist in Task 3.2/3.3; if it complains about missing files, proceed).

### Task 3.2: server-session resolver

**Files:**
- Create: `apps/student/src/lib/auth/server-session.ts`

**Interfaces:**
- Produces: `getServerSession(): Promise<{ user: { id; name; email; image } } | null>`, `requireAuth(...pending): Promise<Session>`, `API_URL`.

- [ ] **Step 1: Write it** (mirror admin `server-session.ts`, KEEP only the get-session fetch; DROP role/org/status/member/full-org/list and `requireManager`):
```ts
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

export const API_URL =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface ServerSession {
  user: { id: string; name: string; email: string; image: string | null };
}

export const getServerSession = cache(async (): Promise<ServerSession | null> => {
  const cookie = (await cookies()).toString();
  if (!cookie) return null;
  const res = await fetch(`${API_URL}/api/auth/get-session`, {
    headers: { cookie },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    user?: { id: string; name: string; email: string; image?: string | null };
  };
  if (!data.user) return null;
  return {
    user: {
      id: data.user.id,
      name: data.user.name,
      email: data.user.email,
      image: data.user.image ?? null,
    },
  };
});

export async function requireAuth(...pending: Promise<unknown>[]): Promise<ServerSession> {
  const session = await getServerSession();
  if (!session) {
    await Promise.allSettled(pending);
    redirect("/login");
  }
  return session;
}
```

### Task 3.3: login page

**Files:**
- Create: `apps/student/src/app/login/page.tsx`
- Create: `apps/student/src/app/login/login-view.tsx`

- [ ] **Step 1: `page.tsx`** — Suspense wrapper (mirror admin), rendering `<LoginView />`.
- [ ] **Step 2: `login-view.tsx`** — `"use client"`; a sign-in form calling `await signIn.email({ email, password })` from `@/lib/auth/client`; on success `router.replace(next)` (guard `next` to in-app paths, default `/`); a `useSession()` effect that redirects if already authenticated. DROP admin's `SignUpForm` org step and the `?denied=1` banner. (Read admin's `login-view.tsx` for the exact form/markup and reproduce, trimmed. Reuse student's existing UI primitives under `src/components/ui`/`primitives` for inputs/buttons to match the app's look.)

- [ ] **Step 3: Gate the app** — in `apps/student/src/app/layout.tsx`, this stays as-is (it's the root layout with `AppProvider`). Add auth gating at the page level in Phase 4's RSC pages via `requireAuth()` (the dashboard and player pages already become RSC there). The `proxy.ts` cookie-presence check is the first-line gate; `requireAuth()` is the authoritative server check.

- [ ] **Step 4: Verify typecheck + build**

Run: `pnpm --filter student typecheck`
Expected: PASS (mock-data still present; Phase 4 removes it).

- [ ] **Step 5: Commit**

```bash
git add apps/student/package.json apps/student/next.config.ts apps/student/src/lib/auth apps/student/src/proxy.ts apps/student/src/app/login pnpm-lock.yaml
git commit -m "feat(student): better-auth login (cross-origin shared cookie)"
```

---

## Phase 4 — Student reads + rendering (`apps/student`)

Replace the mock data layer with server-side `Learn.*` reads, adapt to the existing view-model, and render activity content via the Plate `Renderer`. Content is **Renderer-only** (drop the per-type mock components).

### Task 4.1: SDK plumbing + editor config + styling

**Files:**
- Modify: `apps/student/package.json` (add `"@headless-lms/content-plate": "workspace:*"`, `"@headless-lms/editor-contract": "workspace:*"`) and `next.config.ts` `transpilePackages` (add both + content-plate)
- Modify: `apps/student/src/app/globals.css` (add the `@source` line)
- Create: `apps/student/src/editor.config.tsx`
- Create: `apps/student/src/lib/api/server-call.ts`
- Create: `apps/student/src/lib/api/server.ts`
- Create: `apps/student/src/lib/api/types.ts`

- [ ] **Step 1: deps + transpile** — `apps/student/package.json` deps add `@headless-lms/content-plate` + `@headless-lms/editor-contract` (workspace:*); `next.config.ts`:
```ts
  transpilePackages: ["@headless-lms/sdk", "@headless-lms/editor-contract", "@headless-lms/content-plate"],
```
`pnpm install`.

- [ ] **Step 2: globals.css `@source`** — after the two `@import` lines add:
```css
/* The content editor (@headless-lms/content-plate) ships Tailwind-styled TS
   source from the workspace; scan it so its utilities are generated. */
@source "../../../../plugins/content-plate/src";
```

- [ ] **Step 3: `editor.config.tsx`** (mirror admin):
```tsx
import type { EditorModule } from "@headless-lms/editor-contract";
import plateEditor from "@headless-lms/content-plate";
const editorModule: EditorModule = plateEditor;
export default editorModule;
```

- [ ] **Step 4: `server-call.ts`** (mirror admin's, minus the redirect-on-401 nicety):
```ts
import "server-only";
import { cookies } from "next/headers";
import { configureSdk } from "@headless-lms/sdk";

export const API_URL =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

let configured = false;
export function ensureConfigured(): void {
  if (configured) return;
  configureSdk({ baseUrl: API_URL });
  configured = true;
}

export async function authHeaders(): Promise<{ headers: { cookie: string } }> {
  return { headers: { cookie: (await cookies()).toString() } };
}
```

- [ ] **Step 5: `types.ts`** — re-export SDK types + the activity settings interpretation:
```ts
import type {
  GetLearnCourseResponse,
  ListLearnCoursesResponse,
  ListLearnModulesResponse,
} from "@headless-lms/sdk";

export type Course = GetLearnCourseResponse;
export type CourseSummary = ListLearnCoursesResponse[number];
export type Module = ListLearnModulesResponse[number];
export type Activity = Module["activities"][number];

/** The editor-agnostic content wrapper stored under `settings.content`. */
export interface ActivityContent {
  config: unknown;
  type: string;
  version?: number;
}
export interface ActivitySettings {
  title?: string;
  published?: boolean;
  content?: ActivityContent;
}
```

- [ ] **Step 6: `server.ts`** — the Learn read wrapper:
```ts
import "server-only";
import { Learn } from "@headless-lms/sdk";
import { unwrap } from "./shared.js"; // see Step 6a
import { ensureConfigured, authHeaders } from "./server-call.js";
import type { Course, CourseSummary, Module } from "./types.js";

export const learnApi = {
  async listCourses(): Promise<CourseSummary[]> {
    ensureConfigured();
    return unwrap(await Learn.listLearnCourses(await authHeaders()));
  },
  async getCourse(courseId: string): Promise<Course | null> {
    ensureConfigured();
    const res = await Learn.getLearnCourse({ path: { courseId }, ...(await authHeaders()) });
    if (res.error) {
      if ((res.response?.status ?? 0) === 404) return null;
      throw new Error(`getCourse failed: ${res.response?.status}`);
    }
    return res.data ?? null;
  },
  async listModules(courseId: string): Promise<Module[] | null> {
    ensureConfigured();
    const res = await Learn.listLearnModules({ path: { courseId }, ...(await authHeaders()) });
    if (res.error) {
      if ((res.response?.status ?? 0) === 404) return null;
      throw new Error(`listModules failed: ${res.response?.status}`);
    }
    return res.data ?? null;
  },
};
```
- [ ] **Step 6a: `shared.ts` unwrap helper**:
```ts
import type { RequestResult } from "@headless-lms/sdk";
export function unwrap<T>(result: Awaited<RequestResult<T, unknown, false>>): T {
  if (result.error) throw new Error(`API error: ${result.response?.status ?? "unknown"}`);
  return result.data as T;
}
```
(If `RequestResult` isn't exported from the SDK root, inline the shape: `{ data?: T; error?: unknown; response?: { status: number } }`. Verify with `grep -n "RequestResult" packages/sdk/src/generated/*.ts`.)

- [ ] **Step 7: Typecheck** — `pnpm --filter student typecheck` (mock-data still present; passes).

### Task 4.2: view-model adapter

**Files:**
- Create: `apps/student/src/lib/adapt.ts`
- Modify: `apps/student/src/lib/types.ts` (trim to what remains — remove `LessonType`, media/quiz/pdf `LessonContent` fields, `Enrollment` expiry; keep `Course`/`Module`/`Lesson`/`Completion`/`CoverTone` shapes the components use, with `Lesson.content` now `unknown` (the Plate config))

- [ ] **Step 1: Decide the trimmed view-model** — read `apps/student/src/lib/types.ts` and every component that imports from it (`components/dashboard/*`, `components/player/*`, `lib/progress.ts`, `lib/covers.ts`). Keep the fields those components actually read. Concretely: `Lesson` keeps `{ id, title, order }` and gains `content: ActivityContent | null`; drop `type`, `durationSeconds`, and the rich `LessonContent`. `Course` keeps `{ id, title, description, category, tone, modules }`; drop `instructor`, `thumbnail`. Remove `Enrollment`, `LessonType`, `QuizQuestion`, etc.

- [ ] **Step 2: Write `adapt.ts`** — maps Learn wire types → the view-model:
```ts
import type { CourseSummary, Course as WireCourse, Module as WireModule } from "./api/types.js";
import type { ActivitySettings } from "./api/types.js";
import type { Course, CoverTone, Lesson, Module } from "./types.js";

const TONES: CoverTone[] = ["indigo", "slate", "teal", "espresso", "plum", "ink"];

/** Deterministic cover tone from the course id (flat Course has no tone). */
export function toneOf(id: string): CoverTone {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}

export function adaptCourseSummary(c: CourseSummary): Omit<Course, "modules"> {
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    category: c.category,
    tone: toneOf(c.id),
  };
}

function adaptModule(m: WireModule): Module {
  return {
    id: m.id,
    title: m.title,
    order: m.seq,
    lessons: m.activities
      .filter((a) => (a.settings as ActivitySettings | null)?.published !== false)
      .map((a): Lesson => {
        const s = (a.settings ?? {}) as ActivitySettings;
        return {
          id: a.id,
          title: s.title?.trim() || "Untitled activity",
          order: a.seq,
          content: s.content ?? null,
        };
      }),
  };
}

export function adaptCourse(course: WireCourse, modules: WireModule[]): Course {
  return {
    id: course.id,
    title: course.title,
    description: course.description,
    category: course.category,
    tone: toneOf(course.id),
    modules: modules.map(adaptModule),
  };
}
```
(Adjust field names to match the trimmed `types.ts` from Step 1. `content` is `ActivityContent | null`.)

### Task 4.3: RSC reads + Renderer content

**Files:**
- Modify: `apps/student/src/app/page.tsx` (RSC: `requireAuth`, `learnApi.listCourses`, adapt, pass to `Dashboard`)
- Modify: `apps/student/src/app/courses/[courseId]/page.tsx` (RSC: `requireAuth`, `getCourse` + `listModules`, adapt, pass to player; `notFound()` when null)
- Modify: `apps/student/src/components/dashboard/dashboard.tsx` (accept `courses` prop instead of importing `mock-data`; drop `enrollments`/hero-from-enrollment; greeting name from a `studentName` prop)
- Modify: `apps/student/src/components/player/course-player.tsx` (accept `course` prop; remove media/quiz/pdf state; remove `expired`/enrollment gate)
- Rewrite: `apps/student/src/components/player/content/content-area.tsx` (render `<Renderer>` guarded by type/version)
- Delete: `apps/student/src/components/player/content/{video,audio,quiz,pdf,download,overview,text}.tsx`, `apps/student/src/components/player/expired-gate.tsx`, `apps/student/src/lib/mock-data.ts`
- Modify: `apps/student/src/lib/store.tsx` (`initialCompletion` → `{}`)

- [ ] **Step 1: `content-area.tsx`** — the Renderer, mirroring admin's preview guard:
```tsx
import editorModule from "@/editor.config";
import type { ActivityContent } from "@/lib/api/types";

export function ContentArea({ content }: { content: ActivityContent | null }) {
  const { Renderer, meta } = editorModule;
  if (content == null) {
    return <div className="mx-auto max-w-[720px] px-6 py-16 text-ink-3">No content yet.</div>;
  }
  if (content.type !== meta.type || content.version !== meta.version) {
    return (
      <div className="mx-auto max-w-[720px] px-6 py-16 text-ink-3">
        This content was saved in a format the player can’t display.
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-[760px] px-6 py-10">
      <Renderer config={content.config} />
    </div>
  );
}
```
(Match the surrounding layout/classes the player expects; read the current `content-area.tsx` first to preserve its wrapper props. The player passes `content={curLesson.content}`.)

- [ ] **Step 2: Rewire `course-player.tsx`** — take `course: Course` as a prop (no `getCourse`/`getEnrollment` import), delete the media timer, quiz, and pdf state + handlers and the expired-gate branch. Keep: sidebar, footer prev/next + mark-complete, header progress, sequential locking, auto-advance — all from local `store.tsx` completion. Pass the current lesson's `content` to `ContentArea`.

- [ ] **Step 3: Rewire `dashboard.tsx`** — take `courses: Course[]` and `studentName: string` props; drop `enrollments`/`mock-data` imports; compute in-progress/completed from local completion; drop the "this month" hours stat and the enrollment-based hero (or derive a simple "continue" from the first course with an incomplete lesson).

- [ ] **Step 4: RSC pages**:
```tsx
// app/page.tsx
import { requireAuth } from "@/lib/auth/server-session";
import { learnApi } from "@/lib/api/server";
import { adaptCourseSummary } from "@/lib/adapt";
import { Dashboard } from "@/components/dashboard/dashboard";

export default async function Page() {
  const coursesPromise = learnApi.listCourses();
  const session = await requireAuth(coursesPromise);
  const courses = (await coursesPromise).map(adaptCourseSummary);
  return <Dashboard courses={courses} studentName={session.user.name} />;
}
```
```tsx
// app/courses/[courseId]/page.tsx
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/server-session";
import { learnApi } from "@/lib/api/server";
import { adaptCourse } from "@/lib/adapt";
import { CoursePlayer } from "@/components/player/course-player";

export default async function CoursePlayerPage({
  params,
}: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  await requireAuth();
  const [course, modules] = await Promise.all([
    learnApi.getCourse(courseId),
    learnApi.listModules(courseId),
  ]);
  if (!course || !modules) notFound();
  return <CoursePlayer course={adaptCourse(course, modules)} />;
}
```
(The `Dashboard` cards link to `/courses/:id` unchanged. `Course` from `adaptCourseSummary` omits `modules`; give the dashboard `CourseSummaryVM` type or make `modules` optional in the dashboard's expected shape.)

- [ ] **Step 5: Delete mock + per-type components** — remove the files listed above; set `store.tsx` `initialCompletion` to `{}` and drop its `import { initialCompletion } from "./mock-data"`.

- [ ] **Step 6: Typecheck + lint + build**

Run: `pnpm --filter student typecheck && pnpm --filter student lint && pnpm --filter student build`
Expected: PASS. Fix any remaining references to deleted mock symbols (e.g. `format.ts` helpers that assumed duration).

- [ ] **Step 7: Manual end-to-end check** — with `apps/api` (:8000) and `apps/student` (:8002) running: open `http://localhost:8002`, get redirected to `/login`, sign in as `student@example.com` / `password123`, land on the dashboard showing "Welcome to Atelier", open it, and confirm the Plate content (the h1/paragraphs/blockquote) renders in the player.

- [ ] **Step 8: Commit**

```bash
git add apps/student
git commit -m "feat(student): render real course content via Learn API + Plate renderer"
```

## Self-Review

- **Spec coverage:** Phase 2 seeds the loginable student + Plate-content course (spec §4.2); Phase 3 mirrors admin auth minus org/role (spec Part 2); Phase 4 covers SDK plumbing, RSC reads, adapter, Renderer-only content, deletions, and the single `@source` styling change the token audit confirmed (spec Parts 3–4).
- **Placeholders:** none — each step has concrete code or an exact command. Where a step depends on reading an existing admin/student file (login markup, `content-area` wrapper), the instruction names the file and the trim/keep rules precisely.
- **Type consistency:** `learnApi.{listCourses,getCourse,listModules}` return `CourseSummary[]` / `Course | null` / `Module[] | null`; `adaptCourse(course, modules)` and `adaptCourseSummary(c)` consume exactly those; `ContentArea` consumes `ActivityContent | null` = `Lesson.content`. SDK method names match Phase 1's generated `Learn.listLearnCourses/getLearnCourse/listLearnModules`.

## Open verification points

- Confirm `RequestResult` / the SDK result shape (`{ data, error, response.status }`) — the generated client exposes `.response`; adjust `unwrap`/404 checks to the actual field names if they differ (`grep -n "response\|status" packages/sdk/src/generated/client/types.gen.ts`).
- Confirm `signUp`/`signIn` email endpoints are enabled without org (they are: `emailAndPassword.enabled = true`, org plugin is client-side only).
