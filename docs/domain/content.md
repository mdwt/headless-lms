# Content — Domain Spec

Owns the org's authored content: the things a learner consumes. The domain is responsible for **all content types**: **course**, **download**, **community** and **event**, and every content type that follows (podcast, newsletter, and others), each with its own structure.

What unites content types is not structure but how they behave at the edges: every type is authored and published here, gated by entitlements, progressed through by progress, and backed by assets. Course and download already share no structure — a course a tree of modules and activities, a download a flat, ordered set of asset references — yet both sit in the same domain, so neither is its shape. Structure is each type's own concern; the domain is defined by being the owner of all content and by the shared boundaries and capabilities its types have, not by any one tree.

## Content types

The domain owns all content types. Each defines its own structure and rules.

**Today:**

- **Course** — modules grouping an ordered list of activities, with sequencing, gating (drip, unlock-on-completion), and completion toward 100%.
- **Download** — an ordered set of files; access and retrieval, no progression.

**Specified with the community feature:**

- **Community** — a product whose structure is a flat, ordered list of spaces. A grant to it makes a person a member. Members post in its spaces and message each other; what they write belongs to discussion. Content owns the community, its spaces and their rules, and the community's DM settings.

**Specified with the events feature:**

- **Event** — one live session at a set time: a weekly call, office hours, a workshop or an in-person meetup. The session runs in a meeting tool or at a venue; the system doesn't host it. A grant to the event makes a person an attendee. Content owns the event, its settings and its attached files.

The domain also owns the **bundle**: a named set of content items sold together. A bundle is not itself consumed; a grant to it is access to each of its items (entitlements). A membership, in the business sense, is a bundle.

**Future types the domain will hold** (illustrative, not built):

- **Podcast** — a flat list of episodes; open, position tracked, with external distribution (RSS, directories).
- **Newsletter** — a flat list of dated issues; read/unread.

Types are not forced into a common structure — a course is a tree of modules and activities, a newsletter a flat list — and the domain accommodates each on its own terms as it is added.

## Scope

