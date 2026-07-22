# Progress — Domain Spec

Owns per-student progress through the lessons and assessments of a course — what's been started, how far into each item the student is, and what's complete — plus the percentage derived against the course's current structure. It owns the progress fact.

## Scope

- Owns **progress state**: for each student, a record per lesson or assessment they've started, holding their position within it and whether it's complete, plus the derived per-module and per-course percentage.
- Per-student, per-lesson/assessment — high-frequency and activity-driven.
- Records a start when a student opens an item, updates their position as the player reports it, and records completion when the item's rule is satisfied.
- References lessons and assessments (courses) and the user (identity).

## Capabilities

- **Record a start** — when a student opens a lesson or assessment, create its progress record. Access is gated by entitlements first (see boundaries); progress only records once the student is allowed in.
- **Record position** — update a student's position within a lesson or assessment as it is reported, so they can resume where they left off.
- **Evaluate and record completion** — apply the item's completion rule to the reported position and mark the record complete when satisfied (e.g. a video watched past its threshold, a lesson marked complete, an assessment finished). Cascades to module and course completion when the last item is done.
- **Report progress** — return a student's progress for a course (what's complete, the derived percentage, and which item to resume), or for a single item (its completion and the position to resume within it). Resume is relative to the scope asked: a course resolves which item; an item resolves the position within it.

## Model

### Entities (persisted)

- **Progress record** — one per student per lesson or assessment they've started: the student, what it refers to, when it was started, the student's **position** within it, and when it was completed (unset until finished). It records the student's progress through that item — the position to resume from and whether the completion rule has been met. The source of truth; everything else derives from these records.

### Position is a typed payload

Position means different things per item type — a timestamp into a video, a page in a document, a scroll point in text — so it is stored as an opaque payload and interpreted by the service according to the item's type. The database holds a blob; the service is the only thing that understands its shape, both when updating it from a player report and when evaluating the completion rule against it. This mirrors how lesson content is itself a typed payload.

### Derived (not stored)

- **Progress percentage** — completed records ÷ the course's current lessons and assessments, computed on read. Never a stored field — deriving it is what keeps progress correct when structure changes.
- **Resume point** — relative to what's requested. Asked for a course, it resolves which item to return to (the most recently engaged record in that course) and that item's position. Asked for a single item, it resolves the position within that item (e.g. the timestamp to seek a video to). Same records, different granularity by scope — derived, not stored separately.

## Completion is relative to mutable structure

Progress is measured against the course's current published structure, so adding or removing lessons or assessments changes the denominator. Progress stores a record per started item and derives the percentage on read against the current structure — never a frozen percentage. Add a lesson and the denominator grows; every student's percentage adjusts on the next read without any backfill.

## Boundaries

1. **progress → courses** — progress references the lessons and assessments it tracks and reads the current structure to derive percentage; courses owns that structure and knows nothing of progress.
2. **progress → entitlements** — opening an item is gated: entitlements resolves access (active grant, unlocked by drip/unlock rules) before progress records a start. Entitlements also reads progress during access resolution to evaluate those unlock rules. Entitlements decides access; progress records activity.
3. **progress → identity** — progress references the user on each record; identity owns the user.

## Events

- `lesson.started`
- `lesson.completed`
- `assessment.started`
- `assessment.completed`
- `module.completed`
- `course.completed`

## How progress accrues

A worked example for context. Take a course with one module holding a video lesson and an assessment — two completable things, so the denominator is two.

A student is enrolled (a grant in entitlements) and opens the course. They have no progress records yet, so the course reads 0%. They click the video: the open is gated first — entitlements confirms their grant is active and the video isn't locked by drip or an unlock rule — and once allowed, progress creates the record and emits `lesson.started`. As they watch, the player reports position every few seconds and progress updates the record, so leaving at ten minutes into a thirteen-minute video means they resume at ten minutes. When the position passes the completion threshold, progress records completion and the course reads 50% (`lesson.completed`).

They move to the assessment. Same gate — entitlements may have it locked until the video is complete, which it now is, so access resolves. Progress records the start, then the completion when they finish, and the course reads 100% (`assessment.completed`, `module.completed`, `course.completed`).

Progress stores a record per lesson or assessment, never a running percentage; the percentage is derived on read. If the author later adds a third one, the denominator becomes three and the same student reads two-thirds on the next read, with nothing to recompute.

## Relationship to entitlements

Progress and access (entitlements) move independently — a student can be enrolled with no progress, or have full progress after access has expired. Access comes from grants; progress comes from activity against structure.

## Build state

Built and **persisted**.
