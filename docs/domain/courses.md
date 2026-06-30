# Courses — Domain Spec

The curriculum aggregate: Course → Module → Module Item → (Lesson | Assessment), plus drip and unlock rules. The Course is the aggregate root; a Module holds an ordered list of Module Items, each pointing to a Lesson or an Assessment. Static and shared across students — the template, not per-student state.

## Scope

- Owns the curriculum aggregate: Course (root) → Module → Module Item → Lesson or Assessment.
- Owns lesson content for presentational types (`video | text | pdf | audio | download | embed`).
- Owns the **authoring surface**: creating, updating, deleting, and reordering modules and their items.
- Owns the gating **rules** defined on structure — drip and unlock-on-completion.
- References the assets lessons use. Does **not** own per-student state (completion, access, outcomes).

Capabilities


Author courses — create, update, publish/unpublish, and delete courses.
Author structure — add, update, delete, and reorder modules and their items within a course.
Author content — define lessons (with their type-specific content and assets) and assessment slots.
Define gating — set drip timing and unlock-on-completion rules on the structure.

## Model

### Entities (persisted)

- **Course** — the aggregate root: title, status (draft/published), ordered modules.
- **Module** — title, position in the course, parent course, and an ordered list of module items.
- **Module Item** — the orderable slot inside a module. Carries its position and points to exactly one child: a Lesson or an Assessment. This is what makes a module's mixed contents a single ordered list — ordering lives here, not on the children.
- **Lesson** — title, `type` (`video | text | pdf | audio | download | embed`), its type-specific content, and a completion rule. References the assets it uses (many).
- **Assessment** — a quiz or assignment authoring slot: `type` (`quiz | assignment`), optional question count / points, and a published flag. The grading engine is out of scope.

### Attributes

- **Drip rule** — a release-timing rule, held as configuration on a module or item, relative to access start. Not a table. Courses defines the rule; entitlements evaluates it per student, since the access-start date it depends on lives on the enrollment, not here.
- **Unlock rule** — a rule gating a module or item until another is complete, held as configuration on the gated entity. Not a table.
- **Lesson content** — the type-specific payload carried on the Lesson, not a separate table.

A lesson references many assets (e.g. a video plus its captions plus a downloadable file), so the lesson↔asset relationship is many-to-many.

## Lesson content

Each lesson type carries its own content shape — a video lesson holds a video, a text lesson holds text, a pdf holds a file. The `type` determines the shape.

## Boundaries

1. **courses ↔ assets** — courses owns the lesson and references the assets it uses; assets owns the stored objects. Courses never reads bytes; assets never reads curriculum.
2. **courses → progress** — courses owns the structure and what counts toward completion; progress reads that structure to derive percentage. Courses knows nothing of completion.
3. **courses → entitlements** — courses owns the drip and unlock rules defined on structure; entitlements reads them (with access start and completion) to resolve what a student can access now. Courses provides the rules but never evaluates per-student access.

## Events

- `course.created`, `course.updated`, `course.published`, `course.unpublished`, `course.deleted`
- `module.created`, `module.updated`, `module.deleted`
- `lesson.created`, `lesson.updated`, `lesson.deleted`
- `assessment.created`, `assessment.updated`, `assessment.deleted`

## Mutable structure

Structure changes — adding or removing items, reordering — shift per-student progress denominators. Courses owns the structure; progress derives percentage against the current structure at read time. Courses never recalculates or stores progress.

## Build state

Built and **persisted** via a Drizzle repository (`adapters/db/repositories/courses.ts`).
