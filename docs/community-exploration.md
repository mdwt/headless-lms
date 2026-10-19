# Community: fitting it into Headless LMS

A high-level exploration of how a community product fits the existing contexts: spaces, posts and
replies, events, public and private access, a member directory, and direct messages.

## Summary

A community is a **content type**, a product the org sells like a course. Inside it are **spaces**,
and inside a space are **posts** and their **replies**. A feed is not a thing of its own: it is a
list of posts.

Members message each other directly, too: DMs are part of the community.

All of it fits the existing contexts. Content gains the community and event types. Entitlements,
discussion, progress, identity, automations, organizations, reporting and assets each extend. It is
part of the product, not a plugin.

The API enforces the rules: who can open, see, post, moderate and message. What a profile or a post
carries beyond a sensible default is up to the app built on it.

## The model

| Term                 | What it is                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Community**        | A product the org sells, a peer of course, download and event                                               |
| **Grant**            | A person's access to a product or a bundle. It's given, expires and is revoked the same way for every product |
| **Bundle**           | Products sold together. A grant to a bundle is access to every product in it. A membership, in the business sense of paying for access to courses, coaching and a community, is sold as a bundle; the model has no separate membership |
| **Member**           | A person with access to the community, through a grant to it or to a bundle that contains it                |
| **Staff**            | The org's owner, admins and instructors. They open every space, post anywhere and moderate everywhere, without a grant |
| **Space**            | A place inside the community. It holds its posts and links to any number of resources of any kind, such as a course, a download or an event. Other products call these channels or circles |
| **Access rule**      | Each space's rule for who can open it. All members: every member can open it. By request: every member can see it and ask to join. By invite: only its space members can see it. A space by request or invite can limit how many space members it has |
| **Space member**     | A person's access to one space, with a status: requested, invited or active. Exists only where access to the community isn't enough: in a space by request or invite |
| **Space moderator**  | A member assigned to moderate one space. An assignment organizations records, like an instructor assigned to a course |
| **Topic**            | A subject defined on a space, such as SEO or Paid Ads. Where a space defines topics, each post has one of them, and the space's feed filters by topic |
| **Post**             | Something a member writes in a space: a title and a body, plus anything else the app wants on it, such as a cover image |
| **Reply**            | A response to a post or another reply                                                                       |
| **Reaction**, **report** | A person reacting to, or flagging, a post, a reply or a message. A conversation or a person can be reported too |
| **Event**            | A content type with a time and a place, such as a monthly call or a meetup. It follows the same rules as a course: opening it needs a grant, and a space can link to it |
| **RSVP**             | A person with access to an event saying they'll attend                                                      |
| **Feed**             | A list of posts. A space's feed is its posts; a person's community feed is the posts from every space they can open |
| **Profile**          | What others see about a person: a sensible default, such as their name, plus anything else the app wants, such as a photo or a bio |
| **Directory**        | The people in the community: its members and the org's staff, each with their role and profile              |
| **Conversation**     | A DM: a private conversation between members of the community, outside any space: direct, between two people, or a group of three or more |
| **Message request**  | A direct conversation whose recipient hasn't accepted it yet                                                |
| **DM policy**        | The community's one set of DM settings: who may message whom, limits, and how messages are moderated      |
| **Audience**         | A named group of members the DM policy defines by a condition, such as members who joined the community at least a week ago. Every DM setting refers to audiences |
| **Block**, **mute**  | A person stopping contact with another person, or only stopping being notified by them                      |
| **Case**             | The reports of one message, conversation or person, handled together by a moderator                        |
| **DM restriction**   | A moderator's limit on one person's DMs, for a time or permanently                                          |
| **Operator**         | Whoever runs the installation. Sits above every org's owner; owned by organizations                        |

How they contain each other:

```
Community
└─ Space              (an access rule: all members, by request or by invite)
    ├─ Topics
    ├─ Space members  (each with a status: requested, invited or active)
    ├─ Links          (to any resource: a course, a download, an event, …; opening one needs a grant to it)
    └─ Post           (has one of the space's topics, where it defines any)
        ├─ Reply
        └─ Reactions, reports
```

