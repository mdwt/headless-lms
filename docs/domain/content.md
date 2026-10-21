# Content — Domain Spec

Owns the org's authored content: the things a learner consumes. The domain is responsible for **all content types**. Today there are two — **course** and **download** — with **community** specified alongside them, and the domain is the home for every content type that follows (podcast, newsletter, and others), each with its own structure.

What unites content types is not structure but how they behave at the edges: every type is authored and published here, gated by entitlements, progressed through by progress, and backed by assets. Course and download already share no structure — a course a tree of modules and activities, a download a flat, ordered set of asset references — yet both sit in the same domain, so neither is its shape. Structure is each type's own concern; the domain is defined by being the owner of all content and by the shared boundaries and capabilities its types have, not by any one tree.

## Content types

The domain owns all content types. Each defines its own structure and rules.

**Today:**

- **Course** — modules grouping an ordered list of activities, with sequencing, gating (drip, unlock-on-completion), and completion toward 100%.
- **Download** — an ordered set of files; access and retrieval, no progression.

**Specified with the community feature:**

- **Community** — a product whose structure is a flat, ordered list of spaces. A grant to it makes a person a member. Members post in its spaces and message each other; what they write belongs to discussion. Content owns the community, its spaces and their rules, and the community's DM settings.

The domain also owns the **bundle**: a named set of content items sold together. A bundle is not itself consumed; a grant to it is access to each of its items (entitlements). A membership, in the business sense, is a bundle.

**Future types the domain will hold** (illustrative, not built):

- **Podcast** — a flat list of episodes; open, position tracked, with external distribution (RSS, directories).
- **Newsletter** — a flat list of dated issues; read/unread.

Types are not forced into a common structure — a course is a tree of modules and activities, a newsletter a flat list — and the domain accommodates each on its own terms as it is added.

## Scope

- Owns the content types and, within each, its own structure and authoring rules.
- Owns the gating **rules** a type defines on its structure (e.g. a course's drip and unlock-on-completion).
- Owns the **settings other contexts apply**: a course's discussion settings, a space's access rule, capacity and post defaults, a community's DM settings. Content is their only writer; entitlements and discussion read them.
- References the assets content uses. Does **not** own access (entitlements), per-learner progress (progress), or how content is sold (offers).

## Capabilities

Shared across all content types:

- **Author** — create, update, and structure content of any type (a course's modules and activities, a community's spaces, a podcast's episodes, a newsletter's issues).
- **Publish** — move content between draft and published.
- **Define gating** — where a type supports it, set the rules on its structure (a course's drip and unlock-on-completion, a space's access rule and capacity).
- **Define what others apply** — set a course's discussion settings, a space's post defaults and topics, and a community's DM settings. Discussion and entitlements read them; only content writes them.

## Model

Structure is per-type; the entities below are a type's own. The course type, as the richest example:

### Course type — entities

- **Course** — the root: title, status (draft/published), ordered modules, and its settings, including the discussion settings that discussion reads.
- **Module** — title, `seq` (order within the course), parent course, an ordered list of activities.
- **Activity** — the leaf, sitting directly in a module. It is a unit of content: a `seq` (order within the module), a **settings blob** holding whatever that content needs, a completion rule, and links to any assets it uses. An activity that is a video has a video asset linked; one that is an assessment carries its rules in the blob. The domain doesn't categorise it — it stores the content, and the learner-facing surface renders whatever is there.
- **Activity–asset link** — the many-to-many relation between an activity and the assets it uses. Assets are linked here rather than held in the activity's blob, because they are owned by the assets domain and tracked for usage, which a blob can't express.

### Gating rules

- **Drip rule** — release timing on a module or activity, relative to access start. Content defines it; entitlements evaluates it per learner, since access start lives on the enrollment.
- **Unlock rule** — gates a module or activity until another is complete.

### Community type — entities

- **Community** — the root: title, description, thumbnail, status (draft/published), an ordered list of spaces, and its DM settings.
- **Space** — a place inside the community: name, description, order within the community, an access rule (`all members | by request | by invite`), an optional capacity for a by-request or by-invite space, its topics, its links, and the defaults for its posts (comments on, reactions on, review before publishing). A community holds a flat list of spaces; there are no spaces inside spaces.
- **Topic** — a subject defined on a space. Where a space defines topics, each post in it carries one. A topic cannot be deleted while a post references it.
- **Link** — a space pointing at a course, a download or a community. A link shows the resource in the space and never grants access; opening it needs a grant. A link is removed when its space or its resource is deleted.
- **DM settings** — per community: whether DMs are on, who may message whom by role, whether a first message is a request, whether group chats are allowed and how many people one holds.

A space's access rule, capacity and post defaults and the community's DM settings are content's definition. Entitlements reads the access rule and capacity to answer who can open a space; discussion reads the post defaults, topics and DM settings to decide what it accepts. Neither writes them. The posts in a space, and the chats in a community, are discussion's.

### Other types

Each other type defines its own entities. A download owns an ordered set of asset references and nothing else — no drip, no unlock, no completion, no progression. A podcast has its episodes (and feed), a newsletter its issues. They share the domain's boundaries and capabilities, not the course's structure.

## Activity settings and assets

An activity is just content. Its settings blob holds whatever that piece of content needs — a video's playback settings, an assessment's rules, a page's body — and the learner-facing surface renders whatever is there. The domain doesn't classify activities or branch on a type; it stores content uniformly. Assets are the one thing kept out of the blob: the assets an activity uses are linked through an activity–asset relation, so the assets domain can own them and track their usage.

## Boundaries

1. **content ↔ assets** — content references the assets it uses; assets owns the stored objects. A piece of content can reference many assets, and an asset can be used by many. Content never reads bytes; assets never reads structure.
2. **content → progress** — content owns the structure and what counts as a completable unit; progress reads that structure to track and derive a learner's progress. Content knows nothing of per-learner progress.
3. **content → entitlements** — content owns the gating rules a type defines on its structure; entitlements reads them (with access start and progress) to resolve what a learner can access now. For a community, entitlements reads a space's access rule and capacity to answer who can open it, and when it checks capacity it asks content to lock the space for the length of that check. Content provides the rules but never evaluates per-learner access, and entitlements never writes the space.
4. **content → discussion** — content owns a course's discussion settings and an activity's comments state, a space's post defaults and topics, and a community's DM settings, all as part of the content's definition, and is their only writer; discussion reads them to decide what it accepts and serves. Removing a space removes its posts; removing a community removes its chats.

## Events

Per type. For the course type:

- `course.created`, `course.updated`, `course.published`, `course.unpublished`, `course.deleted`
- `module.created`, `module.updated`, `module.deleted`
- `activity.created`, `activity.updated`, `activity.deleted`

For the community type:

- `community.created`, `community.updated`, `community.deleted` — publishing and unpublishing are an `updated` carrying the new status; a change to the DM settings is an `updated` too.
- `community.space.created`, `community.space.updated`, `community.space.deleted` — a change to a space's topics or links is an `updated` on the space.
- `community.spaces.reordered`

Other types emit their own equivalents (e.g. `episode.published`, `issue.published`). The bundle emits `bundle.created`, `bundle.updated`, `bundle.deleted`.

## Mutable structure

A type's structure changes over time — adding, removing, or reordering parts. Content owns the structure; progress derives a learner's percentage against the current structure at read time. Content never stores or recalculates progress.

## Build state

The course and download types are built and **persisted**. The community type is built and **persisted**. Other types follow as they are implemented.
