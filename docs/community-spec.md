# Community: technical spec

Oct 20, 2026 · @Meiring

## Purpose and scope

This document is the technical specification for the community feature of Headless LMS. It defines the database tables, the ports and adapters, the domain events, the automations, the emails, and the authentication and authorization rules required to build the feature. It is written for the engineers who will implement the feature and for review before implementation starts.

The feature is described at the product level in the community exploration document. That document defines the use cases, the vocabulary, and which bounded context owns each concept. This document does not repeat those decisions except where a technical detail depends on them, and it does not change them.

The feature adds no new bounded context and no new kind of port. All tables, events and ports defined here belong to contexts that exist today: organizations, identity, content, entitlements, discussion, progress, automations, reporting and assets. Events (the content type) appear in the use cases as a future content type. They are not designed in this document.

The document has the following sections: use cases; model and ownership; data model; ports and adapters; domain events; automations; emails; security and authorization.

## Use cases

This section lists the use cases the design must support. They are taken from the community exploration document. Each use case gives the organization, the products it sells, the spaces of its community with their access rules, and the DM settings. The names in the trees are the names used for tables and columns in the data model section.

**A course cohort.** Spanish in 90 Days sells a 12-week course. The community is sold with it in a bundle, so every student is a member for the length of the cohort. Spaces follow the course: announcements, one per skill, one to ask the tutor, and a small opt-in space to find a speaking partner.

```
Org: Spanish in 90 Days
├─ Course: Spanish in 90 Days
├─ Community: Spring cohort
│    ├─ Space: Announcements        all members, posts reviewed before publishing
│    ├─ Space: Practice             all members                    topics: Speaking, Writing, Listening
│    ├─ Space: Ask the tutor        all members                    links: Spanish in 90 Days
│    └─ Space: Speaking partners    by request, at most 10 people
└─ Bundle: Spring cohort   (the course and the community)
DMs: on, members may message members, a first message is a request
```

**A free community around a creator.** Maker's Lounge is free. An automation grants the community to everyone who joins the org, so signing up makes a person a member. Spaces are organized by what people come to do.

```
Org: Maker's Lounge
├─ Event: Monthly meetup                  (future content type, not designed here)
├─ Community: Maker's Lounge
│    ├─ Space: Show your work       all members
│    ├─ Space: Feedback             all members                    topics: Landing page, Pricing, Product
│    ├─ Space: Jobs                 by invite, moderated by a member
│    └─ Space: Meetups              all members                    links: Monthly meetup
└─ Automation: grant Maker's Lounge when a person joins the org
DMs: on, members may message members, no request step, group chats allowed
```

**A coaching program.** Leadership Circle sells a six-month program: a community, a monthly group call and pods of six. Each pod is its own by-invite space, capped at six.

```
Org: Leadership Circle
├─ Event: Monthly group call, Pod Red call, Pod Blue call   (future content type)
├─ Community: Leadership Circle
│    ├─ Space: General              all members                    links: Monthly group call
│    ├─ Space: Pod Red              by invite, at most 6 people    links: Pod Red call
│    └─ Space: Pod Blue             by invite, at most 6 people    links: Pod Blue call
└─ Bundle: Leadership Circle   (the community and the monthly group call)
DMs: on, members may message staff only, group chats off
```

**Founder Collab.** This is the reference use case. The exploration document walks through it in eighteen steps: Rachel is the owner, Emma is an instructor, Sarah and James are members, James moderates two spaces, and Tom holds only the course. The tables, events and emails in this document are checked against those steps.

```
Org: Founder Collab                    staff: Rachel (owner), Emma (instructor)
├─ Course: Fundraising 101
├─ Event: Monthly founders call       (future content type)
├─ Community: Founder Collab Community
│    ├─ Space: Announcements    all members      posts reviewed before publishing, comments off
│    ├─ Space: Introductions    all members
│    ├─ Space: General          all members      topics: Growth, Fundraising, Other
│    │                                           links: Fundraising 101, Monthly founders call
│    ├─ Space: Wins             all members      comments on, reactions on
│    ├─ Space: SaaS founders    by request, at most 12 people     topics: Growth, Pricing, Other
│    │                                           moderator: James (a member)
│    └─ Space: Hiring           by invite        moderator: James
│    DM settings: on; members may message members; first message is a request; group chats on, up to 8
├─ Bundle: Founder Collab Membership   (the community, Fundraising 101 and the monthly founders call)
└─ Automations
     ├─ when a person is granted the community → send the welcome email
     ├─ when a post is published in SaaS founders → email its space members
     └─ when a post is published in Announcements → email every member
```

## Model and ownership

This section lists every term used in this document with the context that owns it. The ownership follows the exploration document. A context reads another context's data only through that context's public interface. No data is copied between contexts. Private messaging uses three terms throughout this document. A chat is a private thread between members of one community. A DM is a chat between two people; a group chat is a chat between three or more. A message is one message sent in a chat.