A course has the same shape: course, then module, then activity, with comments on the activity. In
a community, the space is what a member opens, and posts are the discussion in it.

A link from a space is a way in, not a way around access: opening the course checks for a
grant, as it does everywhere. To give every member a course or an event, sell it with the community
in a bundle, or add an automation that grants it when someone gets the community.

## Example: Founder Collab

Founder Collab is a business, the **org**. It sells a course, an event, a community and a bundle of
all three:

```
Org: Founder Collab
├─ Course: Fundraising 101
├─ Event: Monthly founders call
├─ Community: Founder Collab Community
│    ├─ Space: General          all members                     topics: Growth, Fundraising, Other
│    │                                                          links: Monthly founders call
│    ├─ Space: Introductions    all members
│    ├─ Space: SaaS founders    by request, at most 12 people   topics: Growth, Pricing, Other
│    └─ Space: Hiring           by invite
└─ Bundle: Founder Collab Membership   (the community, Fundraising 101 and the monthly founders call)
```

1. **Sarah buys the Founder Collab Membership and is granted it.** It's a bundle, so she now has
   access to the community, the course and the monthly call. Access to the community makes her a
   member.
2. **She opens the community.** She can open General and Introductions, because every member can.
   SaaS founders is visible to her and she can request to join it. Hiring isn't visible to her at
   all. Her community feed is the posts from General and Introductions.
3. **She posts in Introductions.** Introductions defines no topics, so the post has none. Other
   members reply and react. The post is in the Introductions feed and in every member's community
   feed.
4. **She asks a question in General under Fundraising.** General's topics are Growth, Fundraising
   and Other, so a post there has one of them. Filtering General's feed by Fundraising returns only
   posts with that topic.
5. **She applies to SaaS founders.** She becomes a space member there with the requested status.
   James, the space's moderator, approves her, and her status becomes active. Its posts are now in
   her community feed.
6. **Someone posts something abusive in SaaS founders.** Two members report it. James removes it.
   Staff could too: staff moderate every space; James moderates only the spaces he's assigned to.
7. **A new post in SaaS founders emails everyone in it.** An automation set up by the org sends it.
8. **General links to the monthly founders call.** Sarah opens it from there; her grant to it came
   with the bundle. She RSVPs. A member without a grant to the call sees the link but can't open it.
9. **An instructor, Emma, posts an announcement in General.** She has no grant to the community;
   staff post anywhere, as they comment on any course. She appears in the directory as staff.
10. **A week later, Sarah messages James directly.** The community's DM policy lets members
    who joined at least a week ago message other members, and makes a member's first message to
    another member a request. James accepts it. The conversation is between the two of them,
    outside any space.
11. **Another member sends Sarah abusive messages.** She blocks them: neither can message the other,
    and they aren't told. She reports a message. The report keeps a copy of it and the messages
    around it, and goes to Founder Collab's admins, whom the policy names to moderate messages. An
    admin restricts the sender from starting conversations for a month. The sender is told why and
    can appeal.
12. **Tom bought only Fundraising 101.** He has no access to the community, so none of it exists
    for him: no spaces, no feed, no directory, and nobody can DM him.

## Where each piece lives

| Piece                                              | Context           |
| -------------------------------------------------- | ----------------- |
| Founder Collab, the tenant, its people, staff roles, when each person joined | **organizations** |
| James's assignment as moderator of SaaS founders  | **organizations** |
| Removing or banning someone from the org; the operator | **organizations** |
| Sarah as a person, her profile                    | **identity**      |
| The community, its spaces, each space's access rule, capacity, topics and links | **content** |
| The bundle and what's in it                       | **content**       |
| Sarah's grant, which makes her a member           | **entitlements**  |
| Sarah as a space member of SaaS founders, from her request to her approval | **entitlements** |
| Whether Sarah can open a space                    | **entitlements**  |
| Posts and their topic, replies, reactions, reports, removing a post | **discussion** |
| A space's post settings: replies, reactions, review | **discussion**  |
| Sarah's community feed                            | **discussion**    |
| Pinning, closed replies, drafts and schedules, follows and bookmarks | **discussion** |
| The directory, a space's member list              | **reporting**     |
| The monthly call                                  | **content**       |
| Sarah's grant to the monthly call                 | **entitlements**  |
| Sarah's RSVP                                      | **progress**      |
| The email when someone posts                       | **automations**   |
| Sarah's conversation with James, his acceptance of her request | **discussion**  |
| The community's DM policy and its audiences       | **discussion**    |
| Sarah's block, her report, the sender's restriction | **discussion**  |
| Files attached to a post or a message             | **assets**        |

