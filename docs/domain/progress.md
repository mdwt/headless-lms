# Progress — Domain Spec

A peer context owning per-student completion of curriculum items. Owns the **completion fact**, not outcomes and not access.

## Scope

- Owns **completion state**: which curriculum items a student has completed, and derived progress (per-module and per-course percentage).
- Per-student, per-item. High-frequency, activity-driven.
- Computes completion in two ways:
  - **Direct** — presentational lessons completed by the student (viewed, marked complete, or rule satisfied e.g. video % watched).
  - **Event-driven** — assessment items completed when assessment emits an outcome; progress applies the item's completion rule (e.g. "passed" vs "attempted") and records completion.
- Does **not** own outcomes (assessment's), access or validity (entitlements'), or structure (courses').

## What it owns

- **Completion record** — student + curriculum item + completed_at.
- **Derived progress** — percentage complete for a module / course, computed against current course structure.
- **Resume point** — the student's last-accessed item, for "continue where you left off."

## Completion is relative to mutable structure

Progress is measured against the course's current published structure. Adding/removing items changes the denominator. Store **completion records** (which items are done) and derive percentage on read against current structure — do not store a frozen percentage. This keeps progress correct when structure changes.

## Boundaries

1. **progress ↔ courses**
   - *courses* owns structure (items, ordering, what counts toward completion).
   - *progress* references items by id and reads current structure to derive percentage.
   - Connection: progress reads structure; courses knows nothing of completion.

2. **assessment → progress**
   - *assessment* owns outcome and **emits** it.
   - *progress* consumes the outcome event and records completion per the item's rule.
   - Connection: event. Progress never reads assessment internals; assessment never writes progress.

3. **progress → gating**
   - *progress* exposes "what has this student completed."
   - *gating* (entitlements/access-resolution) reads progress to evaluate unlock rules.
   - Connection: gating reads progress only.

4. **progress ↔ identity**
   - *identity* owns the student.
   - *progress* references student id on completion records.
   - Connection: reference only.

## Events

- `lesson.completed`
- `course.completed`
- `progress.updated`

## Use case — course with one video + one assessment

Structure (courses): Course → 1 module → [video lesson, assessment]. Two completable items; denominator = 2.

1. **Enrolled** — no completion records. Course 0%.
2. **Watches video** — video completion rule satisfied. Progress records completion **directly** (presentational lesson, no event). Course 1/2 = 50%. Emits `lesson.completed`, `progress.updated`.
3. **Takes assessment** — assessment computes outcome, emits `quiz.passed`. Writes nothing to progress.
4. **Progress consumes `quiz.passed`** — applies the item's rule ("passed" → complete), records completion. Course 2/2 = 100%. Emits `lesson.completed`, `progress.updated`, `course.completed`.

Two completion paths: video → **direct**; assessment → **event-driven** (assessment emits, progress records).

Progress holds completion records, not a stored percentage:
```
{ student, videoItemId,      completed_at }
{ student, assessmentItemId, completed_at }
```
Percentage is derived on read: completed ÷ current items = 2/2 = 100%. If the author later adds a lesson, the denominator becomes 3 and this student correctly reads 2/3 with no recalculation job.

Outcome vs completion stay distinct: assessment knows the student passed (and the score); progress knows the item is complete. Score → ask assessment; "done" → ask progress.

## Relationship to entitlements (distinct domains)

Progress (completion) and entitlements (access) move independently:
- enrolled with zero progress (just granted, never started)
- full progress but expired entitlement (finished, then access lapsed)

Access state comes from grants (purchase/comp/refund); completion state comes from activity against structure. Progress references that access exists but does not own it.