| Term | Owner | Definition |
| --- | --- | --- |
| Community | content | A content type beside course and download; a product the org sells or gives away |
| Space | content | Part of the community's structure: name, order, access rule, capacity, topics, links, post defaults |
| Topic | content | A subject defined on a space; a post in that space carries one |
| Link | content | A space pointing at a resource (course, download, community); opening it needs a grant |
| Post defaults | content | Per space: comments on, reactions on, review before publishing; discussion reads them |
| DM settings | content | Per community: whether chats are on, who may message whom, whether a first message is a request, whether group chats are allowed and their size; discussion reads them |
| Bundle | content | Products sold together; a grant to it opens every product in it |
| Grant | entitlements | One person's access to one product or bundle; the only access path |
| Member | entitlements | Not a record and not a role: anyone holding a grant to the community |
| Space member | entitlements | A grant to one space, held on top of the grant to the community; exists only for a by-request or by-invite space, with a status: requested, invited or active |
| Staff | organizations | Owner, admin, instructor; open and moderate everything without a grant |
| Space moderator | organizations | The moderator role, held for one space; organizations stores who holds it |
| Profile | identity | What others see of a person |
| Post | discussion | What a member writes in a space: title, body, topic, status, extra fields |
| Comment | discussion | The existing comment, now targeting an activity or a post |
| Reaction | discussion | An emoji on a post, comment or message |
| Flag | discussion | The existing report, now on a post, comment or message; queue per space, per community for messages |
| Follow, bookmark | discussion | A member's state on a post |
| Feed | discussion | Space feed (the space's posts) and member feed (posts from every space the person can open) |
| Chat | discussion | A private thread in one community; either a DM (two people) or a group chat (three or more) |
| DM | discussion | A chat between two people; two people have at most one DM |
| Group chat | discussion | A chat between three or more people |
| Message | discussion | One message sent in a chat |
| Message request | discussion | A DM whose recipient has not yet accepted it |
| Read position, mute | discussion | Per participant per chat |
| Block | discussion | One person stopping another from messaging them; checked on every send |
| Directory | reporting (composed) | Grants (entitlements) plus roles (organizations) plus profiles (identity); a composed read served from reporting's learn surface, which owns no data |
| Analytics | reporting | Staff-only reads across the contexts; owns no data |
| Files | assets | Post images, message attachments, profile photos |

## Data model

This section specifies the database tables. The feature adds eighteen tables, changes three existing tables and renames one. The section has two parts. Part 1 covers the structure of a community and access to it, in the content, organizations, entitlements and identity contexts. Part 2 covers what members write, in the discussion context. Each part starts with a diagram. Each table then has a description of its purpose and the SQL that creates it.

All tables follow the conventions of the existing schema in `adapters/db/src/schema`. Every row carries `org_id`, and the primary key is `(org_id, id)`. Ids are text values made of a prefix and a KSUID, for example `spc_2HkY…`. Every table has `created_at` and `updated_at`. Enum columns are `text`; the allowed values are enforced in application code and are listed in a comment in the SQL. Foreign keys between org-owned tables include `org_id` on both sides. A foreign key cascades on delete where the child row is part of the parent. It does not cascade where it references a row owned by another context, such as a file in assets. There is no soft delete: a removed post keeps its row with status `removed`, as a removed comment does today.

![The whole model after the feature](diagrams/full-model-after-community.png)

The diagram shows every table the system has after the feature, grouped by the context that owns it. Filled boxes are new; dashed borders mark existing tables that change. The two parts that follow zoom into the new and changed tables.

### Part 1: structure and access

![Data model, part 1: structure and access](diagrams/data-model-part-1-structure-and-access.png)

In the diagram, arrows point from a row to the row it belongs to. The highlighted boxes are the two new aggregates, the community and the space. The dashed zones are contexts. A grant references the content registry, a bundle or a space; a grant to a space is a row in the same table as every other grant.

#### content\_items

The registry table `content_items` has one row per piece of content and a `type` column with the values `course` and `download`. Grants, bundle items and space links reference registry rows. The change adds `community` to the allowed values of `type`. No other change to the registry is required. Grants to communities and communities in bundles work without changes to the `entitlements` and `bundle_items` tables.

```sql
alter table content_items drop constraint content_items_type_check;
alter table content_items add constraint content_items_type_check
  check (type in ('course', 'download', 'community'));
```

#### communities

The `communities` table holds one row per community. It is built the same way as `courses`: the row has the same id as its registry row, a generated `type` column fixed to `community`, and a foreign key over `(org_id, id, type)` to the registry. Deleting the registry row deletes the community row.

The community's DM settings are stored in the shared `settings` table, in a row with namespace `content` and the community id as scope, in the same way as a course's settings. The row holds whether DMs are enabled, who may message whom, whether a first message is a request, whether group chats are allowed, and the maximum group size. Content is the only writer of this row, through its community settings update, the counterpart of the course settings update. Discussion reads the row before each chat operation.

```sql
create table communities (
  org_id              text not null references organizations(id),
  id                  text not null,                       -- cmy_...
  type                text not null generated always as ('community') stored,
  title               text not null,
  slug                text not null,
  description         text not null default '',
  status              text not null default 'draft',       -- draft | published
  thumbnail_asset_id  text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  primary key (org_id, id),
  unique (org_id, slug),
  foreign key (org_id, id, type) references content_items(org_id, id, type) on delete cascade,
  foreign key (org_id, thumbnail_asset_id) references assets(org_id, id)
);
```

The structure of the settings row, with the default values:

```
settings(org_id, namespace = 'content', scope_id = <community id>).value = {
  dm: {
    enabled: true,
    memberToMember: true,
    memberToStaff: true,
    staffToAnyone: true,
    firstMessageIsRequest: true,
    groupChats: true,
    groupSize: 8
  }
}
```

#### spaces

The `spaces` table holds one row per space. A space belongs to one community. It has a name, a description, a position in the community's list, an access rule, an optional capacity, and the default settings for posts in it. The access rule is one of `all_members`, `by_request` and `by_invite`. The capacity applies only to `by_request` and `by_invite` spaces, which a check constraint enforces.

The post defaults are stored in the `settings` column of the space row as `{ comments, reactions, requireReview }`, with the defaults `true`, `true` and `false`. This matches how an activity stores its settings on its own row. Content owns the column. Discussion reads it when a post is created.

```sql
create table spaces (
  org_id        text not null references organizations(id),
  id            text not null,                              -- spc_...
  community_id  text not null,
  name          text not null,
  description   text not null default '',
  seq           integer not null,                           -- display order within the community
  access_rule   text not null default 'all_members',        -- all_members | by_request | by_invite
  capacity      integer,                                    -- null = unlimited; only for by_request and by_invite
  settings      jsonb not null default '{}',                -- { comments, reactions, requireReview }
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (org_id, id),
  foreign key (org_id, community_id) references communities(org_id, id) on delete cascade,
  constraint spaces_capacity_check check (capacity is null or access_rule <> 'all_members')
);
create index spaces_order_idx on spaces (org_id, community_id, seq);
```

#### space\_topics

The `space_topics` table holds the topics defined on a space. Where a space defines topics, each post in that space carries one, and the space feed can be filtered by topic. A space without topics has posts without a topic. Topics are deleted with their space.

```sql
create table space_topics (
  org_id      text not null references organizations(id),
  id          text not null,                                -- top_...
  space_id    text not null,
  name        text not null,
  seq         integer not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (org_id, id),
  unique (org_id, space_id, name),
  foreign key (org_id, space_id) references spaces(org_id, id) on delete cascade
);
```

#### space\_links

The `space_links` table holds the resources a space shows. A link references a content registry row, so a course, a download or another community can be linked. A link does not grant access; opening the linked resource requires a grant to it. A link is deleted when its space or its resource is deleted.

```sql
create table space_links (
  org_id      text not null references organizations(id),
  id          text not null,                                -- slk_...
  space_id    text not null,
  content_id  text not null,                                -- any registry row: course, download, community
  seq         integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (org_id, id),
  unique (org_id, space_id, content_id),
  foreign key (org_id, space_id) references spaces(org_id, id) on delete cascade,
  foreign key (org_id, content_id) references content_items(org_id, id) on delete cascade
);
```

The `bundles` and `bundle_items` tables do not change. A bundle holds a community by its registry id.

#### space\_moderators

The `space_moderators` table records that an org user moderates a space. It holds the moderator role. Moderator is a role held for one space, and org\_users holds one org-wide role per person, so the moderator role is stored here with the space it applies to. The person's org-wide role does not change. The route guard reads this table once per request to build the actor, as the security section specifies. A row is deleted when its space or its org user is deleted.

```sql
create table space_moderators (
  org_id       text not null references organizations(id),
  org_user_id  text not null,
  space_id     text not null,
  assigned_by  text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (org_id, org_user_id, space_id),
  foreign key (org_id, org_user_id) references org_users(org_id, id) on delete cascade,
  foreign key (org_id, space_id)    references spaces(org_id, id)    on delete cascade,
  foreign key (org_id, assigned_by) references org_users(org_id, id)
);
create index space_moderators_space_idx on space_moderators (org_id, space_id);
```

The org-wide roles stay `owner`, `admin`, `instructor`, `student`. Moderator is a role held for one space; it is stored in `space_moderators`, not on `org_users`. Member is not a role. The `org_users`, `invites` and `users` tables do not change.

#### entitlements

The `entitlements` table holds every grant, and a grant to a space is a grant like any other. Today a row targets a bundle or a content item; it gains a third target, `space_id`. A grant to a community is a row whose `content_id` is the community's registry id, or a bundle grant whose bundle contains that id. A member is a person who holds such a grant. There is no member table. A space grant is a row whose `space_id` is set, and it is checked on top of the community grant, never instead of it.

A space grant exists only for a `by_request` or `by_invite` space. The `status` column gains two values for it. A request to join creates a grant with status `requested`; approval sets it to `active`. An invitation creates a grant with status `invited`; acceptance sets it to `active`. Declining a request, refusing an invitation and leaving a space delete the grant. Removal by staff or a moderator sets it to `revoked`, as revoking any grant does today. The `source` column records how the grant was made, as it does today: `request`, `invite` or `manual`. No grant exists for an `all_members` space; the grant to the community is enough.

Capacity is not stored as a count. On approval or acceptance the service locks the space row, counts the space's grants with status `active`, and rejects the operation when the count equals the capacity. The lock and the count run in the same transaction as the status change.

```sql
alter table entitlements add column space_id text;                        -- the third target
alter table entitlements add foreign key (org_id, space_id) references spaces(org_id, id) on delete cascade;
alter table entitlements add unique (org_id, org_user_id, space_id);      -- one grant per person per space
alter table entitlements drop constraint entitlements_target_check;
alter table entitlements add constraint entitlements_target_check
  check (num_nonnulls(bundle_id, content_id, space_id) = 1);              -- exactly one target
alter table entitlements add constraint entitlements_status_check
  check (status in ('active', 'revoked') or space_id is not null);        -- requested | invited are space-only
create index entitlements_space_idx on entitlements (org_id, space_id, status);
```

Two lookups are extended for the new content type: the title lookup in the entitlements repository, and the content lookup the mailer uses.

#### user\_profiles

The `user_profiles` table holds the profile other members see. The `users` table holds a first name, a last name and an email, and the avatar comes from the Better Auth user record. This table adds a display name, a headline, a bio, an image URL, and an `extra` JSON column for fields the application defines. It is global like `users`: one profile per person. The query that loads comment authors is extended with these columns and is reused for post authors, message senders and the directory.

```sql
create table user_profiles (
  user_id       text primary key references users(id) on delete cascade,
  display_name  text,                                       -- falls back to first + last name
  headline      text,                                       -- the line about their company
  bio           text,
  image_url     text,                                       -- falls back to the auth user's image
  extra         jsonb not null default '{}',                -- whatever else the app shows
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
```

### Part 2: what members write

![Data model, part 2: what members write](diagrams/data-model-part-2-what-members-write.png)

Discussion owns comments, comment reactions and comment flags today. The feature adds two aggregates to it: the post, which belongs to a space, and the chat, which belongs to a community. A chat is a private thread between members: a DM when it is between two people, a group chat when it is between three or more. A message is one message sent in a chat. The other tables in this part each hold rows attached to a post, a chat or a message. Where a table holds the same kind of row as an existing comment table, it has the same shape as that table.

#### comments and comment\_flags

A comment on a post is the same entity as a comment on an activity. The `comments` table is changed so that a comment references either an activity or a post. The `activity_id` column becomes nullable, a nullable `post_id` column is added, and a check constraint requires exactly one of the two to be set. A comment on a post is deleted when the post is deleted. A new index supports listing a post's comments.

```sql
alter table comments alter column activity_id drop not null;
alter table comments add column post_id text;
alter table comments add constraint comments_post_fk
  foreign key (org_id, post_id) references posts(org_id, id) on delete cascade;
alter table comments add constraint comments_target_check
  check (num_nonnulls(activity_id, post_id) = 1);
create index comments_post_idx on comments (org_id, post_id, status, created_at);
```

The `comment_reports` table is renamed to `comment_flags`. It gains a `resolution` column with the values `dismissed` and `removed`, set together with `resolved_at`, and a `resolved_by` column holding the moderator's org user id. The id prefix `crp` does not change. The `comment_reactions` table does not change.

```sql
alter table comment_reports rename to comment_flags;
alter table comment_flags add column resolution text;        -- dismissed | removed
alter table comment_flags add column resolved_by text;
alter table comment_flags add constraint comment_flags_resolved_check
  check ((resolved_at is null) = (resolution is null) and (resolved_at is null) = (resolved_by is null));
```

#### posts

The `posts` table holds one row per post. A post has an author, a space, a title, a body, an optional topic and a status. The status values are `draft`, `scheduled`, `pending`, `published` and `removed`. `pending` means awaiting review; it is the value `comments.status` uses for the same state. A post moves from `draft` or `scheduled` to `pending` when the space requires review and the author is not staff, and to `published` otherwise. Staff or the space's moderator move a published post to `removed`.

A post carries three per-post overrides: `pinned`, `comments_closed` and `reactions_enabled`, where null means the space default applies. The `extra` column holds application-defined fields, such as a cover image asset id. A removed post keeps its row and its comments.

```sql
create table posts (
  org_id             text not null references organizations(id),
  id                 text not null,                            -- pst_...
  space_id           text not null,
  org_user_id        text not null,                            -- the author
  topic_id           text,
  title              text not null,
  body               text not null,                            -- rich content as the app sends it
  extra              jsonb not null default '{}',
  status             text not null default 'draft',           -- draft | scheduled | pending | published | removed
  scheduled_at       timestamptz,
  published_at       timestamptz,                              -- set once, on first publish
  removed_by         text,
  pinned             boolean not null default false,
  comments_closed    boolean not null default false,
  reactions_enabled  boolean,                                  -- null = the space's default
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  primary key (org_id, id),
  foreign key (org_id, space_id)    references spaces(org_id, id)       on delete cascade,
  foreign key (org_id, org_user_id) references org_users(org_id, id),
  foreign key (org_id, topic_id)    references space_topics(org_id, id) on delete set null,
  foreign key (org_id, removed_by)  references org_users(org_id, id),
  constraint posts_removed_by_check check ((status = 'removed') = (removed_by is not null)),
  constraint posts_scheduled_check  check (status <> 'scheduled' or scheduled_at is not null)
);
create index posts_feed_idx   on posts (org_id, space_id, status, published_at desc);
create index posts_due_idx    on posts (org_id, status, scheduled_at);
create index posts_author_idx on posts (org_id, org_user_id);
```

The table has three indexes. `posts_feed_idx` serves the feeds, which read by space, status and publish time. `posts_due_idx` serves the Publish due posts automation, which reads posts with status `scheduled` whose time has passed. `posts_author_idx` serves a member's own post list.

#### post\_reactions, post\_follows, post\_bookmarks

These three tables each hold one row per person per post. `post_reactions` holds an emoji and has the same shape as `comment_reactions`; a person's reaction is replaced when they change it. `post_follows` records that a person wants to be notified of new comments on the post. `post_bookmarks` records that a person saved the post. Follows and bookmarks are separate tables because different operations read them: the comment notification reads follows, and the member's saved list reads bookmarks.

```sql
create table post_reactions (
  org_id       text not null references organizations(id),
  post_id      text not null,
  org_user_id  text not null,
  emoji        text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (org_id, post_id, org_user_id),
  foreign key (org_id, post_id)     references posts(org_id, id)     on delete cascade,
  foreign key (org_id, org_user_id) references org_users(org_id, id) on delete cascade
);

create table post_follows   (like post_reactions including all);   -- without the emoji column
create table post_bookmarks (like post_reactions including all);   -- without the emoji column
```

#### post\_flags

The `post_flags` table holds flags on posts and has the same shape as `comment_flags`. A person can flag a post once. A flag is open until a moderator resolves it, and the resolution is recorded on the row. The moderation queue of a space consists of the open rows in `post_flags` and `comment_flags` for that space's posts.

```sql
create table post_flags (
  org_id       text not null references organizations(id),
  id           text not null,                                  -- pfl_...
  post_id      text not null,
  org_user_id  text not null,                                  -- who flagged
  reason       text not null default '',
  resolved_at  timestamptz,
  resolution   text,                                           -- dismissed | removed
  resolved_by  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (org_id, id),
  unique (org_id, post_id, org_user_id),
  foreign key (org_id, post_id)     references posts(org_id, id) on delete cascade,
  foreign key (org_id, org_user_id) references org_users(org_id, id),
  constraint post_flags_resolved_check
    check ((resolved_at is null) = (resolution is null) and (resolved_at is null) = (resolved_by is null))
);
create index post_flags_open_idx on post_flags (org_id, post_id, resolved_at);
```

#### chats

The `chats` table holds one row per chat. A chat belongs to a community and is deleted with it. The `kind` column is `direct` for a DM between two people and `group` for a group chat of three or more. The people in a chat are rows in `chat_users`, for a DM and a group chat alike; nothing on the `chats` row names them.

![Chat model](diagrams/chat-model.png)

Two people have at most one DM between them. The rule is enforced in the service, not by a constraint: starting a DM looks for an existing chat of kind `direct` whose `chat_users` rows are exactly these two people, inside the transaction that would create the new one, under an advisory lock on the two org user ids in sorted order. If one exists it is returned; otherwise the chat and its two `chat_users` rows are created.

The `status` column holds the message request state. When the community's DM settings make a first message a request, a new DM has status `pending` until the recipient accepts it, after which it is `open`. A block sets the status to `closed`. Staff can lock a chat; a locked chat is readable, and no participant can send to it.

```sql
create table chats (
  org_id        text not null references organizations(id),
  id            text not null,                                 -- cht_...
  community_id  text not null,
  kind          text not null,                                 -- direct | group
  status        text not null default 'open',                  -- pending | open | closed
  created_by    text not null,
  locked_at     timestamptz,
  locked_by     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (org_id, id),
  foreign key (org_id, community_id) references communities(org_id, id) on delete cascade,
  foreign key (org_id, created_by)   references org_users(org_id, id),
  foreign key (org_id, locked_by)    references org_users(org_id, id),
  constraint chats_locked_check check ((locked_at is null) = (locked_by is null))
);
```

#### chat\_users

The `chat_users` table links a chat to the people in it and holds each person's own state: when they joined, when they left, the last message they read, and whether they have muted the chat. The unread count is the number of messages after the participant's last read message that they did not send. A participant who leaves keeps the row with `left_at` set.

```sql
create table chat_users (
  org_id                text not null references organizations(id),
  chat_id               text not null,
  org_user_id           text not null,
  joined_at             timestamptz not null default now(),
  left_at               timestamptz,
  last_read_message_id  text,
  muted_until           timestamptz,                          -- null = not muted; 'infinity' = until unmuted
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  primary key (org_id, chat_id, org_user_id),
  foreign key (org_id, chat_id)     references chats(org_id, id)     on delete cascade,
  foreign key (org_id, org_user_id) references org_users(org_id, id) on delete cascade
);
create index chat_users_user_idx on chat_users (org_id, org_user_id);
```

#### messages

The `messages` table holds the messages sent in a chat. A message has a sender, a body, an optional reference to the message it replies to, and timestamps for edits and deletion. A deleted message keeps its row with `deleted_at` set; the service serves it with an empty body as a placeholder.

```sql
create table messages (
  org_id       text not null references organizations(id),
  id           text not null,                                  -- msg_...
  chat_id      text not null,
  org_user_id  text not null,                                  -- the sender
  body         text not null,
  reply_to_id  text,
  edited_at    timestamptz,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (org_id, id),
  foreign key (org_id, chat_id)     references chats(org_id, id) on delete cascade,
  foreign key (org_id, org_user_id) references org_users(org_id, id),
  foreign key (org_id, reply_to_id) references messages(org_id, id)
);
create index messages_chat_idx on messages (org_id, chat_id, created_at);
```

#### message\_attachments, message\_reactions, message\_flags

Three tables hold rows attached to a message. `message_attachments` links a message to files in assets, one row per file, in the same way `activity_assets` links an activity to its files; the foreign key to assets does not cascade. `message_reactions` has the same shape as `post_reactions`. `message_flags` has the same shape as `post_flags`, with the resolution values `dismissed`, `deleted` and `locked`. The community's message queue consists of the open rows in `message_flags` for chats in that community and is visible to staff only.

```sql
create table message_attachments (
  org_id      text not null references organizations(id),
  message_id  text not null,
  asset_id    text not null,
  seq         integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (org_id, message_id, asset_id),
  foreign key (org_id, message_id) references messages(org_id, id) on delete cascade,
  foreign key (org_id, asset_id)   references assets(org_id, id)
);

create table message_reactions (
  org_id       text not null references organizations(id),
  message_id   text not null,
  org_user_id  text not null,
  emoji        text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (org_id, message_id, org_user_id),
  foreign key (org_id, message_id)  references messages(org_id, id)  on delete cascade,
  foreign key (org_id, org_user_id) references org_users(org_id, id) on delete cascade
);

create table message_flags (
  org_id       text not null references organizations(id),
  id           text not null,                                  -- mfl_...
  message_id   text not null,
  org_user_id  text not null,
  reason       text not null default '',
  resolved_at  timestamptz,
  resolution   text,                                           -- dismissed | deleted | locked
  resolved_by  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (org_id, id),
  unique (org_id, message_id, org_user_id),
  foreign key (org_id, message_id)  references messages(org_id, id) on delete cascade,
  foreign key (org_id, org_user_id) references org_users(org_id, id),
  constraint message_flags_resolved_check
    check ((resolved_at is null) = (resolution is null) and (resolved_at is null) = (resolved_by is null))
);
create index message_flags_open_idx on message_flags (org_id, message_id, resolved_at);
```

#### blocked\_users

The `blocked_users` table records that one person has blocked another, one row per direction. The service checks the table in both directions before a message is sent and before a person is added to a group chat. The blocked person is not notified. The row is keyed by org, so a block applies in every community the two people share.

```sql
create table blocked_users (
  org_id               text not null references organizations(id),
  blocker_org_user_id  text not null,
  blocked_org_user_id  text not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  primary key (org_id, blocker_org_user_id, blocked_org_user_id),
  foreign key (org_id, blocker_org_user_id) references org_users(org_id, id) on delete cascade,
  foreign key (org_id, blocked_org_user_id) references org_users(org_id, id) on delete cascade
);
create index blocked_users_blocked_idx on blocked_users (org_id, blocked_org_user_id);
```

#### Feeds

There is no table for feeds. The space feed is a query over `posts` for one space: published posts, newest first, optionally filtered by topic. The member feed is the same query over the spaces that entitlements reports the person can open. Both queries use `posts_feed_idx` and paginate on `(published_at, id)`.

```sql
-- space feed
select * from posts
 where org_id = $org and space_id = $space and status = 'published'
   and ($topic is null or topic_id = $topic)
 order by published_at desc, id desc
 limit 20;

-- member feed: $spaces is the list entitlements returns for this person
select * from posts
 where org_id = $org and space_id = any($spaces) and status = 'published'
 order by published_at desc, id desc
 limit 20;
```

### Other contexts

The progress, automations, reporting and assets contexts get no new tables. The `kind` column of `assets` gains the value `image`, used for post covers, message attachments and profile photos. The `automations` table gains two columns, specified in the automations section. Reporting stores no data.

### Migration

The schema changes ship as one Drizzle migration, generated after all schema files are updated. Three statements are added by hand at the top of the migration because drizzle-kit does not generate them: the rename of `comment_reports` to `comment_flags`, dropping the not-null constraint on `comments.activity_id`, and replacing `entitlements_target_check`.

### Delete behaviour

Deleting a community deletes its registry row. The cascade removes the community row, its spaces, and from the spaces the topics, links, space grants, moderator assignments and posts; from the posts the comments, reactions, flags, follows and bookmarks; from the community the chats, chat users, messages, message reactions, message flags and attachment links; and every grant to the community. Deleting an org user deletes their grants, including space grants, their moderator assignments, chat user rows and blocks. Their posts, comments and messages are kept under their org user id. Files in assets are not deleted by any cascade; a file must be unlinked before assets can delete it.

## Ports and adapters

This section specifies the ports each context adds and the adapters that implement them. A port is an interface defined in the core. Each context defines four kinds in its `ports.ts`: the operations it offers (its service interface), the persistence it requires (its repository), the reads it requires from other contexts (readers), and its write scope (the repository together with the outbox, used inside one transaction). The feature adds no new kind of port and no new adapter package. Each affected context extends its own `ports.ts`.

![Request flow: route guard, context, outbox, relay, automations, email](diagrams/architecture-request-flow.png)

The diagram shows the path of a community request. The route guard authenticates the request and builds the actor. It calls one operation on one context. The context performs its authorization checks, reads what it needs from other contexts through their readers, writes its rows and its events in one transaction, and returns. The relay publishes the events from the outbox to the bus. Automations subscribes to the bus. Schedule triggers on automations are new and are specified below.

### Actor

The actor identifies who is performing an operation. Today discussion defines it with two facts: the org user id and the org role. It moves to the shared core so that every context reads the same actor, and it gains a third fact: the spaces the person moderates. The route guard fills that on every request by reading the moderator assignments through organizations. The value is not stored on any row. When a moderator assignment is removed, the person loses the moderator permissions on their next request.

### Schedule triggers

Two things in the feature happen on a timer rather than in response to a user action: a scheduled post publishes at its time, and a grant expires at its expiry. The system has no timer today: the `entitlement.expired` event is defined but never emitted, and automations has only event triggers. This design adds a second trigger kind to automations, the schedule trigger, so that timed work is an automation like any other: visible in the dashboard, enabled and disabled there, and audited in the run history. This is what the exploration document calls automations firing a time trigger. No new port is added for it.

A schedule trigger is a trigger string of the form `schedule:<cron expression>`, stored in the existing `triggers` column of `automations`. The automation engine fires it: the Hatchet engine registers a cron for every enabled automation that has a schedule trigger, and the inline engine uses a timer. When a schedule fires, the engine opens a run with a synthetic event of type `automation.schedule.fired`, whose data holds the automation id and the firing time, and executes the automation's actions. Runs are deduplicated per automation and firing time, as event runs are deduplicated per automation and event id.

```
triggers: ['schedule:* * * * *']        -- every minute
triggers: ['schedule:0 * * * *']        -- every hour
triggers: ['schedule:0 7 * * *']        -- daily at 07:00 in the org's timezone
```

Three system actions are added for the timed work, named here by what they do. Each calls one operation on the context that owns the work. Publish due posts calls discussion, which selects posts with status `scheduled` and a `scheduled_at` in the past and submits each one as if the author had submitted it. Expire due grants calls entitlements, which selects grants with an `expires_at` in the past that have not yet been expired and emits `entitlement.expired` once for each. Send digest calls discussion, which emits `discussion.digest.due` once per community. Each operation writes through its context's unit of work, so the events it produces go through the outbox like any other event.

Three system automations use these actions. They are seeded for every org on `organization.created` with `source = system`, and can be disabled but not deleted: Publish due posts (`schedule:* * * * *`), Expire due grants (`schedule:0 * * * *`), and Digest (`schedule:0 7 * * *`).

### content

Content adds the operations used to set up a community: create, update, publish, unpublish and delete a community; patch the community settings, which hold the DM settings; create, update, delete and reorder spaces; set a space's topics; add, remove and reorder a space's links; and the reads that list and fetch communities and spaces. Each write runs in content's existing unit of work, so the row and the `content.*` event commit together.

Content serves one reader to other contexts. It returns one space (community id, access rule, capacity, post defaults, topics), lists the spaces of a community, and returns a community's DM settings resolved over the defaults, the same way a course's comment settings are resolved today. Entitlements uses it to evaluate access to a space. Discussion uses it to apply post defaults, to validate a post's topic, and to read the DM settings when a chat is started, when a participant is added and when a message is sent.

### organizations

Organizations owns roles. Community adds one role, moderator, which is held for a specific space rather than across the org. An owner or admin makes an org user the moderator of a space, and the person keeps their org role alongside it.

Owners and admins give and remove this role (`manage_users`), and organizations lists who holds it for each space. Organizations also answers, for one org user, which spaces they hold the moderator role for. The route guard asks this once per request and passes the answer into core together with the caller's org user id and org-wide role. What a moderator may do in a space is decided by the context that owns the operation; organizations only records who holds the role.

### entitlements

Entitlements already answers whether an org user holds an active grant to a registry item, directly or through a bundle. Community uses that to check a person's grant to a community. Entitlements also performs the expiry of due grants, which the Expire due grants automation calls.

Entitlements gains the space grant operations: request to join, invite, accept an invitation, approve, decline, leave, remove, and list a space's grants. They are grant operations on the existing repository and write scope, and they emit the existing entitlement events. Capacity is enforced inside approve and accept under a row lock, as the data model section specifies.

Entitlements serves a reader to discussion and reporting that answers three questions: whether a person is a member of a community, whether a person can open a space, and which spaces of a community a person can open. The rule for opening a space is defined here and nowhere else: an `all_members` space requires a grant to the community; a `by_request` or `by_invite` space requires, on top of that, a space grant with status `active`; staff and the space's moderators pass without either. To evaluate the rule, entitlements reads the space through content's reader.

### discussion

Discussion keeps its comment operations; posting a comment and the flag and queue operations take a target that is either an activity or a post. It adds the post operations: create a draft, update, submit, schedule, approve, remove, restore, pin, unpin, close comments, open comments, set a reaction, follow, unfollow, bookmark, unbookmark, flag, resolve flags, read the space feed, read the member feed, read one post, read a space's moderation queue, and the publishing of due posts, which the Publish due posts automation calls. It adds the chat operations: start a DM, start a group chat, add a participant, leave, accept a message request, send, edit and delete a message, set a reaction, mark as read, mute, unmute, block, unblock, flag a message, resolve message flags, lock and unlock a chat, list a person's chats, read a chat's messages, and read the community's message queue.

The post and chat operations share the actor and the readers. From entitlements they use the access reader on every post write and every feed read. From content they use the community reader for post defaults, topics and the DM settings. For author and sender display they use the profile query that comment authors use today, extended with the profile columns. Each aggregate has its own repository and its own write scope with the outbox; a post write and a chat write never share a transaction.

### identity

Identity adds two operations, read a profile and update a profile, and a repository over `user_profiles`. A person can update only their own profile.

### reporting

Reporting has a learner-facing module, `reporting/learn`, which composes reads across contexts for the student portal. The two member-facing composed reads of the community are added to it: the directory, which joins the community's grants from entitlements, each person's role from organizations and their profile from identity; and the community home, which lists the spaces a person can open with their counts. This is the implementation of the exploration document's statement that no context owns the directory: it is a composed read with no data of its own. Staff analytics are added as a new module, `reporting/community`: member count, active members, posts per space, comments per post, messages sent, flags raised and resolved, grants lapsed and renewed.

### Adapters

The database adapter gains the schema files specified in the data model section and one repository per new aggregate: posts, chats and profiles. The content, organizations and entitlements repositories are extended for communities, spaces, topics, links, moderators and space grants. Each repository has the existing structure: a constructor that takes the database executor and a logger, and the shared error translation. The inline automation engine in the defaults adapter gains a timer for schedule triggers; the Hatchet engine registers them as crons. The email templates adapter gains the templates listed in the emails section. The auth adapter, the workflow adapter and the email transport adapters do not change.

### Wiring

The composition root in `packages/server/src/app/container.ts` wires the new services in the same way as discussion today: a repository on the root database for reads, a unit of work that builds the repository and the outbox appender on a transaction for writes, and readers passed as whole service instances. Entitlements is passed to discussion and reporting as the access reader, the same way it is passed as the course access reader today. Content is passed to entitlements and discussion as the community reader. The automation engine registers the schedule triggers of the enabled automations when it starts.

### HTTP routes

The API remains schema-first and the SDK remains generated from the OpenAPI document. The routes are in three groups. Staff routes under `/api/communities` set up communities, spaces, topics, links, DM settings and moderators; they use `resolveScope`. Member routes under `/api/learn/communities` and `/api/learn/chats` cover feeds, posts, comments, space grants, the directory and chats; they use `requireOrgSession` and pass the org user as the actor. Moderator actions use the member routes; core decides from the actor's moderated spaces whether the caller may perform them. Every handler consists of a schema and one core call.

## Domain events

This section specifies the domain events the feature adds. A domain event is a record that something happened in a context, such as a post being published or a grant expiring. The feature adds twenty-one events, extends the data of the four comment events with `postId` and of the four entitlement events with `spaceId`, and renames none. All of them are defined, stored and delivered in the same way as the existing events, and the event pipeline does not change. The section first describes the pipeline, then lists the events by owning context with when each fires, who causes it, what it carries, and whether it may leave the system.

![From a submitted post to an email](diagrams/event-flow-published-post.png)

### How an event travels

A context's service appends an event to the `event_outbox` table in the same transaction as the row the event describes. Services do not publish events directly. The outbox relay polls the table, hands each event to the in-memory event bus, and marks the event processed. If a subscriber throws, the relay records the failure and retries the event later with exponential backoff, up to ten attempts. The automations service subscribes to every event; it loads the enabled automations whose trigger matches the event type and whose filter matches the event data, and starts one run per automation. A run executes its actions in order. The run is recorded against the event id, so a retried event does not run the same automation twice. The two email subscribers that exist today outside automations are replaced by default automations, as the automations section specifies.

### How an event is defined

Each context defines its events in an `events.ts` file with the shared `defineEvent` helper. An event definition has a type string of the form `context.entity.verb`, a version (all new events are version 1), a schema for its data, and optionally a public schema. The data is the full row of the entity the event is about. The public schema is a subset of the data and determines two things: whether the event is listed in the trigger catalogue an org uses to configure automations and webhooks, and what a webhook delivery contains. An event without a public schema is never delivered outside the system.

The event envelope has an optional `metadata` field that no event sets today. Every community event sets `metadata.actorOrgUserId` to the org user that caused the event, or leaves it unset when the scheduler caused it. Email recipient derivations use it to exclude the actor from an audience and to address the actor directly. It is kept in `metadata` rather than `data` because the actor is not part of the entity row.

In the tables below, **owner** is the context whose service appends the event, **triggered by** is who calls that service, and **public** states whether the event has a public schema. Where the public column says "ids only" or "without body", the public schema omits the named fields.

### content

The community's events follow the per-type pattern of the existing course and download events: `created`, `updated` and `deleted` on the item and on each of its parts, and `reordered` on an ordered list. No content type has a publish event. Publishing is an `updated` whose data carries the new status, and a subscriber that needs it matches `status` in its filter.

| Event | Fires when | Triggered by | Data | Public |
| --- | --- | --- | --- | --- |
| `content.community.created` | a community is created, as a draft | owner, admin | community | yes |
| `content.community.updated` | title, description, thumbnail, status or settings change; publishing and unpublishing are status changes; DM settings ride in `settings.dm` | owner, admin | community | yes, without settings |
| `content.community.deleted` | the registry row is deleted; cascades have run | owner, admin | community | yes |
| `content.community.space.created` | a space is added | owner, admin | space with topics and links | yes |
| `content.community.space.updated` | name, description, access rule, capacity, settings, topics or links change; a link removed by its resource's deletion fires it too | owner, admin, cascade | space with topics and links | yes |
| `content.community.space.deleted` | a space is deleted | owner, admin | space | yes |
| `content.community.spaces.reordered` | the order changes | owner, admin | space\[\] | yes |

### organizations

| Event | Fires when | Triggered by | Data | Public |
| --- | --- | --- | --- | --- |
| `organization.role.assigned` | an org user is given the moderator role for a space | owner, admin | `{ orgUserId, role, spaceId, assignedBy }` | yes |
| `organization.role.unassigned` | the moderator role for a space is removed, by hand or by the space's deletion | owner, admin, cascade | `{ orgUserId, role, spaceId }` | yes |

### entitlements

Entitlements adds no event. A space grant is a row in `entitlements`, so the four existing events cover every change to it. Their data is the entitlement row, which gains `spaceId` beside `bundleId` and `contentId`; the public schema gains it too. A subscriber tells the cases apart from the data: `spaceId` says whether the grant is to a space, `status` says what the grant became, and `metadata.actorOrgUserId` compared with `data.orgUserId` says whether the holder acted on their own grant.

| Event | Fires when | Triggered by | Data | Public |
| --- | --- | --- | --- | --- |
| `entitlement.created` | a grant is made. A grant to a community, or to a bundle holding one, is how someone becomes a member. A space grant with status `requested` is a request to join, with status `invited` an invitation, with status `active` a direct addition by staff or a moderator | staff, moderator, member, import, automation | entitlement | yes |
| `entitlement.updated` | status or expiry changes. A space grant becoming `active` is an approval or an acceptance, and nothing else produces that, since a space grant has no expiry. Any grant becoming `revoked` is a removal | staff, moderator, member | entitlement | yes |
| `entitlement.deleted` | a grant is deleted. A space grant deleted while `requested` is a declined request, while `invited` a refused invitation, while `active` by its holder the person leaving the space | staff, moderator, member | entitlement | yes |
| `entitlement.expired` | the expiry of due grants finds `expires_at` passed; one event per grant, once. Defined today, emitted for the first time by this feature | scheduler | entitlement | yes |

The exploration's "membership lapses" is `entitlement.expired` or `entitlement.deleted` on a grant whose content is the community or a bundle holding it. Subscribers tell a community grant from a course grant by resolving `contentId` through content, as `MailerLookups.contentInfo` does today.

### discussion

The comment events stay as they are, including `discussion.comment.reported`; their data gains `postId`. Posts, chats and messages are new aggregates, and each gets the same small set the comment has: created, published or sent, removed, reported, with `updated` carrying every other field change. The flag events of all three are named `reported`, as the comment's is.

| Event | Fires when | Triggered by | Data | Public |
| --- | --- | --- | --- | --- |
| `discussion.post.created` | a post is created. Its status says what happened: `draft` saved, `scheduled` with a time set, `pending` submitted into review where the space requires it, `published` outright | member, staff | post | yes |
| `discussion.post.updated` | title, body, topic, extra fields, schedule, pin state or comments state change; a scheduled post moved into review by the Publish due posts automation shows as status `pending` | author, staff, moderator, automation | post | yes |
| `discussion.post.published` | status becomes `published`, from submit, approval, restore or the Publish due posts automation; `published_at` set | author, staff, moderator, automation | post | yes |
| `discussion.post.removed` | staff or the moderator remove it, or the author removes their own | author, staff, moderator | post | yes |
| `discussion.post.reported` | someone flags the post; one event per person | anyone who can see it | post flag | yes |
| `discussion.comment.created`, `.published`, `.removed`, `.reported` | as today; data gains `postId` | member, staff, moderator | comment, comment flag | yes |
| `discussion.chat.created` | a DM or a group chat is started; status `pending` when the settings make the first message a request | member, staff | chat with participant ids | yes, ids only |
| `discussion.chat.updated` | a message request is accepted, a participant leaves, or staff lock or unlock the chat | member, staff | chat with participant ids | yes, ids only |
| `discussion.chat.participant.added` | someone is added to a group chat; its own event because the email addresses the added person | participant | { chatId, orgUserId, addedBy } | yes |
| `discussion.message.sent` | a message is stored | participant | message | yes, without body |
| `discussion.message.deleted` | the author or staff delete it; the placeholder stays | author, staff | message | yes, without body |
| `discussion.message.reported` | a participant flags a message | participant | message flag | yes, without reason |

Flag resolution, message edits, blocks, reactions, follows, bookmarks, read positions and mutes emit nothing. They are a member's own state or a moderator's bookkeeping, as comment reactions and report resolution are today, and no automation or email reads them. A message body never leaves the system: `publicData` on every message event strips it, so a webhook learns that a message was sent and by whom, never what it said.

### identity

Identity adds no event. Profiles are read live by the directory and by every author and sender display. Identity events carry `orgId: '-'` today, so no org automation could match a profile event in any case.

### What does not emit

Feed reads, directory reads, analytics reads, settings reads. Progress emits nothing for the community. Automations' own events stay reserved and never trigger an automation.

## Automations

This section specifies the changes to the automations context and the automations the feature uses. The community's notifications and the workflows in the use cases run as automations on the events listed in the previous section. Three changes to the automations context are required: a trigger filter, a grant access action, and default automations. The engine is unchanged: it runs an ordered list of actions once per automation and event.

### What exists today

- A trigger is an event type string. No filter, no condition, no time trigger.
- Two actions run: `sendEmail { template }`, which derives the recipient and params from the event through `SEND_EMAIL_DERIVATIONS` (only `accessGranted` and `accessRevoked` are derivable), and `deliverWebhook`. Integration actions are listed but throw when run.
- The `accessGranted` and `accessRevoked` emails are also hard-wired as bus subscribers in `notifications.ts`, so an org that adds an automation for them gets two emails. That duplication is removed: the subscribers go, and the two become default automations like the ones below.
- Runs are deduplicated per (automation, event id), so a retried event never sends twice.

### Additions

**Trigger filter.** `automations` gains `filter jsonb` (nullable). A filter is an equality match on top-level fields of the event's `data`, for example `{ "spaceId": "spc_…" }`. The automations service loads by trigger as today, then keeps automations whose filter is null or is contained in `data` (`data @> filter`, evaluated in the service). This is what lets "when a post is published in Announcements" differ from "when a post is published anywhere".

**Grant access action.** Its input is the content item or bundle to grant and an optional expiry in days; the recipient is derived from the event (`data.orgUserId` on entitlement, post and progress events; `data.userId` resolved to the org user on organization events). It makes the grant through entitlements and is idempotent on the existing unique constraints. This is the action behind "grant the community when a person joins the org" and "grant the community when someone completes the course".

**`sendEmail` audience derivation.** Each new template declares which events it derives from and who receives it; the table in the emails section is that registry. A derivation returns zero or more recipients, so "email the space's members" is one action, not one per member. Recipients who muted the thing or blocked the sender are dropped inside the derivation, read from discussion.

**Default automations.** `automations` gains `source text enum system, user` (default `user`). When a community is created, content emits `content.community.created` and a subscriber in automations seeds the system automations for that community (filter on `communityId`), enabled. They appear in the dashboard, can be disabled or have their actions changed, and cannot be deleted. The org-wide ones (`accessGranted`, `accessRevoked`) are seeded on `organization.created`.

**Digest.** A digest email summarises the activity a member has not seen since the previous digest. It runs on a schedule trigger: the Digest system automation calls discussion's send digest operation, which emits `discussion.digest.due { communityId, period }` once per community per period, and a default automation sends the digest template from that event. This event has no actor and is specified here rather than in the events section.

### Default automations per community

| Name | Trigger | Filter | Action |
| --- | --- | --- | --- |
| Welcome to the community | `entitlement.created` without `spaceId` | content is this community or a bundle holding it | send the Welcome to the community email |
| Membership ending soon | `entitlement.updated` with expiry within 7 days, or the Expire due grants automation's reminder | this community | send the Membership ending soon email |
| Membership ended | `entitlement.expired`, `entitlement.deleted` without `spaceId` | this community | send the Membership ended email |
| New post in a space | `discussion.post.published` | `communityId` | send the New post in a space email to the space's members who can open it |
| Your post was published | `discussion.post.published` | `communityId`, post was pending | send the Your post was published email to the author |
| Your post was removed | `discussion.post.removed` by someone else | `communityId` | send the Your post was removed email to the author |
| New comment on a post you follow | `discussion.comment.published` with `postId` | `communityId` | send the New comment on a post you follow email to followers and the author |
| Reply to your comment | `discussion.comment.published` with `parentId` | `communityId` | send the Reply to your comment email to the parent's author |
| Post awaiting review | `discussion.post.created` or `discussion.post.updated` with status `pending` | `communityId` | send the Post awaiting review email to staff and the space's moderators |
| Join request | `entitlement.created` with `spaceId`, status `requested` | none; the derivation resolves the space's community | send the Join request email to staff and the space's moderators |
| Request approved | `entitlement.updated` with `spaceId`, status `active` | none; the derivation resolves the space's community | send the Request approved email to the member |
| Invited to a space | `entitlement.created` with `spaceId`, status `invited` | none; the derivation resolves the space's community | send the Invited to a space email to the member |
| New message | `discussion.message.sent` | `communityId` | send the New message email to participants not muted, batched: one email per chat per recipient per 15 minutes |
| Message request | `discussion.chat.created` with status pending | `communityId` | send the Message request email to the recipient |
| Added to a group chat | `discussion.chat.participant.added` | `communityId` | send the Added to a group chat email to the person |
| Something was flagged | `discussion.post.reported`, `discussion.comment.reported` | `communityId` | send the Something was flagged email to staff and that space's moderators |
| A message was flagged | `discussion.message.reported` | `communityId` | send the A message was flagged email to staff |
| You are now a moderator | `organization.role.assigned` with role `moderator` | `communityId` | send the You are now a moderator email to the person |
| Digest | `discussion.digest.due` | `communityId` | send the Digest email to members with unread activity |

"Batched" for new messages is the one place an action needs state: the derivation checks `automation_runs` for a completed New message run to the same recipient for the same chat in the last 15 minutes and skips. No new table.

### Use-case automations the org writes

| Use case | Trigger | Filter | Action |
| --- | --- | --- | --- |
| Maker's Lounge: everyone who joins is a member | `organization.student.created` | none | grant access to the community |
| Founder Collab: finish the course, get the community | `progress.record.completed` | `targetType: course, targetId` | grant access to the community |
| Founder Collab: Announcements go to everyone | `discussion.post.published` | `spaceId: Announcements` | send the New post in a space email to all members |
| Founder Collab: SaaS founders posts go to its members | `discussion.post.published` | `spaceId: SaaS founders` | send the New post in a space email to the space's members |
| Any org: push a post to Slack | `discussion.post.published` | any | `slack.postToChannel`, once integration actions are executable |

Integration actions throwing in `executeAction` is an existing gap outside this spec; the Slack row depends on it being closed.

### What automations does not do

Automations does not perform the timed work itself. A schedule trigger starts a run whose action calls the context that owns the work: publishing due posts in discussion, expiring due grants in entitlements, sending the digest in discussion. The context performs the work and emits ordinary events, and automations reacts to those events as to any other.

## Emails

This section lists the emails the system sends for the community. Every email is sent by the `sendEmail` action of an automation in response to a domain event, through the existing `Mailer`, `TemplateRenderer` and `EmailSender` ports. No service sends community email directly. The event and the automation determine that an email is sent; the template determines its content.

The set of templates is derived from the emails that Circle, Skool, Mighty Networks and Discourse send, limited to what this model supports. Each template is added to `EmailTemplateParams`, to the template registry in `adapters/email-templates`, and to the automations catalogue together with its recipient derivation.

### To members

| Email | Sent when | To | Params | Link in the email |
| --- | --- | --- | --- | --- |
| Welcome to the community | a grant to the community, or a bundle holding it, is created | the new member | communityTitle, spaces the person can open | the community |
| Membership ending soon | the grant expires within 7 days | the member | communityTitle, expiresAt | renew (the org's checkout, an app concern) |
| Membership ended | the grant expires or is revoked | the former member | communityTitle | renew |
| New post in a space | a post is published in a space the person can open | space members, or all members by filter | spaceName, postTitle, authorName, excerpt | the post |
| Your post was published | the person's pending post is published | the author | postTitle, spaceName | the post |
| Your post was removed | staff or a moderator remove the person's post | the author | postTitle, spaceName | the space |
| New comment on a post you follow | a comment is published on a post the person wrote or follows | author and followers, not the commenter | postTitle, commenterName, excerpt | the comment |
| Reply to your comment | a comment is published under the person's comment | the parent's author | postTitle, commenterName, excerpt | the comment |
| Your comment was removed | staff or a moderator remove the person's comment | the author | postTitle | the post |
| Request approved | the person's request to a space is approved | the member | spaceName | the space |
| Request declined | the request is declined | the member | spaceName | the community |
| Invited to a space | staff or a moderator invite the person to a space | the invitee | spaceName, inviterName | accept |
| Message request | a DM is started with the person and the settings make it a request | the recipient | senderName, first message excerpt | the request |
| New message | a message arrives in a chat the person has not muted; one per chat per 15 minutes | participants except the sender | senderName, chatTitle, excerpt | the chat |
| Added to a group chat | the person is added to a group chat | the person | adderName, participant names | the group chat |
| You are now a moderator | the person is made a space moderator | the person | spaceName | the space's queue |
| Digest | the digest period ends and the person has unread activity | each member with activity | new posts per space, new comments on followed posts, unread chats | the community |

### To staff and moderators

| Email | Sent when | To | Params | Link |
| --- | --- | --- | --- | --- |
| Post awaiting review | a post lands in review | staff and the space's moderators | spaceName, postTitle, authorName | the space queue |
| Join request | a member requests a by-request space | staff and the space's moderators | spaceName, memberName, seats left | the request |
| Something was flagged | a post or comment is flagged; one per flag | staff and the space's moderators | spaceName, item excerpt, reason | the space queue |
| A message was flagged | a message is flagged | staff only | reason | the community queue |

### Existing templates that stay

`studentInvite`, `memberInvite`, `passwordReset`, `passwordChanged`, `magicLink` are unchanged and still sent from identity and organizations as today. `accessGranted` and `accessRevoked` move from hard-wired subscribers to default automations, which also stops the duplicate send. `courseCompleted` and `emailVerification` remain defined and unsent; nothing here uses them.

### Rules every community email follows

- **Recipients are derived, never typed.** The derivation reads the event, resolves recipients through entitlements (who can open the space), discussion (followers, participants, mutes, blocks) and organizations (staff, moderators), and resolves addresses through `MailerLookups.orgUserEmail`.
- **The actor is never a recipient.** `metadata.actorOrgUserId` is excluded from every audience.
- **Excerpts, not bodies.** A message email carries at most the first 140 characters of the message; a post or comment email, the first 280. The body itself is read in the app.
- **One template per event per recipient.** The `automation_runs` dedupe prevents a retried event from sending twice; the 15-minute rule prevents a busy DM from sending per message.
- **Branding** is the one global `TemplateContext` the process has today (`brandName`, `baseUrl`, `studentPortalUrl`). Per-org branding is an existing gap, not a community one.
- **Links** point into the student portal at the community, space, post, comment or DM; the portal resolves the route.

### Open item: email preferences

A per-member email preference, which emails a member receives and whether they receive them immediately or in the digest, is not defined in the exploration document and is not specified here. The New post in a space and Digest emails require an opt-out before they are sent to all members. The preference is member-owned state and belongs in discussion beside follows and mutes. It requires one table and one check in the recipient derivations. This item must be decided before the emails are built.

## Security and auth

This section specifies authentication and authorization for the community. Authentication does not change: a member authenticates with a Better Auth session cookie, and the tenant is the session's active organization. The feature adds one role that is held for a single space, the space moderator, and the authorization rules the core applies to community operations.

### What exists today

- **One credential for everyone.** Staff and learners sign in with email and password (magic link is wired, unused). The only token on main is the Better Auth session cookie; no bearer, API key or JWT. The `mcp-server` branch adds API keys and OAuth access tokens; community routes gain them for free when it merges, since they pass through the same route guards.
- **The tenant is the session.** `activeOrganizationId` on the session names the org; no header, no subdomain. A learner in exactly one org gets it stamped at login or on invite accept. A learner in two orgs gets none, which is an existing limit, not a community one.
- **Two route guards.** `requireOrgSession` admits any org user of the active org. `resolveScope` additionally requires a staff role and is the staff gate for admin routes.
- **Core authorizes on the actor.** The route guard loads the caller's org user row and hands it to core as the actor: `{ id: orgUserId, role }`. Core decides on `role` (anything but `student` is staff) and on entitlements. Core never looks a role up itself.
- **Staff are Better Auth members; learners are not.** Staff membership is mirrored from Better Auth into `org_users`. Learners exist only as `org_users` rows with role `student`. One role per person per org.

### What community adds

**A shared actor.** Discussion's actor moves to the shared core and gains the spaces the person moderates, so every context that authorizes a community operation reads the same three facts: the org user id, the org role, and the moderated spaces. The route guard fills the moderated spaces from organizations on every request. They are never stored on a post, comment or message.

**One route guard per surface.**

- Member-facing community routes (`/api/learn/communities/*` and `/api/learn/chats/*`): `requireOrgSession`, load the org user, pass it as the actor. Staff may call them too; they pass as staff.
- Staff-facing routes (set up a community, its spaces, DM settings, assign moderators, analytics): `resolveScope`, which is the staff gate. The three admin route files that skip it today (discussion, assets, integrations) are brought in line before community ships, since the community reuses discussion's routes.

**Membership is a grant, read from entitlements.** Every member-facing operation starts with the same question: does this org user hold an active grant to this community, directly or through a bundle? Entitlements answers it with the bundle-aware access check discussion already uses for courses, generalized to any content id. The learn reader that ignores bundles is not used for community. A removed or expired grant closes everything at once: spaces, feeds, chats, directory.

**Who may do what.** Core enforces every row below; the route guards only authenticate.

| Operation | Member (grant to the community) | Space moderator (of that space) | Staff |
| --- | --- | --- | --- |
| Open a space, read its feed | if the access rule admits them | yes | yes |
| Request to join, accept an invite, leave a space | yes | yes | n/a |
| Approve a request, invite, remove a space member | no | yes | yes |
| Post in a space | if they can open it | yes | yes, publishes without review |
| Edit own post or comment | author only | author only | author only |
| Remove a post or comment | own only | any in that space | any |
| Pin, close comments, turn reactions off | no | in that space | yes |
| Review a post awaiting review | no | in that space | yes |
| Flag a post, comment or message | if they can see it | yes | yes |
| Work a space's flag queue | no | that space | yes |
| Work the community's message flag queue | no | no | yes |
| Start a DM or a group chat, add to a group chat | per the DM settings; everyone involved must be a member or staff | same | per the DM settings |
| Read a chat | participants only | participants only | only a flagged message, in the queue |
| Block, mute | own only | own only | own only |
| Lock a chat | no | no | yes |
| Set up the community, spaces, topics, links, post defaults, DM settings | no | no | owner, admin |
| Assign or remove a space moderator | no | no | owner, admin |
| View analytics | no | no | yes |

Instructors count as staff for moderation and posting, as they do for course comments today. Only owner and admin configure the community and assign moderators, which matches the `manage_org_settings` and `manage_users` permissions in the organizations matrix.

**Privacy rules core enforces.**

- A chat's messages are served only to its participants. The one exception is a flagged message, served to staff inside the flag queue together with the chat it sits in.
- A removed post or comment is not served to members; staff and the queue see it.
- A by-invite space does not appear to anyone who is not a space member, moderator or staff; a by-request space appears with its name and count only.
- The directory is served only to members and staff of that community.
- A blocked person is not told they are blocked; sends fail on their side as an ordinary refusal.

**Moderator is organizations' first role held for one resource.** Today no role is held for a single resource; the `instructor` course scope is noted in the matrix as `assigned` but has no store. Community stores the moderator role for a space in the `space_moderators` table in organizations (data model section) and emits `organization.role.assigned` and `organization.role.unassigned` when it is given or removed. A moderator keeps their org role (`student`) and their grant; the moderator role is held alongside it, for one space. Course-scoped instructors can use the same pattern later.

**Gaps found in the current code that community depends on.** These are fixed as part of this work, not after:

- `GET /api/comments` and the other staff comment routes run under `requireOrgSession` only; any org user reaches them. They get `resolveScope`.
- `POST /api/learn/assets/:id/url` mints a presigned URL for any asset in the org without an access check. Community attachments need the check, so the route gains one.
- The two access readers disagree: entitlements honours bundles and ignores publish state, the learn reader honours publish state and ignores bundles. Community uses entitlements for the grant and content for publish state, and the learn reader is corrected to honour bundles.
