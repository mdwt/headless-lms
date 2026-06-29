# Progress — Domain Spec

Owns per-student completion of curriculum items and derived percentage against the course's current structure. Owns the **completion fact**, not outcomes and not access.

## Scope

- Owns **completion state**: which curriculum items a student has completed, and derived progress (per-module and per-course percentage).
- Per-student, per-item. High-frequency, activity-driven.
- Computes completion in two ways:
  - **Direct** — presentational lessons completed by the student (viewed, marked complete, or rule satisfied e.g. video % watched).
  - **Event-driven** — completion recorded from an outcome event, if/when an assessment/grading engine exists to emit one (an optional future outcome-event source, not a referenced domain). Progress applies the item's completion rule (e.g. "passed" vs "attempted") and records completion.
- References items (courses) and the user (identity) by id.
- Does **not** own access or validity (entitlements'), structure (courses'), or outcomes.

## What it owns

- **Completion record** — student + curriculum item + `completed_at`.
- **Derived progress** — percentage complete for a module / course, computed against current course structure.
- **Resume point** — the student's last-accessed item, for "continue where you left off."

## Completion is relative to mutable structure

Progress is measured against the course's current published structure. Adding/removing items changes the denominator. Store **completion records** (which items are done) and derive percentage on read against current structure — do not store a frozen percentage. This keeps progress correct when structure changes.

## Boundaries

1. **progress ↔ courses**
   - *courses* owns structure (items, ordering, what counts toward completion).
   - *progress* references items by id and reads current structure to derive percentage.
   - Connection: progress reads structure; courses knows nothing of completion.

2. **progress ← outcome events (optional, future)**
   - If/when an assessment/grading engine exists, it **emits** an outcome event.
   - *progress* consumes the event and records completion per the item's rule.
   - Connection: event. There is no assessment domain today; this is an optional future source, not a referenced context.

3. **progress → gating**
   - *progress* exposes "what has this student completed."
   - *gating* (entitlements/access-resolution) reads progress to evaluate unlock rules.
   - Connection: gating reads progress only.

4. **progress ↔ identity**
   - *identity* owns the user.
   - *progress* references the user id on completion records.
   - Connection: reference only.

## Events

- `lesson.completed`
- `course.completed`
- `progress.updated`

## Use case — course with one video + one assessment item

Structure (courses): Course → 1 module → [video lesson, assessment item]. Two completable items; denominator = 2.

1. **Enrolled** — no completion records. Course 0%.
2. **Watches video** — video completion rule satisfied. Progress records completion **directly** (presentational lesson, no event). Course 1/2 = 50%. Emits `lesson.completed`, `progress.updated`.
3. **Completes the assessment item** — if a grading engine exists, it computes an outcome and emits an outcome event. Writes nothing to progress.
4. **Progress consumes the outcome event** — applies the item's rule ("passed" → complete), records completion. Course 2/2 = 100%. Emits `lesson.completed`, `progress.updated`, `course.completed`.

Two completion paths: video → **direct**; assessment item → **event-driven** (an outcome source emits, progress records).

Progress holds completion records, not a stored percentage:
```
{ student, videoItemId,      completed_at }
{ student, assessmentItemId, completed_at }
```
Percentage is derived on read: completed ÷ current items = 2/2 = 100%. If the author later adds a lesson, the denominator becomes 3 and this student correctly reads 2/3 with no recalculation job.

## Relationship to entitlements (distinct domains)

Progress (completion) and entitlements (access) move independently:
- enrolled with zero progress (just granted, never started)
- full progress but expired entitlement (finished, then access lapsed)

Access state comes from grants; completion state comes from activity against structure. Progress references that access exists but does not own it.

## Build state

Built and **persisted** via a Drizzle repository (`adapters/db/repositories/progress.ts`).