Following the example through the contexts:

- **Opening a space** asks entitlements: does she have access to the community, and if the space isn't
  open to all members, is she an active space member of it? The rule it applies comes from content.
  Staff open every space.
- **Posting** goes to discussion, which first asks entitlements whether she can open the space, as
  it asks whether a learner can open an activity today. Staff post without a grant, as they comment
  without one today.
- **Removing a post** goes to discussion, which allows it for staff, or for the space's moderator,
  asking organizations who that is, as it asks for the org role today.
- **The community feed** is discussion listing posts from the spaces entitlements says she can open.
- **RSVPing** goes to progress, after entitlements confirms her grant to the event, the same way
  opening a lesson in a course does. An RSVP is a start on the event; attending is its completion.
- **Posting under a topic** goes to discussion, which checks the topic is one content defines for
  that space. Filtering a space's feed by topic is discussion too.
- **The directory** is reporting composing who has access to the community (entitlements), the
  org's staff (organizations) and each person's profile (identity). A space's member list is the
  same read scoped to a space.
- **The email** is automations reacting to the new post and asking entitlements who is in the space.
- **Messaging James** goes to discussion. It works out which of the policy's audiences Sarah and James
  are in, from their roles (organizations), when they joined and their access to the
  community (entitlements) and whether their email is verified (identity). Then it checks the
  policy, any block between them, and who James accepts messages from.
- **Restricting the sender** is discussion. Removing or banning someone from the org is carried out
  by organizations and recorded in discussion.

### Organizations

Organizations is what the community stands on. It gains three things: a scoped assignment, a ban,
and the operator.

- **Tenant.** The community and everything in it belong to one org, and nothing crosses orgs.
- **People.** Sarah, James, Emma and Tom are each an org user: a person's place in that org. A
  community member is an org user with the student role who has access to the community.
- **Staff.** Owners, admins and instructors manage the community and moderate every space. Staff
  powers come from organizations; a member's place in a space comes from entitlements.
- **Space moderator.** An org user assigned to moderate one space. Organizations already describes
  the instructor role as course-scoped, narrowed to a subset of courses; a space moderator is the
  same shape, a student narrowed to one space, and the assignment is recorded the same way.
- **Ban.** A moderator of messages can remove someone from the org or ban them from it.
  Organizations carries it out.
- **Operator.** Whoever runs the installation. Sits above every org's owner, acts on illegal content
  in any org, and sets limits no org can go beyond.

### Who relies on whom

- Discussion relies on content, entitlements and organizations, and for DMs on identity and assets.
- Entitlements relies on content.
- Reporting relies on entitlements, organizations and identity for the directory.
- Automations relies on entitlements and discussion.
- Progress relies on content and entitlements for events, as it does for courses.
- Content, organizations and identity take on no new dependencies.

## Topics

A space has defined topics, configured with the space in content. Where a space defines topics, a
post has one of them, picked from its space's topics; discussion links the post to it. A space's
feed can be filtered by topic. A space with no topics has posts with no topic.

They're called topics because courses already have a category, and the automations doc already
uses tags for people.

## Posts

A post is a new discussion entity, not a comment with a title. It has an author, the space it's in,
a title, a body, a topic where the space defines them, and a state. Replies are comments attached
to the post, the same comments that attach to an activity today: a comment's target becomes an
activity or a post.

A post is a **draft** or **scheduled** for a time until it's submitted. From then on it carries the
moderation state comments have today: awaiting review, published or removed. One state, in order;
a draft has no moderation state yet.

A space sets the defaults for its posts: whether replies and reactions are on, and whether posts are
reviewed before they're published. Discussion owns them, as it owns a course's discussion settings
today, and enforces them. A post can override those defaults. It can also be pinned, or have its
replies closed, which keeps the replies it has but allows no new ones.

