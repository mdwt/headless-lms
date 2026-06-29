# Modules — Domain Spec

Owns the curriculum structure under a course: its ordered modules and the ordered items within each. The build of the Course → Module → Lesson/Item shape that the **courses** spec describes as content structure.

## Scope

- Owns the **module** (an ordered section of a course) and its ordered **items**.
- Owns reorder / create / update / delete of modules and items — the course-editor write surface.
- Static/shared across students. Does **not** own per-student state, access, or the assessment internals.

## Model

- **Module** — id, parent course, title, order, ordered `items[]`.
- **ModuleItem** — a discriminated union on `kind`:
  - **Lesson** (`kind: "lesson"`) — title, order, `type` (`video | text | pdf | audio | download | embed`), optional `durationLabel`, optional `assetId` (the media-library asset backing it), `published`.
  - **Assessment** (`kind: "assessment"`) — an authoring stub: title, order, `type` (`quiz | assignment`), optional `questionCount` / `pointsPossible`, `published`. The assessment itself is not modelled here.

## Key operations

- Modules: `listForCourse`, `reorderModules`, `createModule`, `updateModule`, `deleteModule`.
- Items: `reorderItems`, `saveItem` (create or update, keyed by optional `itemId`), `deleteItem`.

Every write returns the course's **full module list** — matching how the editor re-renders after each change.

## Boundaries

1. **modules ↔ courses** — courses owns course metadata; modules owns the structure hung under it, referencing the course by id.
2. **modules ↔ assets** — a lesson references a media-library asset by `assetId`.
3. **modules ↔ assessment** — an assessment item is an authoring stub referencing the (future) assessment context by intent; modules never reads questions.

## Build state

In-memory repository (no persistence, no events emitted). `ModulesServiceImpl` is thin delegation; ordering/persistence detail lives in the repo.