- Owns the content types and, within each, its own structure and authoring rules.
- Owns the gating **rules** a type defines on its structure (e.g. a course's drip and unlock-on-completion).
- Owns the **settings other contexts apply**: a course's discussion settings, a space's access rule, capacity and post defaults, a community's DM settings, notification categories and digest schedule, an event's type, capacity and whether it sends notifications. Content is their only writer; entitlements, discussion and automations read them.
- References the assets content uses. Does **not** own access (entitlements), per-learner progress (progress), or how content is sold (offers).

## Capabilities

Shared across all content types:

- **Author** — create, update, and structure content of any type (a course's modules and activities, a community's spaces, a podcast's episodes, a newsletter's issues).
- **Publish** — move content between draft and published.
- **Define gating** — where a type supports it, set the rules on its structure (a course's drip and unlock-on-completion, a space's access rule and capacity).
- **Define what others apply** — set a course's discussion settings, a space's post defaults and topics, and a community's DM settings, notification categories and digest schedule. Discussion, entitlements and automations read them; only content writes them.

Each capability needs the type's permission on the item acted on: `courses:write` to author and publish a course, `courses:delete` to delete it, and likewise for downloads, communities and events. Removing a module, an activity or a space changes its item and needs the write permission. Creating an item needs the type's write permission on the org, because there is no item yet. A list holds the items the person holds the type's read permission on. Bundles need the `bundles` permissions on the org.

## Model

Structure is per-type; the entities below are a type's own. The course type, as the richest example:

### Course type — entities

- **Course** — the root: title, status (draft/published), ordered modules, and its settings, including the discussion settings that discussion reads.
- **Module** — title, `seq` (order within the course), parent course, an ordered list of activities.
- **Activity** — the leaf, sitting directly in a module. It is a unit of content: a `seq` (order within the module), a **settings blob** holding whatever that content needs, a completion rule, and links to any assets it uses. An activity that is a video has a video asset linked; one that is an assessment carries its rules in the blob. The domain doesn't categorise it — it stores the content, and the learner-facing surface renders whatever is there.
- **Activity–asset link** — the many-to-many relation between an activity and the assets it uses. Every asset an activity uses is linked here, including the files its content shows inline, because they are owned by the assets domain and tracked for usage, which a blob can't express. A link names a ready file from the org's media library and nothing else. The links are rewritten from the activity's content every time it is saved, so they always match what the content shows. A learner is only ever served an asset through an activity that links it.

### Gating rules

- **Drip rule** — release timing on a module or activity, relative to access start. Content defines it; entitlements evaluates it per learner, since access start lives on the enrollment.
- **Unlock rule** — gates a module or activity until another is complete.

### Community type — entities

- **Community** — the root: title, description, thumbnail, status (draft/published), an ordered list of spaces, its DM settings, its notification categories and its digest schedule.
- **Space** — a place inside the community: name, description, order within the community, an access rule (`all members | by request | by invite`), an optional capacity for a by-request or by-invite space, its topics, its links, and the defaults for its posts (comments on, reactions on, review before publishing). A community holds a flat list of spaces; there are no spaces inside spaces.
- **Topic** — a subject defined on a space. A post in the space may carry one of its topics. A topic cannot be deleted while a post references it.
- **Link** — a space pointing at a course, a download or a community. A link shows the resource in the space and never grants access; opening it needs a grant. A link is removed when its space or its resource is deleted.
- **DM settings** — per community: whether DMs are on, who may message whom (member to member, member to team, team to anyone), whether a first message is a request, whether group chats are allowed and how many people one holds.
- **Notification categories** — per community: the ordered switches on a member's notification settings in that community. Each covers kinds of notification for people with given reasons, offers channels with a default and an optional lock, and can be set per space, with a default per space. A community without its own list uses the default list, and a holder of `communities:write` on the community can go back to it.
- **Digest schedule** — per community: daily or weekly, the weekday for a weekly digest, the hour and the time zone. A community without one sends no digest.

A space's access rule, capacity and post defaults and the community's DM settings, notification categories and digest schedule are content's definition. Entitlements reads the access rule and capacity to answer who can open a space; discussion reads the post defaults, topics and DM settings to decide what it accepts, and the digest schedule to know when a digest is due; automations reads the notification categories to file each notification and identity reads them to check a member's settings. None of them writes them. The posts in a space, and the chats in a community, are discussion's.

### Event type — entities

- **Event** — title, description, cover, status (`draft | published | canceled`), a start, an end after it, the time zone it was set in, its location, its recording and its settings. Ended is not a status: an event has ended once its end has passed. Canceling is final; a canceled event can't be published or changed again.
- **Location** — a venue, with its name and address, a meeting link with details such as a passcode, both, or neither yet.
- **Recording** — a link to the recording with its details, set after the session.
- **Settings** — the event type, `public` (any member registers) or `private` (by grant only); the capacity, at least one or no limit, which every grant to the event counts against; whether notifications are sent about the event; and whether attendees get the recording after the end (replay).
- **Attached file** — an ordered list of uploaded files of any kind, each with an optional display name, as a download's.

What the event is lives on the event; everything that changes how it behaves is one of its settings. Entitlements reads the status, times, type and capacity to decide whether a grant is allowed; automations reads whether the event sends notifications. Neither writes them. The grants to the event, its attendees, are entitlements'.

The attendees of a published event are reminded twice, a day and an hour before it starts. Content owns that timed work as a job: publishing the event, or moving its times, schedules a run for each lead still ahead; unpublishing, canceling or deleting it cancels them. When a run fires and the event is still published, content records that the event is starting soon, which automations turns into notices.

### Other types

Each other type defines its own entities. A download owns an ordered set of asset references and nothing else — no drip, no unlock, no completion, no progression. A podcast has its episodes (and feed), a newsletter its issues. They share the domain's boundaries and capabilities, not the course's structure.

## Activity settings and assets

An activity is just content. Its settings blob holds whatever that piece of content needs — a video's playback settings, an assessment's rules, a page's body — and the learner-facing surface renders whatever is there. The domain doesn't classify activities or branch on a type; it stores content uniformly. The blob may name the files it shows, but the link is what counts: every asset an activity uses is linked through the activity–asset relation, so the assets domain can own them and track their usage, and a learner is served an activity's file only through its link. Content refuses a link to anything that is not a ready library file of the org, and, from a person without `media:read`, to a file that was not uploaded for the same item.

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
- `course.activity.published` — an activity of a published course went live: it was created live, or its draft mark was cleared. It is the first activity publish event; an activity in a draft course, or a draft activity, emits none.

For the community type:

- `community.created`, `community.updated`, `community.deleted` — publishing and unpublishing are an `updated` carrying the new status; a change to the DM settings or the digest schedule is an `updated` too.
- `community.space.created`, `community.space.updated`, `community.space.deleted` — a change to a space's topics or links is an `updated` on the space.
- `community.spaces.reordered`

For the event type:

- `event.created`, `event.updated`, `event.deleted` — publishing, unpublishing and canceling are each an `updated` carrying the new status. An `updated` names the previous status, type, start and end, and whether the location changed, so a change that matters to attendees can be told from one that doesn't. The location and the recording never leave the system with these events.
- `event.starting_soon` — the event, how soon (a day or an hour) and when it starts, emitted by the reminder job.

Other types emit their own equivalents (e.g. `episode.published`, `issue.published`). The bundle emits `bundle.created`, `bundle.updated`, `bundle.deleted`.

## Mutable structure

A type's structure changes over time — adding, removing, or reordering parts. Content owns the structure; progress derives a learner's percentage against the current structure at read time. Content never stores or recalculates progress.

## Build state

The course and download types are built and **persisted**. The community type is built and **persisted**. The event type, its attached files and its reminder job are built and **persisted**. Other types follow as they are implemented.
