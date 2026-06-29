# Courses — Domain Spec

> **Build state:** course *metadata* is implemented (in-memory repo; schema is a stub). The Module → Lesson/Item curriculum structure lives in the **`modules`** context. Drip/unlock rules are not built.

Owns course content structure. The template, not per-student state.

## Scope

- Owns the curriculum: Course → Module → Lesson, and the ordered items within a module.
- Owns lesson content for presentational types (video, text, pdf, audio, download, embed).
- Owns gating *rules* defined on structure (drip schedule, unlock-on-completion rules).
- Static/shared across students. Does **not** own per-student state (completion, access, outcomes).

## Model

- **Course** — title, description, thumbnail, status (draft/published), ordered modules.
- **Module** — title, order, parent course, ordered items.
- **Item** — an ordered slot in a module. Either a Lesson, or a reference to an assessment (`{ type, assessmentId }`). Heterogeneous; ordered.
- **Lesson** — title, type, content (presentational payload), completion rule (e.g. video % required).
- **Drip rule** — release timing for a module/item, relative to access start date.
- **Unlock rule** — an item/module is gated until another item is complete.

## Lesson content

- Presentational lesson content is a discriminated union keyed by `type`, stored as a payload.
- Assessment items are not lessons — the module item references the assessment context by id.
- Content shape validated at the boundary (no DB-level shape enforcement).

## Boundaries

1. **courses ↔ assessment**
   - *courses* owns the curriculum slot; holds a reference to an assessment by id.
   - *assessment* owns the assessment itself.
   - Connection: reference by id. Courses never reads questions; assessment never reads structure.

2. **courses → progress**
   - *courses* owns structure and what counts toward completion.
   - *progress* reads current structure to derive percentage and references items by id.
   - Connection: progress reads structure; courses knows nothing of completion.

3. **courses → entitlements/gating**
   - *courses* owns drip and unlock *rules* (defined on structure).
   - *gating* (access-resolution) reads those rules plus entitlements (access start) plus progress (completions) to resolve what a student can access now.
   - Connection: courses provides rules; it does not evaluate per-student access.

## Events

- `course.created`, `course.published`, `course.updated`
- `module.created`, `lesson.created`

## Mutable structure

Structure changes (adding/removing items, reordering) affect per-student progress denominators. Courses owns structure; progress derives percentage against current structure at read time. Courses does not recalculate or store progress.
