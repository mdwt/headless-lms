# Community Platform Feature

A high-level exploration of how a community product as a content type fits the existing contexts: spaces, posts and comments, events, public and private access, a member directory, and direct messages.

This document defines the community use cases, maps each concept to a bounded context, and states which context owns it.

## What is a community

A community is an online place where a group of people with a shared interest talk to each other.

It is organized into spaces, each for a subject or a group of people. Members post in a space, comment on each other's posts, react to them, and message each other privately.

The org runs it: it sets up the spaces, decides who gets into each one, and moderates what is posted. The community is a product the org sells or gives away. The people in it are its members.

It is sold like any other product. A grant to the community, direct or through a bundle, makes someone a member, and that grant gates everything inside.

## Summary: how it fits Headless LMS

Headless LMS is a headless API for LMS and community apps. It holds the orgs, their products such as courses and downloads, who has access to what, and progress through it. There is no front end; the app built on the API decides what members see. The core follows hexagonal architecture and Domain-Driven Design. The bounded contexts are already defined. The community feature fits into them; this design adds no context.

A community is one more **content type**, a product the org sells like a course. The org creates it, sells it alone or in a bundle, and a grant makes someone a member. Inside it are **spaces**, each a list of posts on one subject, and inside a space are **posts** and their **comments**. For example, a fitness membership has a space per workout type.

Members message each other directly, too: DMs are part of the community.

All of it fits the existing contexts. Content gains the community type. The other contexts extend. It is part of the core, not a plugin.

The API enforces who can open, see, post, moderate and message. The app decides what a profile or a post carries beyond the default fields.

## The model

