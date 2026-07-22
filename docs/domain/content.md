# Content — Domain Spec

Owns the org's authored content: the things a learner consumes. The domain is responsible for **all content types**. Today there is one — **course** — but the domain is the home for every content type that follows (podcast, newsletter, download, and others), each with its own structure.

What unites content types is not structure but how they behave at the edges: every type is authored and published here, gated by entitlements, progressed through by progress, and backed by assets. A course is the first and currently only type — not the shape of the domain. Structure is each type's own concern; the domain is defined by being the owner of all content and by the shared boundaries and capabilities its types have, not by any one tree.

## Content types

The domain owns all content types. Each defines its own structure and rules.

**Today:**

- **Course** — modules grouping an ordered list of activities, with sequencing, gating (drip, unlock-on-completion), and completion toward 100%.

**Future types the domain will hold** (illustrative, not built):

- **Podcast** — a flat list of episodes; open, position tracked, with external distribution (RSS, directories).
- **Newsletter** — a flat list of dated issues; read/unread.
- **Download** — a set of files; access and retrieval, no progression.

Types are not forced into a common structure — a course is a tree of modules and activities, a newsletter a flat list — and the domain accommodates each on its own terms as it is added.

## Scope

- Owns the content types and, within each, its own structure and authoring rules.
- Owns the gating **rules** a type defines on its structure (e.g. a course's drip and unlock-on-completion).
- References the assets content uses. Does **not** own access (entitlements), per-learner progress (progress), or how content is sold (offers).

## Capabilities

Shared across all content types:

- **Author** — create, update, and structure content of any type (a course's modules and activities, a podcast's episodes, a newsletter's issues).
- **Publish** — move content between draft and published.
- **Define gating** — where a type supports it, set the rules on its structure (a course's drip and unlock-on-completion).

## Model

Structure is per-type; the entities below are a type's own. The course type, as the richest example:

### Course type — entities

- **Course** — the root: title, status (draft/published), ordered modules.
- **Module** — title, `seq` (order within the course), parent course, an ordered list of activities.
- **Activity** — the leaf, sitting directly in a module. It is a unit of content: a `seq` (order within the module), a **settings blob** holding whatever that content needs, a completion rule, and links to any assets it uses. An activity that is a video has a video asset linked; one that is an assessment carries its rules in the blob. The domain doesn't categorise it — it stores the content, and the learner-facing surface renders whatever is there.
- **Activity–asset link** — the many-to-many relation between an activity and the assets it uses. Assets are linked here rather than held in the activity's blob, because they are owned by the assets domain and tracked for usage, which a blob can't express.

### Gating rules

- **Drip rule** — release timing on a module or activity, relative to access start. Content defines it; entitlements evaluates it per learner, since access start lives on the enrollment.
- **Unlock rule** — gates a module or activity until another is complete.

### Other types

Each other type defines its own entities — a podcast its episodes (and feed), a newsletter its issues, a download its files. They share the domain's boundaries and capabilities, not the course's structure.

## Activity settings and assets

An activity is just content. Its settings blob holds whatever that piece of content needs — a video's playback settings, an assessment's rules, a page's body — and the learner-facing surface renders whatever is there. The domain doesn't classify activities or branch on a type; it stores content uniformly. Assets are the one thing kept out of the blob: the assets an activity uses are linked through an activity–asset relation, so the assets domain can own them and track their usage.

## Boundaries

1. **content ↔ assets** — content references the assets it uses; assets owns the stored objects. A piece of content can reference many assets, and an asset can be used by many. Content never reads bytes; assets never reads structure.
2. **content → progress** — content owns the structure and what counts as a completable unit; progress reads that structure to track and derive a learner's progress. Content knows nothing of per-learner progress.
3. **content → entitlements** — content owns the gating rules a type defines on its structure; entitlements reads them (with access start and progress) to resolve what a learner can access now. Content provides the rules but never evaluates per-learner access.

## Events

Per type. For the course type:

- `course.created`, `course.updated`, `course.published`, `course.unpublished`, `course.deleted`
- `module.created`, `module.updated`, `module.deleted`
- `activity.created`, `activity.updated`, `activity.deleted`

Other types emit their own equivalents (e.g. `episode.published`, `issue.published`).

## Mutable structure

A type's structure changes over time — adding, removing, or reordering parts. Content owns the structure; progress derives a learner's percentage against the current structure at read time. Content never stores or recalculates progress.

## Build state

The course type is built and **persisted** via a Drizzle repository (`adapters/db/repositories/content.ts`). Other types follow as they are implemented.
