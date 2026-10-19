# Messaging: direct messages between people in an org

A high-level exploration of a new **messaging** context: private conversations between people in an
org, outside any space. It is part of the product, not a plugin. The community exploration in
`community-exploration.md` shows where messaging sits among the other contexts; this doc is the
context itself.

## Why a new context

Direct messages don't fit discussion. They aren't attached to anything a member opens, they're
private to the people in them, and they bring their own concepts: requests, read and unread state,
muting, blocking, a person's choice of who may message them, and moderation of content staff can't
freely read. Treating a conversation as a small private space would stretch one concept to fake
another.

Messaging owns conversations between people in an org. "Message everyone in the community or a
space" is an automation that uses it.

## The model

| Term                      | What it is                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Conversation**          | A private conversation between people in the org, outside any space: direct, between two people, or a group of three or more |
| **Message request**       | A direct conversation whose recipient hasn't accepted it yet                                                |
| **Messaging policy**      | The org's one set of messaging settings: who may message whom, limits, and how messages are moderated      |
| **Audience**              | A named group of people the messaging policy defines by a condition, such as members who joined the org at least a week ago. Every messaging setting refers to audiences |
| **Block**, **mute**       | A person stopping contact with another person, or only stopping being notified by them                      |
| **Reaction**, **report**  | A person reacting to, or flagging, a message. A conversation or a person can be reported too               |
| **Case**                  | The reports of one message, conversation or person, handled together by a moderator                        |
| **Messaging restriction** | A moderator's limit on one person's messaging, for a time or permanently                                   |
| **Operator**              | Whoever runs the installation. Sits above every org's owner; owned by organizations                        |

```
Org
├─ Messaging policy    (one per org, versioned)
├─ Blocks and mutes    (each between two people)
└─ Conversation        (direct: two people, one per pair; group: three or more)
    ├─ Participants    (each with their own read position, mute and archive)
    └─ Message
        └─ Reactions, reports
```

## Conversations

A conversation belongs to one org, and everyone in it is a person in that org. A direct conversation
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

## The messaging policy

Each org has one messaging policy, and every messaging setting an org can choose is in it. Each
change saves a new version.

The policy defines **audiences**: named groups of people, each a condition on role, access to a
product, how long ago the person joined the org, whether their email is verified, a list of people,
or other audiences combined. Every org has audiences for everyone, staff, students and each staff
role. Every other setting names audiences:

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
- **When things change.** What a conversation becomes when someone in it loses access to the org,
  when messaging is turned off, when a recipient stops accepting messages from the sender, and for
  someone who left a group.
- **Moderation.** Which staff moderate messages, how much private content they can read (only what
  was reported, the whole reported conversation, or everything), how many surrounding messages a
  report keeps, how long a case can stay open before it escalates, how many reports hide a message
  until it's reviewed, and how many blocks or reports of one person in a period open a case on them.
- **Notification emails.** Whether they include the message, and how long to wait before sending a
  digest.

A policy is refused if it names an audience that doesn't exist, leaves someone without limits, makes
anyone but staff a moderator, or goes beyond the operator's limits.

## Rules every org gets

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

## Reports and moderation

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
messaging, or remove or ban them from the org. A restriction stops someone starting conversations,
sending, or sending attachments, until a set time or permanently. Organizations carries out a
removal or ban; messaging records it.

## Operator settings

The operator sets, for every org on the installation: a ceiling for each limit in the policy, the
longest a case can stay open before it escalates (at most 24 hours, as app stores require), whether a
deleted account's messages are anonymised or deleted, how long evidence and moderation records are
kept, and where illegal content is reported.

## Who relies on whom

Messaging relies on organizations (people, roles, when each joined, bans, the operator), entitlements
(access to a product, for audiences), identity (whether an email is verified, for audiences) and
assets (attachments). Automations relies on messaging to send to a group.

Working out whether Sarah may message James: messaging finds which of the policy's audiences each is
in, from their roles and when they joined the org (organizations), their access to the community
(entitlements) and whether their email is verified (identity). Then it checks the policy, any block
between them, and who James accepts messages from.

## Gaps in what exists today

- **Identity doesn't say whether an email is verified.** Sign-in records it, but the person identity
  serves doesn't carry it, and an audience can depend on it.
- **Nobody can be banned from an org.** Organizations can remove an org user, but not keep them out.
- **Uploaded files aren't checked.** An asset is ready as soon as its upload is confirmed. A file
  attached to a message has to be checked before anyone else can open it.
- **There is no operator.** Nobody sits above an org's owner, so nothing can act on illegal content
  in every org or set limits for all of them.
- **Automations can't send to a group.** It can email the person something happened to, not
  "everyone in this space".
