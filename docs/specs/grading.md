# Grading — separation, removal, and deferred re-introduction

## TL;DR

"Grading" is a **distinct concern** from completion and from assessment outcome. It was woven in prematurely — a shallow in-memory `submissions` context + a role permission + an admin page — with **no real assessment domain behind it**. We are removing grading now and keeping only **completion** (progress) and **assessment outcome** for auto-scored quizzes. Grading returns later as a proper flow **inside the assessment context** (design captured below).

## The three concepts (the distinction that was missing)

| Concept | Owner context | Question it answers | Human in loop? |
|---|---|---|---|
| **Completion** | `progress` | Did the student finish this item? (+ derived %) | No |
| **Outcome** | `assessment` | Did they pass / what score — for **auto-scored** items (quizzes) | No |
| **Grading** | *(a workflow inside assessment, later)* | A human evaluates submitted work → produces score/feedback | **Yes** |

- **Completion and outcome move independently.** You can complete an item without "passing"; passing is an *outcome*, completion is a *fact*.
- **Grading is only the mechanism** by which a *human* produces an outcome for work that can't be auto-scored (an assignment). A quiz needs **no grading** — its outcome is computed. An assignment needs grading to *get* an outcome.
- Conflating "grading" with "assessment" (it's only the human-graded branch) or with "completion" (it's upstream of it) is the design smell that was present.

So the clean chain is: **assessment produces an outcome** (auto for quizzes, *via grading* for assignments) → **progress records completion** from that outcome. Grading is a sub-mechanism of assessment, not a peer of completion.

## Why the current integration is wrong / premature

- There is a standalone **`submissions` context** that is 100% an in-memory demo (32 fake rows) — not connected to any real assessment or to progress.
- A **`grade_assessments` permission** and an **instructor-as-grader** role capability were added to the org role model **before any assessment domain exists to grade**.
- An admin **`/grading` page** + SDK operations exist with **no backing domain**.
- The `assessment` context is **spec-only**; its spec mixes auto-scored quizzes with human-graded assignments/submissions/Grade — but **only the grading half leaked into code** (submissions), and the quiz half doesn't exist yet.

Net: grading — the **most complex** part (human workflow, a submitted→graded→returned state machine, grader authorization) — is the **only part half-built**, sitting on top of nothing. That's backwards. Build completion + auto-outcome first; add grading as a designed flow when assessments are real.

## Decision

- **Remove grading entirely now**: workflow, use case, role capability, API, UI, and docs references.
- **Keep**: completion (`progress`) and assessment **outcome** for auto-scored quizzes.
- **Keep the Instructor role** for course management (edit assigned courses, view progress) **minus** the grading capability. `course_assignments` (instructor course-scope) stays.
- **Re-introduce grading later** as a designed flow (see below) — deferred, not discarded.

## Removal scope (what comes out now)

Full deletes:
- `core/submissions/` context (`model/ports/service/index`), `adapters/inmemory/submissions.ts`, `http/routes/submissions.ts`, `packages/api-contract/src/submissions.ts`, admin `app/(dashboard)/grading/` route + components.

Partial edits:
- `core/organizations/roles.ts` (+ test): drop `grade_assessments` from the `Permission` union and the matrix.
- `adapters/auth/access.ts`: drop the `"grade"` course action; `adapters/auth/index.ts`: drop the `assessments:grade` scope.
- `composition/container.ts`, `http/server.ts`: drop submissions wiring + route registration.
- `packages/api-contract`: drop the submissions export and `dashboard.pendingSubmissions`; **regenerate** `packages/sdk` + `openapi.json` (`pnpm gen:sdk`).
- `apps/admin`: nav item, `useSubmissions`/`useGradeSubmission` hooks, sdk methods, types, query-keys, `roles.can.grade`, the overview "Needs grading" panel + `pendingSubmissions` stat, and "and grading" copy.
- Docs: `assessment.md` (drop Assignment/Submission/Grade models + `assignment.submitted`/`assignment.graded` events), `organizations.md` + `identity.md` (drop the "Grade assessments" matrix row + grader boundary), `architecture.md` (assessment description), `mcp-readiness.md` + the mcp plan (drop `assessments:grade` scope + `grade_submission` tool), README + CLAUDE.md (drop `submissions` from resource lists).

Kept: Instructor role + `course_assignments`, quiz `quiz.passed`/`quiz.failed` outcome events, all of `progress`.

No DB migration is needed — `submissions` was never a Drizzle table (in-memory only).

## Future: grading as a proper flow (deferred, designed)

When grading is actually needed, it lands **inside the `assessment` context** as the human-graded branch — **not** a standalone `submissions` context:

- **Models** (within assessment): `Assignment` (submission type, rubric, due date), `Submission` (student work; state `submitted → graded → returned`), `Grade` (score, feedback, grader, graded_at).
- **Flow:** student submits → instructor (grader) grades → assessment emits **`assignment.graded`** (an outcome) → `progress` consumes it and records completion per the item's rule. This is the **same event seam** as `quiz.passed` — grading just produces the outcome that an auto-quiz would compute.
- **Authorization:** grader = Instructor role + course assignment. The `grade_assessments` capability we remove now returns **here**, scoped via `canForCourse`.
- **Architecture invariant preserved:** assessment owns *outcome*, progress owns *completion*, grading is only *how a human produces an outcome* for non-auto work.

Capturing this means re-adding grading is a **planned slice** against a real assessment domain, not the ad-hoc, backing-less integration we have today.