A member can follow a post to hear about new replies, and bookmark it to come back to. These belong
to the member, not to the post.

Authors manage their own drafts and schedules. Staff and the space's moderator pin posts, close
replies and turn reactions off, as they remove posts. Discussion owns all of it; automations tells
followers about new replies.

## Gaps in what exists today

- **Comments only attach to course activities.** Discussion has to attach to a post as well, and
  gain the post itself, its states and its space's settings.
- **Discussion knows only staff as moderators.** It resolves moderation from the org role and has no
  narrower moderator. A space moderator is one, and discussion has to ask organizations for it.
- **Organizations records no scoped assignment.** The instructor role is course-scoped in principle
  but nothing records the subset of courses. A space moderator needs the same record.
- **Nobody can ask for access today.** Access is only ever given to a person. Requesting to join a
  space, approving a request and leaving are done by members and space moderators themselves.
- **Automations can't notify a group.** It can notify the person something happened to, not
  "everyone in this space".
- **Progress only covers courses.** An RSVP is the first progress on another content type: a start
  on the event, with attendance as its completion.
- **A person has only a name and an email today.** An app can't add anything else to a profile.
- **Identity doesn't say whether an email is verified.** Sign-in records it, but the person identity
  serves doesn't carry it, and an audience can depend on it.
- **Nobody can be banned from an org.** Organizations can remove an org user, but not keep them out.
- **Uploaded files aren't checked.** An asset is ready as soon as its upload is confirmed. A file
  attached to a message has to be checked before anyone else can open it.
- **There is no operator.** Nobody sits above an org's owner, so nothing can act on illegal content
  in every org or set limits for all of them.

## Direct messages

DMs are part of the community and discussion owns them: private conversations between its
members, like Sarah writing to James in step 10, are what members write, as posts are. They aren't attached to a space, they're private to the people in
them, and they bring their own concepts: requests, read and unread state, muting, blocking, a
person's choice of who may message them, and moderation of content staff can't freely read.

"Message everyone in the community or a space" is an automation that uses discussion.

```
Community
├─ DM policy           (one per community, versioned)
├─ Blocks and mutes    (each between two people)
└─ Conversation        (direct: two people, one per pair; group: three or more)
    ├─ Participants    (each with their own read position, mute and archive)
    └─ Message
        └─ Reactions, reports
```

### Conversations

A conversation belongs to one community, and everyone in it is a member of it or staff. A direct conversation
has two people, and there's only ever one per pair: messaging someone you've talked to before
continues that conversation. A group has three or more, up to the policy's limit. Adding someone to a
group needs the person adding them to be allowed to message them, and fails if they and anyone
already in it have a block between them.

A message is text, links, attachments or voice, within the sender's limits. It can reply to another
message, mention people in the conversation and collect reactions. Authors edit and delete their own
messages within the policy's windows. A deleted message leaves a marker in its place, and an edited
one keeps its earlier versions.

Each person in a conversation has their own read position, and can mute it or archive it until
something new arrives. Anyone can leave a group. A person is told about new messages unless they've
muted the conversation or its sender, and chooses whether that's by email straight away, in a
digest, or not at all.

A first message can arrive as a **message request**. The recipient accepts, ignores, blocks or
reports it. Until they accept, the sender can send only as many messages as the policy allows.

### The DM policy

Each community has one DM policy, and every DM setting the org can choose for it is in it.
Each change saves a new version.

The policy defines **audiences**: named groups of members, each a condition on role, access to a
product, how long ago the person joined the community, whether their email is verified, a list of
people, or other audiences combined. Every community has audiences for everyone, staff, members and
each staff role. Every other setting names audiences:

- **Who may start a conversation with whom.** Pairs of audiences, such as staff to everyone and
  members to staff. Anything not listed is refused.
- **Replies.** Whether people can always reply in a conversation someone else started with them.
- **Groups.** On or off, which audience can start them, how many people they hold, and who can add
  people.
- **Requests.** Whose first message arrives as a request, how many messages can be sent before it's
  accepted, and whether the recipient is told about it.
- **Who a person hears from.** The audiences a person can choose to accept messages from, or nobody,
  the default choice, and which audience is exempt from that choice.
