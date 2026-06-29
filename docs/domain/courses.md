# Courses — Domain Spec

The curriculum aggregate: Course → Module → Item → Lesson, plus drip/unlock rules. The Course is the aggregate root; Module/Item/Lesson are entities under it. Static and shared across students — the template, not per-student state.

## Scope

- Owns the curriculum aggregate: Course (root) → Module → Item → Lesson, and the ordered items within a module.
- Owns lesson content for presentational types (`video | text | pdf | audio | download | embed`).
- Owns the **module/item editor write surface** (absorbed from the former `modules` context): `listForCourse`, reorder modules/items, `saveItem`, create/update/delete module, `deleteItem`.
- Owns gating *rules* defined on structure (drip schedule, unlock-on-completion rules).
- References assets by `assetId`. Does **not** own per-student state (completion, access, outcomes).

## Model

- **Course** — root: title, slug, status (draft/published), ordered modules.
- **Module** — title, order, parent course, ordered items.
- **Item** — a discriminated slot in a module; either a **Lesson** or a **typed assessment slot**. Heterogeneous; ordered.
- **Lesson** — title, `type` (`video | text | pdf | audio | download | embed`), content (presentational payload), optional `assetId`, completion rule (e.g. video % required).
- **Assessment item** — a typed authoring slot, `type` (`quiz | assignment`), optional `questionCount` / `pointsPossible`, `published`. The grading engine is out of scope (archived); the item is only an authoring slot inside the aggregate — there is no assessment domain.
- **Drip rule** — release timing for a module/item, relative to access start date.
- **Unlock rule** — an item/module is gated until another item is complete.

## Editor write surface

The module/item write surface absorbed from the former `modules` context:

- Modules: `listForCourse`, `reorderModules`, `createModule`, `updateModule`, `deleteModule`.
- Items: `reorderItems`, `saveItem` (create or update, keyed by optional `itemId`), `deleteItem`.

Every write returns the course's **full module list** — matching how the editor re-renders after each change.

## Lesson content

- Presentational lesson content is a discriminated union keyed by `type`, stored as a payload.
- Assessment items are typed authoring slots within the aggregate, not lessons.
- Content shape validated at the boundary (no DB-level shape enforcement).

## Boundaries

1. **courses ↔ assets**
   - *courses* owns the lesson; a lesson references a media-library asset by `assetId`.
   - *assets* owns the stored object.
   - Connection: reference by id. Courses never reads bytes; assets never reads curriculum.

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

## Build state

Built and **persisted** via a Drizzle repository (`adapters/db/repositories/courses.ts`), including the absorbed module/item editor surface.