| Term | What it is | Context |
| --- | --- | --- |
| **Community** | A product the org sells, a peer of course, download and event | content. A content type beside course, download and event |
| **Grant** | A person's access to a product or a bundle. It's given, expires and is revoked the same way for every product | entitlements |
| **Bundle** | Products sold together. A grant to a bundle is access to every product in it. A membership, in the business sense of paying for access to courses, coaching and a community, is sold as a bundle; the model has no separate membership | content |
| **Member** | A person with access to the community, through a grant to it or to a bundle that contains it | entitlements. Member is not a role. Anyone with a grant to the community is a member, whatever their org role; an org with only students still has members |
| **Staff** | The org's owner, admins and instructors. They open every space, post anywhere and moderate everywhere, without a grant | organizations. The org roles owner, admin and instructor |
| **Space** | A place inside the community. The org defines each space: a name, an access rule (all members, by request or by invite), an optional capacity, the topics its posts may take, and the defaults for its posts. A community holds a flat list of spaces in the order the org sets; there are no spaces inside spaces, and every post belongs to exactly one space. The org splits the community by subject (Growth, Hiring), by who's in (a pod of six), or by what it's attached to (a cohort's course). A space also links to any number of courses, downloads or communities. Event links in the use cases are examples. Other products call these channels or circles | content. Part of the community's structure, as a module is part of a course |
| **Access rule** | Each space's rule for who can open it. All members: every member can open it. By request: every member can see it and ask to join. By invite: only its space members can see it. A space by request or invite can limit how many space members it has | content. A setting on the space; entitlements reads it to answer who can open the space |
| **Space member** | A person's place in one space, with a status: requested, invited, active or revoked. Exists only where access to the community isn't enough: in a space by request or invite | entitlements. Its own record, checked on top of the grant to the community. Not a grant |
| **Moderator** | A member who holds the moderator role. Moderates every space of the communities they are a member of | organizations. A Better Auth role beside owner, admin, instructor and student. Not staff. Assigned through the same membership path as the other roles |
| **Topic** | A subject defined on a space, such as SEO or Paid Ads. Where a space defines topics, each post has one of them, and the space's feed filters by topic | content. Defined on the space |
| **Post** | Something a member writes in a space: a title and a body, plus anything else the app wants on it, such as a cover image | discussion |
| **Comment** | A response to a post or another comment | discussion |
| **Reaction** | A person putting an emoji on a post, a comment or a message. It shows on the item and does nothing else | discussion |
| **Flag** | A person marking a post, a comment or a message for review, with an optional reason. Nothing changes on the item; the flag goes into a queue that staff or a moderator work through, and ends in an action: dismiss, remove, delete, lock the DM. See Flagging | discussion. The queue and its actions; who may act is asked of organizations |
| **Event** | A content type with a time and a place, such as a monthly call or a meetup. The use cases mention it as an example | content. Not a content type yet. Nothing in this feature stores an event or a link to one |
| **RSVP** | A person with access to an event saying they'll attend | with the event, not designed here |
| **Feed** | A list of posts. There are two kinds. A space feed belongs to the space: its posts, pinned first, then newest, filtered by topic where the space defines any; everyone who can open the space sees the same one. A member feed belongs to the person: the posts from every space that member can open, merged into one, so no two members see the same feed | discussion. The member feed asks entitlements which spaces the person can open |
| **Profile** | What others see about a person: a sensible default, such as their name, plus anything else the app wants, such as a photo or a bio | identity |
| **Directory** | The people in the community: its members and the org's staff, each with their role and profile | A method on `reporting/member`: grants, roles and profiles. No context owns the data |
| **DM** | Private messages between members of one community, outside any space: between two people, or a group chat of three or more. Two people have at most one DM in a community. The same pair in another community is a different DM | discussion |
| **Message request** | A DM whose recipient hasn't accepted it yet | discussion |
| **DM settings** | The community's DM settings: whether DMs are on, who may message whom, whether a first message is a request, and whether groups are allowed | content. Part of the community's definition; discussion reads it to apply it |
| **Block**, **mute** | A block stops contact between two people inside one community. A mute stops notifications for one person in one chat | discussion |

How they contain each other:

```
Community
└─ Space              (an access rule: all members, by request or by invite)
    ├─ Topics
    ├─ Space members  (each with a status: requested, invited or active)
    ├─ Links          (to a course, a download or a community; opening one needs a grant to it. Event links in the use cases are examples)
    └─ Post           (has one of the space's topics, where it defines any)
        ├─ Comment
        └─ Reactions, flags
```

A course has the same shape: course, then module, then activity, with comments on the activity. In a community, the space is what a member opens, and posts are the discussion in it.

A link from a space does not grant access: opening the course checks for a grant, as it does everywhere. To give every member a course or an event, sell it with the community in a bundle, or add an automation that grants it when someone gets the community.

## Use cases

The following four use cases each describe the org that runs the community, what it sells, the spaces with their access rules, and the DM settings. The fourth use case is walked through step by step.

**A course cohort.** Spanish in 90 Days sells a 12-week course. The community is sold with it in a bundle, so every student is a member for the length of the cohort. Spaces follow the course: one for announcements, one per skill, one to ask the tutor, and a small opt-in space to find a speaking partner.

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

**A free community around a creator.** Maker's Lounge is free. An automation grants the community to everyone who joins the org, so signing up makes a person a member. Spaces are organized by what people come to do: show work, get feedback, find a job, meet up.

```
Org: Maker's Lounge
├─ Event: Monthly meetup
├─ Community: Maker's Lounge
│    ├─ Space: Show your work       all members
│    ├─ Space: Feedback             all members                    topics: Landing page, Pricing, Product
│    ├─ Space: Jobs                 by invite
│    └─ Space: Meetups              all members                    links: Monthly meetup
└─ Automation: grant Maker's Lounge when a person joins the org
DMs: on, members may message members, no request step, groups allowed
```

**A coaching program.** Leadership Circle sells a six-month program: a community, a monthly group call and small pods of six. The community is sold in a bundle with the calls. Each pod is its own by-invite space, capped at six, linking to that pod's fortnightly call.

```
Org: Leadership Circle
├─ Event: Monthly group call
├─ Event: Pod Red call
├─ Event: Pod Blue call
├─ Community: Leadership Circle
│    ├─ Space: General              all members                    links: Monthly group call
│    ├─ Space: Pod Red              by invite, at most 6 people    links: Pod Red call
│    └─ Space: Pod Blue             by invite, at most 6 people    links: Pod Blue call
└─ Bundle: Leadership Circle   (the community and the monthly group call)
DMs: on, members may message staff only, groups off
```

All of them are the same model: an org, its products, a community of spaces with access rules, and members through grants. Only the setup differs.

### Founder Collab, step by step

Founder Collab is a business that runs a community for early stage business founders, the **org**. It sells a course, an event, a community and a bundle of all three:

```
Org: Founder Collab                    staff: Rachel (owner), Emma (instructor); moderator: James
├─ Course: Fundraising 101
├─ Event: Monthly founders call       first Thursday, online
├─ Community: Founder Collab Community
│    ├─ Space: Announcements    all members      posts reviewed before publishing, comments off
│    ├─ Space: Introductions    all members
│    ├─ Space: General          all members      topics: Growth, Fundraising, Other
│    │                                           links: Fundraising 101, Monthly founders call
│    ├─ Space: Wins             all members      comments on, reactions on
│    ├─ Space: SaaS founders    by request, at most 12 people     topics: Growth, Pricing, Other
│    └─ Space: Hiring           by invite
│    DM settings: on; members may message members; first message is a request; groups on, up to 8
├─ Bundle: Founder Collab Membership   (the community, Fundraising 101 and the monthly founders call)
└─ Automations
     ├─ when a person is granted the community → send the welcome email
     ├─ when a post is published in SaaS founders → email its space members
     └─ when a post is published in Announcements → email every member
```

1. **Rachel sets the community up.** She creates the community as a product, then its spaces. Announcements is for her and Emma to speak to everyone, so posts there are reviewed before they publish and comments are off. General gets three topics so questions can be filtered. SaaS founders is by request and capped at twelve, so it stays small; she gives James, a long-time member, the moderator role. Hiring is by invite: nobody sees it unless they're invited. She turns DMs on, with a first message as a request so nobody can be cold-messaged, and allows group chats. She puts the community, the course and the monthly call in one bundle and sells that as the membership.
2. **Sarah buys the Founder Collab Membership and is granted it.** The grant is to the bundle, so she now has access to the community, the course and the monthly call. Access to the community makes her a member. The welcome automation fires and emails her. She fills in her profile: name, a photo, one line about her company. That profile is what every other member sees of her.
3. **She opens the community.** Her member feed shows the posts from every space she can open, pinned first, then newest. She can open Announcements, Introductions, General and Wins, because every member can. SaaS founders is listed with a Request to join button and a note that it has 11 of 12 people. Hiring doesn't appear at all. The directory shows her 240 members and two staff, Rachel and Emma, each with their role.
4. **She posts in Introductions.** A title, a body, a photo of her product. Introductions defines no topics, so the post has none. It publishes immediately, because Introductions doesn't review posts. Six members react to it and three comment; one comment gets its own comments. The post is in the Introductions space feed and in every member's own feed.
5. **She asks a question in General under Fundraising.** General's topics are Growth, Fundraising and Other, so her post has to carry one. Emma answers in a comment. Later, a member filtering General by Fundraising finds the thread; a member filtering by Growth doesn't.
6. **She saves a draft for Wins and schedules it.** She starts a post about closing her first customer, saves it as a draft, comes back the next day and schedules it for Monday 9am. On Monday it publishes on its own and lands in every member's feed. Nobody saw it before then.
7. **She requests to join SaaS founders.** She becomes a space member there with the status requested. James sees the request, checks her profile, and approves her: her status becomes active and she's the twelfth person. The space is now full, so the next person to request it is told it's at capacity and waits. Its posts are now in her member feed, and she gets its emails.
8. **Rachel invites her to Hiring.** Hiring is by invite, so Sarah only learns it exists when the invite arrives. She becomes a space member with the status invited; when she accepts, it's active. She can leave either space on her own; her access to the community is untouched by that.
9. **Rachel posts an announcement.** She writes it in Announcements, pins it, and it publishes without review because she's staff. Comments are off there, but members react. The announcement automation emails all 240 members. She later unpins it when the next one goes up.
10. **Someone posts something abusive in SaaS founders.** Two members flag it, one with a reason. Nothing changes on the post. The flags land in SaaS founders' queue, which James and the staff see. James removes the post: it disappears for members and the flags are resolved as removed, with who flagged and who acted kept. Rachel could have done the same; staff and moderators moderate every space.
11. **James locks a heated thread.** A post in SaaS founders turns into an argument. He closes its comments: what's there stays, nothing new can be added. He doesn't remove it, so it stays in the feed.
12. **General links to the course and the monthly call.** Sarah opens Fundraising 101 from General; her grant came with the bundle. She RSVPs to the next call from the same place and later attends. What the event records of her RSVP and attendance belongs to the event type, which is not designed here. A member who bought the community alone sees both links but can open neither.
13. **Emma posts an announcement in General.** She has no grant to the community; staff post anywhere, as they comment on any course. She appears in the directory as staff, not as a member.
14. **Sarah messages James directly.** Members may message members, and a first message is a request, so James gets a message request with her first message in it. He accepts, and it's a DM between the two of them, outside any space. He replies at night; she has the DM muted until morning, so she isn't notified but the messages are there when she looks.
15. **Sarah starts a group chat.** Four SaaS founders who met on the call start a group chat. One adds a fifth. Anyone in it can leave. It has nothing to do with the SaaS founders space: it's a group chat that happens to be between its members.
16. **Another member sends Sarah abusive messages.** She blocks them in this community: neither can message the other here, their DM in this community is closed, and the other person isn't told. A chat they share in another community is untouched. She also flags the worst message. DM flags go to the community's queue, which only staff see. Rachel reads it and deletes the message. The sender can still post in spaces; that's a separate thing.
17. **A member's membership lapses.** Their grant to the bundle expires. They lose the community, the course and the call in one go: no spaces, no feed, no DMs. Their posts and comments stay where they were, under their name. They were a space member of SaaS founders; that seat is free again. When they buy again, they're back in with their history intact.
18. **Tom bought only Fundraising 101.** He has no access to the community, so none of it exists for him: no spaces, no feed, no directory, and nobody can DM him. If Rachel later adds an automation that grants the community to everyone who completes the course, Tom becomes a member the day he finishes.

## Which context owns what

Headless LMS follows Domain-Driven Design and a hexagonal architecture, ports and adapters. The core is organized into bounded contexts, one per business domain: organizations, identity, content, entitlements, discussion, progress, automations, reporting and assets. Each context owns its area and is the only place that area is written. Other contexts reach it only through its public interface. Each context defines ports, the interfaces for what it needs from infrastructure, such as a database, file storage or email. Adapters implement those ports and are swapped without changing the core. The community adds no new context and no new port. Each part of it belongs to the context that already owns that kind of thing. The sections below describe, per context, what it owns today, what it takes on for the community, and where it appears in Founder Collab.

### organizations: the org, its people and their roles

Owns the org as a tenant and every person's place in it. It defines the roles and assigns them to people: owner, admin, instructor and student today, and for community, moderator. Moderator is a Better Auth role, assigned through the same membership path as the others. A student has no Better Auth membership until they are given one. A role can be scoped: an instructor to a course. Member is not a role: anyone with a grant to the community is a member, whatever their role. In Founder Collab, Rachel is the owner, Emma an instructor, Sarah a student, and James a moderator; Sarah and James are members because they hold a grant to the community. When discussion needs to know whether James may remove a post in SaaS founders, it asks organizations.

### identity: who a person is

Owns the person across orgs: their login, name and email. For community it owns the profile, what other members see of a person: the photo, the line about their company, whatever else the app shows. Sarah's profile is identity. Her role in Founder Collab is organizations.

### content: what the org makes and sells

Owns every product and its structure: courses, downloads, bundles, and now the community. The community's spaces, each space's access rule, capacity, topics, links and post defaults, and the community's DM settings are content, as a course's modules and activities are. Discussion reads those settings to apply them. Rachel setting up Announcements, General and SaaS founders is content. The Founder Collab Membership bundle is content. Fundraising 101 is content. The monthly call is an event, used in the use cases as an example. Events are not a content type yet, and this feature does not store them.

### entitlements: who can open what

Owns access. A grant is one person's access to one product or bundle. It is given, expires and is revoked the same way whatever it points at. Sarah's grant to the bundle is entitlements, and holding a grant to the community is what makes her a member. A person's place in a space is entitlements too, as its own record and not as a grant: Sarah's request to join SaaS founders, James's approval, enforcing the cap of twelve, Rachel's invite to Hiring, Sarah leaving a space. Every "can Sarah open this?" in the community is answered here, reading the space's access rule from content.

### discussion: what members write

Owns everything people write and the rules around it. Today that is comments on a course activity and their moderation. For community it is posts and comments, reactions, flags and the queues they land in, a post's status and the time a scheduled post is submitted, pinning and closing comments, the space feed and the member feed, and all of DMs: messages, group chats, message requests, blocks and mutes.

Sarah can post in General because she has access to General. That access is entitlements and is settled before any post exists; without it there is no post. Discussion records her post in General with one of the topics General allows, which content defines. Her DM to James is delivered under the community's DM settings and only if neither has blocked the other.

### progress: what a person has done

Owns starts and completions on content. Nothing in the community itself is progress. Attending an event would be that event's completion, once events are designed.

### automations: what happens when something happens

Owns triggers and actions. Every context emits events; an automation reacts to one with an action in another. The welcome email when Sarah is granted the community, the email when a post is published, the notification to a post's followers when a comment lands, and the grant to Tom when he finishes the course are all automations. The Announcements and SaaS founders emails in the Founder Collab tree are the seeded new-post automation. Announcements reaches every member because every member can open it. SaaS founders reaches its space members. They are not a second send of the same email.

### reporting: composed reads

Owns composed reads and no data of its own. Two services, one per product. `reporting/member` is the person in the member product. Sarah opening a course and Sarah opening the community call the same service: her courses, her progress, and her downloads, and the directory and the community home. The directory joins grants, roles and profiles. The home lists the spaces she can open, with their counts. `reporting/admin` is the person in the admin app. Rachel checking how SaaS founders is doing is that service: how many members, how many were active this week, posts per space, comments per post, DMs sent, flags raised and resolved, grants lapsed and renewed, beside the org overview, course analytics, and the roster it already answers.

### assets: files

Owns stored files and where they are used. The photo on Sarah's introduction post, an attachment in a DM, her profile photo.

## Spaces

A space is a place inside the community where members post. The org defines each space with a name, an access rule, an optional capacity, the topics its posts may carry, links to resources, and the defaults for its posts. Content owns that definition, as it owns a course's modules.

A community holds a flat list of spaces in the order the org sets. There are no spaces inside spaces. Every post belongs to exactly one space, and each space has its own feed.

The access rule decides who can open the space. All members: every member opens it. By request: every member sees it and asks to join; staff or a moderator approve. By invite: only invited people see it; staff or a moderator invite. A space by request or by invite can cap how many space members it has. Entitlements records each person's place in such a space as a space member with a status: requested, invited, active or revoked. That record is not a grant. A space for all members has no space members; the grant to the community is enough.

A space links to a course, a download or a community. A link shows the resource in the space. Opening it needs a grant to it; a link never grants access. Event links in the use cases are examples and are not stored.

A moderator is a member who holds the moderator role, a Better Auth role beside owner, admin, instructor and student. A moderator reviews, pins and removes posts in every space of the community and works its flag queues. The role is not staff.

A space sets the defaults for its posts: whether comments and reactions are on, and whether posts are reviewed before they're published. The org sets them on the space, content owns them, and discussion reads them to enforce them. A post can override those defaults. It can also be pinned or have its comments closed, keeping existing comments but allowing no new ones.

## Topics

A space has defined topics, configured with the space in content. Where a space defines topics, a post has one of them, picked from its space's topics; discussion links the post to it. A space's feed can be filtered by topic. A space with no topics has posts with no topic.

They're called topics because courses already have a category, and the automations doc already uses tags for people.

## Posts

A post is user content (discussion entity) with an author, the space it's in, a title, a body, a topic where the space defines them, and a state. A post is rich content, and can optionally have comments. Comments on a post are the same comments an activity has: a comment's target is an activity or a post. A comment on a post is published immediately. Flags and removal are how it is moderated. Review before publishing applies to the post.

A post has one status: **draft**, **scheduled**, **awaiting review**, **published** or **removed**. The author saves a draft and submits it, or sets a time, which makes the post scheduled. Submission moves the post to awaiting review if the space reviews posts, otherwise to published. Staff or a moderator move a published post to removed. Discussion stores the status and the scheduled time. At the scheduled time, automations fires a time trigger that submits the post through discussion, which handles it like any other submission. Automations also notifies people about a published post.

A member can follow a post to hear about new comments, and bookmark it to come back to. Discussion owns both, as it owns reactions: a member's state on a post, dropped when the post is removed.

Authors manage their own drafts and schedules. Staff and moderators pin posts, close comments and turn reactions off, as they remove posts. Discussion owns all of it; automations tells followers about new comments.

## Direct messages

Discussion owns DMs: private messages between members, like Sarah writing to James in step 14, are what members write, as posts are. A DM is not attached to a space and is private to the people in it. DMs add requests, read state, muting and blocking.

Everyone in a DM is a member of the community or its staff; discussion asks entitlements for the grant and organizations for the role. Within that, the DM settings decide who may open a DM with whom.

"Message everyone in the community or a space" is an automation that uses discussion.

```
Community
├─ DM settings         (one per community)
├─ Blocks              (between two people, inside this community)
└─ DM                  (two people, one per pair in this community; group chat: three or more)
    ├─ Participants    (each with their own read position and mute)
    └─ Message
        └─ Reactions, flags
```

### How DMs work

A DM is between two members of one community. Two people have one DM in that community: writing to someone again continues it. The same two people in another community have a different DM.

A message is text, with links or attachments. It can reply to an earlier message, mention people in the DM, and carry reactions. The author can edit or delete it; a deleted message leaves a marker where it was.

Each person has their own read position in each DM, so unread counts are per person. Each can mute a chat: it stays, but they aren't notified. A mute is that chat only. Notifications go out through automations unless the chat is muted or the sender is blocked in this community.

When the settings make a first message a request, a DM you start with someone you haven't messaged before arrives as a message request. They accept, ignore or block. Until they accept, you can't send a second message.

### Group chat

A group chat is a chat between three or more members of one community. It is created open. A message request is only for a DM between two people. The DM settings say whether group chats are allowed and how many people one holds. Where they are allowed, any member starts one, anyone in it adds people up to that size, and anyone leaves when they want. A person cannot be added if they and anyone already in it have blocked each other in this community. If two people in the group later block each other, those two cannot send and the others can. A group chat has the same messages, read positions, mutes, reactions and flags as a DM between two people. It is not attached to any space: a group chat between members of one space is still private to the people in it. Discussion owns it.

### DM settings

Per community, owned by content as part of the community's definition and applied by discussion: whether DMs are on; who may start a DM with whom, by role (members to members, members to staff, staff to anyone); whether a member's first message to another member is a request; whether group chats are allowed and how many people one holds.

### Blocking and muting

Every person can block and mute. A block is inside one community and stops messages both ways there; the blocked person is not told, and nothing is deleted. Their direct chat in that community closes. Other communities are untouched. A mute is per chat and only stops notifications. Discussion owns blocks and mutes, as it owns the chats they apply to.

## Flagging

A flag marks an item for review. It works the same for a post, a comment and a message.

**Who flags.** Anyone who can see the item: a post or comment in a space they can open, a message in a DM they're in. Staff included.

**When.** Any time the item is visible to them, including on a post whose comments are closed. Once per item per person; flagging again does nothing.

**How.** Flag the item, with an optional reason. Nothing visible changes: the item stays published, the flagger is told nothing, and nobody is notified unless an automation does it.

**Who sees it.** Staff, and for a post or comment also moderators. Flags sit in a queue: one per space for posts and comments, one per community for messages. The queue lists each item with its unresolved flags and their reasons; for a message, the moderator sees the DM it's in. Only the people in a DM read it otherwise.

**Who acts.** Staff or a moderator for a post or comment; staff only for a message.

**What they do.** Dismiss, or remove the post or comment, or delete the message. For a message, also lock the DM. Locking a DM stops everyone in it from sending; what is there stays readable. Acting on the item resolves its flags. A flag never changes the item on its own; only a moderator's action does.

**What's kept.** Resolved flags stay on the item, with who flagged it, who acted and what they did.