- **Blocking.** Whether a block stops messages both ways or only to the person who blocked, which
  audience can't be blocked, and whether a blocked person's messages are hidden in groups the two
  share.
- **Limits.** For each audience: message length, links, attachments (size, number and kind), voice,
  and how many conversations, messages and people a person can start, send and reach in a period. A
  person gets the limits of the first audience they match.
- **Filtered terms.** Words that flag a message for moderators, hold it for review, or refuse it.
- **Editing and deleting.** Whether authors can, and for how long.
- **Keeping messages.** How long messages are kept.
- **When things change.** What a conversation becomes when someone in it loses access to the community,
  when DMs are turned off, when a recipient stops accepting messages from the sender, and for
  someone who left a group.
- **Moderation.** Which staff moderate messages, how much private content they can read (only what
  was reported, the whole reported conversation, or everything), how many surrounding messages a
  report keeps, how long a case can stay open before it escalates, how many reports hide a message
  until it's reviewed, and how many blocks or reports of one person in a period open a case on them.
- **Notification emails.** Whether they include the message, and how long to wait before sending a
  digest.

A policy is refused if it names an audience that doesn't exist, leaves someone without limits, makes
anyone but staff a moderator, or goes beyond the operator's limits.

### Rules every org gets

These hold whatever the policy says. Most come from what app stores require of apps with
user-generated content, and from the EU Digital Services Act.

- Only the people in a conversation read it. Staff read private messages only as far as the
  policy's moderation setting allows. The operator can too, to act on illegal content or answer a
  legal request. Every read by someone outside the conversation is logged.
- When a refusal comes from the recipient, through a block, their choice of who they hear from or
  an unaccepted request, the sender is told only that they can't message them, never why.
- Every person can block, mute and report. A policy can make some audiences unblockable, but it
  can't turn any of these off.
- A blocked person is never told, and a block deletes nothing.
- A reported person is never told who reported them.
- A report keeps a copy of what was reported and the messages around it. Later edits, deletions,
  expiry or a deleted account don't change it.
- Every moderation action records who took it, or that it was automatic, the policy version in
  force, and the reason. The person it's against is told why and can appeal. A policy version is
  kept as long as an action refers to it.
- Moderators can delete a message at any time.
- The operator can act on illegal content in any org, whatever its policy, and sets limits no policy
  can go beyond.

### Reports and moderation

A report is about a message, a conversation or a person. It has a reason (spam, harassment, hate,
sexual content, threats or violence, self-harm, illegal content, impersonation, scam or other) and
optional detail. Reporting offers to block in the same step, and the reporter is told the outcome.

Reports of the same thing form one **case**: open, then in review, then actioned or dismissed. A case
left open past the policy's escalation time goes to every moderator and is flagged to the operator. A
report of illegal content also goes to the operator.

Some cases open on their own: a filtered term opens a report, enough reports of one message hide it
until it's reviewed, and enough blocks or reports of one person open a case on them. Each is
recorded as an automatic moderation action.

A moderator can dismiss a case, hide or delete a message, lock a conversation, restrict a person's
DMs, or remove or ban them from the org. A restriction stops someone starting conversations,
sending, or sending attachments, until a set time or permanently. Organizations carries out a
removal or ban; discussion records it.

### Operator settings

The operator sets, for every org on the installation: a ceiling for each limit in the policy, the
longest a case can stay open before it escalates (at most 24 hours, as app stores require), whether a
deleted account's messages are anonymised or deleted, how long evidence and moderation records are
kept, and where illegal content is reported.

## Why not a plugin

The architecture doc lists "Community" as an example plugin, and describes plugins as adding
actions, triggers, their own records and their own workflows. The plugins that exist today are
narrower: integrations, which connect outside services and give automations actions to run, and the
content editor. A community has its own records and rules, and depends on products, access, people
and moderation. As a plugin it would either need all of that opened up to plugins or rebuild
discussion as a second, separate forum.

Features specific to one installation, such as Founder Collab's challenges, prediction games and
chat roulette, do fit as plugins.

## Open decisions

- **Directory visibility.** Either one choice on the person's profile that applies everywhere, or
  a choice per community, which is the only way someone can appear in one community's directory and
  not another's.
