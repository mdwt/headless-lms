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
- Comments attach to an activity — the leaf a learner opens — or, in a
  community, to a post. There are no module-level or course-level comments.
- References the activity its comments attach to (content), the person who
  wrote each comment (identity), and access to the content (entitlements).
  Does **not** own content, access, identity, or notification delivery.
- Owns a member's **follows and mutes** on posts, spaces and chats, the
  **mentions** in what members write, and the **digest ledger**.
- Defines the timed work that publishes a scheduled post and that opens a
  community's digest when it is due.

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

A comment names the person who wrote it. Learners and team write comments the
same way, and the domain records which person, not what kind of person.

An author's permissions are resolved from organizations each time comments are
read, and are never recorded on the comment. They decide three things, always
on the comment's own course or community; the course is resolved through the
activity the comment attaches to.

- **Badge** — an author who is team on the course or community carries a badge
  with the name of their role there.
- **Review** — an author who holds `courses:moderate` on the course, or
  `communities:moderate` on the community, skips review: whoever approves
  others' comments isn't held for review.
- **Moderation** — a holder of `courses:moderate` on a course moderates its
  lesson comments and sees the held and removed ones. A holder of
  `communities:moderate` on a community moderates its posts, post comments and
  messages, and moderates as a member of the community.

An author has full control of their own comments: read, revise, remove, with no
time limit and regardless of replies. Edits are not versioned. An edit is
evented, naming the people it newly mentions.
A locked activity still lets an author withdraw their own comment; it refuses a
revision.

### Review

Where the resolved settings require review, a comment is created **pending**: it
is served to its own author marked as awaiting review, and to nobody else. It is
not a reply target until it publishes. Approving it publishes it; rejecting it
removes it, recorded against the moderator.

Review applies to authors who don't skip it. A comment by someone who skips
review is created published.

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

The pending and reported queues for course comments scope to a course. A
comment on an activity records only the activity it attaches to; which course
that activity sits in is content's fact and can change when a course is
restructured, so it is resolved when the queue is read rather than copied onto
every comment. A community's post and comment flags scope to the space. Message
flags scope to the community.

## Boundaries

1. **discussion → content** — discussion references the activity its comments
   attach to, or the post's space; content owns both and knows nothing of
   discussion. Which course an activity sits in is content's fact — discussion
   resolves it when scoping settings or a queue and never stores a copy. A post
   stores the community id, because a space is not moved between communities.
   A course's discussion settings, an activity's comments state, a space's post
   defaults and a community's chat settings are content's too: content defines
   and writes them, discussion reads them to decide what it accepts and serves.
   Removing an activity removes its comments, reactions and reports. Removing a
   space removes its posts.
2. **discussion → organizations** — discussion references the person's org user
   in the org on every comment, reaction and report, and asks organizations for
   their permissions on the course or community. Organizations owns the org
   user, the roles and the permissions; discussion stores none of them.
3. **discussion → entitlements** — an activity's comments are gated by access to
   the content it attaches to. Entitlements resolves access; discussion serves
   and accepts nothing for content a person cannot open. Entitlements decides
   access; discussion decides moderation.
4. **discussion → automations** — discussion emits events; automations decides
   what follows. Notifications are automations' system process: it reads
   authors, followers, thread participants, chat participants and mutes from
   discussion to decide who an event concerns. Auto-removal of a heavily
   reported comment is a configured automation, not behaviour of this domain.

## Events

- `comment.created` — a comment was posted.
- `comment.published` — a pending comment was approved.
- `comment.reported` — a comment was flagged.
- `comment.removed` — a comment's body stopped being served; names who removed
  it, so an author's removal and a moderator's are distinguishable.
- `comment.updated` — a comment was edited; names the people it newly mentions.
- `comment.reaction.added` — a comment got its first reaction of a kind from a
  person.

Each names the comment, its author, and the activity or post it attaches to. A
comment on a post also carries the community id. A publish names everyone the
comment mentions. Later reactions of the same kind and comments state changes
are not evented.

## Community

Discussion also owns what members write inside a community.

