# Discussion — Domain Spec

Owns learner-generated discussion on content — the comments written against an
activity, the replies, reactions and reports they attract, and the moderation
state that decides who sees what. It owns what learners said; content owns what
the author made.

## Scope

- Owns the **comment**: its author, the activity it attaches to, what it replies
  to, its body, and its moderation state.
- Owns **reactions** to comments and **reports** of comments.
- Reads the **discussion settings** on a course and the **comments state** on an
  activity. Content owns both as part of the course's definition and is the only
  writer; discussion applies them.
- Owns the **moderation lifecycle**: what state a comment is in and who may
  change it.
- Comments attach to an activity — the leaf a learner opens. There are no
  module-level or course-level comments.
- References the activity its comments attach to (content), the person who
  wrote each comment (identity), and access to the content (entitlements).
  Does **not** own content, access, identity, or notification delivery.

## Capabilities

- **Post a comment** — attach a comment to an activity, as a root comment or as
  a reply to an existing comment.
- **Edit and remove** — an author revises or removes their own comment.
- **List comments** — return an activity's comments with their authors,
  reactions and moderation state, nested or flat according to settings.
- **React** — add or remove a reaction to a comment.
- **Report** — flag a comment for moderator attention, with an optional reason.
- **Moderate** — approve a comment awaiting review, remove a published one,
  restore a removed one, resolve a report.
- **Work a queue** — list what awaits a moderator across a course or the org:
  comments pending review, and comments carrying unresolved reports.
- **Resolve settings** — read a course's discussion settings and an activity's
  comments state from content and resolve what the activity accepts and serves.
  Setting them is a content capability.

## Model

### Entities

- **Comment** — the author, the activity it attaches to, the comment it replies
  to (unset for a root comment), the body, the moderation state, who removed it
  (unset unless removed), and when it was written and last revised.
- **Reaction** — one person's reaction of one kind to one comment. No body. One
  per person, per comment, per kind.
- **Report** — one person's flag against one comment: an optional reason and
  whether it has been resolved. One per person, per comment.

### Settings discussion reads

Neither is a discussion entity. Both are part of the course's definition in
content, written only by content and read by discussion.

- **Discussion settings** — per course: whether discussion is enabled, whether
  replies are allowed, whether comments require review, whether reactions are
  enabled.
- **Comments state** — an optional per-activity override of the course setting:
  `visible | hidden | locked`.

### Moderation state

- **Pending** — awaiting review. Reached only where the settings require review.
- **Published** — served in the activity's comments.
- **Removed** — the body is no longer served; the comment is retained.

A removed comment is retained because its replies hang off it. It is served as a
placeholder holding its position when the reader can see at least one of its
replies, and not served at all otherwise — a marker with nothing beneath it is
noise, so whether it appears depends on what that reader is shown. It records
who removed it — its author or a moderator — and the placeholder says which.

### Comments state

Resolved per activity: the activity's comments state if set, the course setting
otherwise. There is no deeper cascade.

- **Visible** — comments are served; new comments are accepted.
- **Hidden** — comments are not served. Existing comments are retained and
  reappear if it becomes visible.
- **Locked** — comments are served read-only. Existing comments stay readable;
  no comment, reply or reaction is accepted. Reports still are — a locked
  activity can still contain something that needs a moderator.

Comments state governs visibility of the activity's comments, never a comment's
moderation state. Locking removes nothing; hiding un-publishes nothing.

### Authors and moderators

A comment names the person who wrote it. Learners and staff write comments the
same way, and the domain records which person, not what kind of person.

Whether an author is staff is resolved from their current role in the org each
time comments are read, and is never recorded on the comment. The same role
decides three things: who carries an instructor badge, who bypasses review, and
who may moderate. Any staff org user — owner, admin or instructor —
moderates; there is no narrower moderator role.

An author has full control of their own comments: read, revise, remove, with no
time limit and regardless of replies. Edits are neither versioned nor evented.
A locked activity still lets an author withdraw their own comment; it refuses a
revision.

### Review

Where the resolved settings require review, a comment is created **pending**: it
is served to its own author marked as awaiting review, and to nobody else. It is
not a reply target until it publishes. Approving it publishes it; rejecting it
removes it, recorded against the moderator.

Review applies to learners. Staff comments are created published.

Review is evaluated when a comment is written and never again. Turning it on
leaves published comments alone; turning it off does not release what is
pending.

Every comment is reviewed on its own. Approval attaches to the comment, not to
its author, so a learner is reviewed on every comment for as long as the setting
is on.

### Reports

A report never changes a comment's moderation state. Reports accumulate as
evidence and are resolved by a moderator; the state changes only when a
moderator or an automation changes it. Reporting has no effect the reporter can
observe, and no automation is present unless one is configured.

### Queue scope

The pending and reported queues scope to a course. A comment records only the
activity it attaches to; which course that activity sits in is content's fact
and can change when a course is restructured, so it is resolved when the queue
is read rather than copied onto every comment.

## Boundaries

1. **discussion → content** — discussion references the activity its comments
   attach to; content owns it and knows nothing of discussion. Which course
   an activity sits in is content's fact — discussion resolves it when scoping
   settings or a queue and never stores a copy. A course's discussion settings
   and an activity's comments state are content's too: content defines and
   writes them as part of the course, discussion reads them to decide what it
   accepts and serves. Removing an activity removes its comments, reactions and
   reports.
2. **discussion → identity** — discussion references the person's org user
   in the org on every comment, reaction and report, and reads their role from
   it. Identity owns the org user and the role; discussion stores neither.
3. **discussion → entitlements** — an activity's comments are gated by access to
   the content it attaches to. Entitlements resolves access; discussion serves
   and accepts nothing for content a person cannot open. Entitlements decides
   access; discussion decides moderation.
4. **discussion → automations** — discussion emits events; automations decides
   what follows. Notification fan-out and auto-removal of a heavily reported
   comment are configured automations, not behaviour of this domain.

## Events

- `comment.created` — a comment was posted.
- `comment.published` — a pending comment was approved.
- `comment.reported` — a comment was flagged.
- `comment.removed` — a comment's body stopped being served; names who removed
  it, so an author's removal and a moderator's are distinguishable.

Each names the comment, its author, and the activity it attaches to. Reactions,
edits and comments state changes are not evented.

## How comments accrue

A worked example for context. Discussion is enabled on a course with review off.

A student opens a video and asks a question. Access is resolved first — they
hold an active grant — and the comment is created published; `comment.created`
is emitted. The instructor replies, and because their role in the org is staff,
their reply carries an instructor badge whenever the comments are read. Another
student reacts to it; reacting the same way again changes nothing.

A third student posts something abusive and two replies land beneath it. Two
students report it. The comment stays published — reports do not change state —
and appears in the course's queue with two unresolved reports. A moderator
removes it and resolves both. Because it has replies, a placeholder is served in
its position naming a moderator as remover, and the replies below it read in
order. A student elsewhere removes their own comment; it has no replies, so it
is not served at all.

Review is then turned on for the course. The existing comments are unchanged.
The next learner's question is created pending: they see it marked as awaiting
review, nobody else does, and nobody can reply to it. The instructor's next
comment is created published. A moderator approves the question from the course
queue and `comment.published` is emitted. The same learner's next question is
pending again.

When the cohort closes, the introduction lesson's comments are set to hidden
and the rest are locked. The locked activities stay readable and accept nothing
new.