- **Post** — what a member writes in a space: author, space, community, title,
  body, topic, status (`draft | scheduled | pending | published | removed`),
  and a cover that is an asset id. `community_id` is stored on the row. A post
  enters `pending` when the space requires review and the author doesn't hold
  `communities:moderate` on the community, and is published otherwise. `comments_closed` and `reactions_enabled` are
  null when the space default applies. `pinned` is a boolean.
- **Comment on a post** — the same comment, targeting the post, storing the
  community id, created `published`. Flags and removal moderate it.
  `requireReview` applies to posts.
- **Follow, mute, bookmark, reaction, flag** — a member's state on a post. A
  flag does not change the post. A space can be muted too.
- **Subscription** — a member's follow or mute on a post, space or chat. A
  post can be followed or muted; a space or chat only muted. A mute can end at
  a given time. A follow brings the member the post's new comments; a mute
  stops activity in the item from reaching them, except mentions, actions on
  them and moderation work.
- **Mention** — a person named in a post, comment or message, recorded when
  they are first mentioned there.
- **Feed** — the space's published posts, or the posts from every space a
  person can open. Pinned first, then newest.
- **Chat** — a private thread in one community. Every chat table carries the
  community id: the chat, its participants, its messages, attachments,
  reactions, flags, and blocks. A DM is two people, at most one per community.
  A group chat is three or more and is created open. A message request is a
  direct chat awaiting acceptance. A mute is a subscription state on the chat,
  as on a post or space, with an optional end time.
- **Block** — two people inside one community. It closes their direct chat
  there and rejects their sends in that community, including in a group chat.
  The other participants can still send. Another community is untouched.

- **Scheduled post** — a post with a time to publish. At that time it is
  published, or sent to review when the space requires it. Until then the
  author can move it, publish it now, or unschedule it back to a draft.
- **Digest ledger** — per community, the latest digest time already handled,
  so a digest goes out once per slot of the community's schedule and never for
  a slot already past.

A post's topic is a topic of its own space. A topic cannot be deleted while a
post references it.

Moderating a community needs `communities:moderate` on it: reviewing,
approving, removing, restoring, pinning and locking posts and comments,
deleting messages and reading reported attachments, locking chats, managing
space members and join requests, and resolving reports. A person is team in a
community when their role there, or their org role, is a team role; the
community's DM settings say whom team and members may message.

Events, in addition to the comment events: `post.created`, `post.updated`,
`post.published`, `post.removed`, `post.reported`, `chat.created`,
`chat.updated`, `chat.participant.added`, `message.sent`, `message.updated`,
`message.deleted`, `message.reported`, `post.reaction.added`,
`message.reaction.added` and `digest.due`. A publish names everyone a post or
message mentions, an edit only the people it newly mentions, and a reaction
event fires for a person's first reaction of a kind. `digest.due` fires when a
community's digest schedule comes round. A transition the row does not store,
such as the status a post had before it published, is
`metadata.previousStatus`. A comment on a post is created published, so of the
publishing events it emits `comment.created` only.

## How comments accrue

A worked example for context. Discussion is enabled on a course with review off.

A student opens a video and asks a question. Access is resolved first — they
hold an active grant — and the comment is created published; `comment.created`
is emitted. James, Instructor on the course, replies. He is team on the
course, so his reply carries the badge "Instructor", or the org's name for the
role, whenever the comments are read. Another student reacts to it; reacting
the same way again changes nothing.

A third student posts something abusive and two replies land beneath it. Two
students report it. The comment stays published — reports do not change state —
and appears in the course's queue with two unresolved reports. James holds
`courses:moderate` on the course, so he removes it and resolves both. Because it has replies, a placeholder is served in
its position naming a moderator as remover, and the replies below it read in
order. A student elsewhere removes their own comment; it has no replies, so it
is not served at all.

Review is then turned on for the course. The existing comments are unchanged.
The next learner's question is created pending: they see it marked as awaiting
review, nobody else does, and nobody can reply to it. James's next comment is
created published, because he holds `courses:moderate` there. He approves the
question from the course queue and `comment.published` is emitted. The same learner's next question is
pending again.

When the cohort closes, the introduction lesson's comments are set to hidden
and the rest are locked. The locked activities stay readable and accept nothing
new.
