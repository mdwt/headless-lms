# Realtime chat: design

Nov 5, 2026 · @Meiring

The community app learns about chat changes by re-rendering every chat page every 5 seconds. This design replaces that with live delivery from the API: chat writes emit domain events as they do today, every API instance receives them through a new pub/sub port, and each instance pushes the current state to the browsers connected to it over a server-sent events stream. It adds the `PubSub` port, one implementation of it as a new adapter package on Postgres `LISTEN/NOTIFY`, and the client changes in `hlms-community`. It adds no bounded context and no data migration.

This design is written against `feature/configurable-roles`: services take the actor last and read the org from it, routes declare their operation, and moderation is the `communities:moderate` permission.

**Example data.** The org Spanish in 90 Days, its community Spring cohort (`cmy_1`). Sarah and James have a direct chat (`cht_1`); Sarah, James and Emma have a group chat (`cht_2`). The API runs as two instances, A and B, behind one load balancer.

Paths without a prefix are in `headless-lms`; paths starting `hlms-community/` are in the community app.

## 1. The problem

`hlms-community/src/app/(community)/chats/layout.tsx:10` mounts `<AutoRefresh />`, which calls `router.refresh()` every 5,000 ms while the tab is visible (`hlms-community/src/components/chats/auto-refresh.tsx:6-19`). Each refresh re-renders the whole chat route on the server: `getHome()`, `getMe()`, the full member directory (`getPeople()`) and the full chat list (`getChats()`) (`hlms-community/src/app/(community)/chats/[chatId]/page.tsx:62`), plus every loaded page of messages. Every chat action also calls `refresh()` through `mutate()` (`hlms-community/src/server/actions/shared.ts:17-21`).

Measured in QA (`hlms-community/docs/qa/issues.md`):

- about 9–10 API calls per open tab every 5 s, growing with the directory (`:366`);
- about 136 KB compressed, 549 KB decoded per refresh, about 1.6 MB per minute per open chat (`:569`);
- during an API stall, overlapping renders of one chat at 94–111 s each and 90 `fetch failed` errors (`:367`).

## 2. What we have

### 2.1 The event system

- A write and its domain events commit together: services append events to the outbox inside the write's `UnitOfWork` (`packages/core/src/shared/ports.ts`).
- Every API process runs an outbox relay, started by its entry point (`apps/api/src/main.ts:44`). A relay selects unprocessed rows with `FOR UPDATE SKIP LOCKED` inside a transaction that ends when the select returns (`adapters/db/src/repositories/outbox.ts:47-62`), and publishes each to its own `EventBus`. Within one batch, events of one chat are dispatched in order (`orderingKey`, `adapters/defaults/src/events/outbox-relay.ts:41-53`). Across batches and relays there is no order: two relays can dispatch the same row, and a failed row is retried later while later rows flow. Handlers are idempotent on event id.
- The only subscriber on the `EventBus` today is `automations.handle` (`packages/server/src/app/container.ts:727`). A handler that throws fails the event, and the relay retries it.

An event is handled on whichever instance dispatched it. Nothing delivers an event to every instance, which is what live delivery needs: Sarah's stream is open on A while James's message is dispatched on B.

### 2.2 Chat events

| Write | Event today |
|---|---|
| start a chat | `discussion.chat.created` with `participantIds` |
| send | `discussion.message.sent`; `discussion.chat.updated` when a reply opens a request |
| edit, delete | `discussion.message.updated`, `discussion.message.deleted` |
| accept, lock, unlock | `discussion.chat.updated` with the active `participantIds` |
| leave | `discussion.chat.updated` with the remaining `participantIds`; the leaver is the event's `actorOrgUserId` |
| add participant | `discussion.chat.participant.added` |
| reaction | `discussion.message.reaction.added` when the member had no reaction on the message and one is inserted; changing or clearing it emits nothing (`adapters/db/src/repositories/chats.ts:533-541`) |
| mark read | nothing; written outside a unit of work, unconditionally (`packages/core/src/discussion/chats.ts:481`; `adapters/db/src/repositories/chats.ts:351-367`) |
| mute a chat | nothing; `SubscriptionService.write` writes the repository directly (`packages/core/src/discussion/subscriptions.ts`) |

### 2.3 Reads

The member chat routes are in `packages/server/src/http/routes/member/chats.ts`; the attachment route is in `routes/member/files.ts` and the moderators' lock routes in `routes/community-moderation.ts`. There is no read for one chat, for the direct chat with a given member, or for the unread total. The app reads every chat to find one, sums the unread total from all of them (`hlms-community/src/server/data.ts:87-98`), and reads the whole directory for names, headlines and avatars, because `ChatListItem` carries `participantIds` only (`packages/server/src/http/schemas/chats.ts`).

## 3. Design

### 3.1 How a message travels

```
James ── POST /chats/cht_1/messages ──▶ instance B
         ChatService.send: save message + outbox.append(message.sent) ── commit

relay (whichever instance dispatches the row, say B)
  EventBus ─▶ ChatLiveForwarder ─▶ PubSub.publish('discussion.chats', change)   never throws
           └▶ automations.handle                                                 as today

PubSub delivers to every instance
  instance A: ChatHub — streams in cmy_1 → active participants of cht_1 → Sarah has a stream
              → read msg_9 once → push message.created → push Sarah's chat.state and unread
  instance B: same, for James's second tab
```

The write path does not change. Live delivery is one more consumer of the events chat writes commit.

### 3.2 The `PubSub` port

In `packages/core/src/shared/ports.ts`:

```ts
/** Messages published on any instance, delivered to every subscriber on every
 *  instance, the publisher's included. Best effort: a subscriber can miss
 *  messages while its instance is disconnected; `onReset` fires after every
 *  reconnect. No ordering is promised. `start` never fails on connectivity:
 *  it keeps reconnecting and fires `onReset` once connected. */
export interface PubSub {
  publish(channel: string, message: JsonValue): Promise<void>;
  subscribe(
    channel: string,
    handler: (message: JsonValue) => void,
    onReset: () => void,
  ): () => void;
  start(): Promise<void>;
  stop(): Promise<void>;
}
```

The contract sets no size limit on a message; an implementation that has one handles it internally.

The one implementation is `PostgresPubSub` in the new package `@headless-lms/adapter-pubsub-postgres` (`adapters/pubsub-postgres`), and every deployment runs it, a single instance included.

The container takes it as `adapters.pubsub`, beside `workflows` and `pushSender`, and exposes it as `container.pubsub`. A container built without one, as `gen:openapi` builds it (`apps/api/scripts/gen-openapi.ts:11`), has no forwarder and no hub, and the stream route answers 503.

```ts
import { PostgresPubSub } from '@headless-lms/adapter-pubsub-postgres';

const container = await createContainer(config, {
  adapters: {
    pubsub: new PostgresPubSub({ connectionString: config.pubsubDatabaseUrl, logger }),
  },
});
```

### 3.3 `@headless-lms/adapter-pubsub-postgres`

A new package in `adapters/pubsub-postgres`, laid out like `adapters/workflow-hatchet` (`package.json`, `tsconfig.json`, `tsdown.config.ts`, `src/index.ts`, `README.md`), depending on `@headless-lms/core` and `pg` (the version `adapters/db` uses). It reads no environment itself.

- **Listening.** `start()` opens one dedicated `pg.Client` with `keepAlive: true`, outside any pool, and runs `LISTEN hlms_pubsub`. Every channel shares that one Postgres channel; a notification carries the channel name and the adapter dispatches to that channel's handlers.
- **Publishing.** `publish` runs `SELECT pg_notify('hlms_pubsub', $1)` on the adapter's own `pg.Pool` of 2 connections, created in the constructor, so publishing works whether or not `start()` has run.
- **Encoding.** A message is serialized to JSON, encoded as UTF-8 and then as base64, so the payload is ASCII and its length in characters is its length in bytes. A payload of up to 7,800 characters is sent as `{ c, d }`. A longer one is split into 7,800-character parts sent as `{ c, id, i, n, d }`, all with `pg_notify` in one transaction; Postgres delivers one transaction's notifications in the order they were sent. The listener concatenates the parts by `id` and dispatches once all `n` arrived; parts not completed within 10 s, and all parts on reconnect, are dropped.
- **Liveness.** Every 30 s the adapter publishes a ping on its own channel and expects it back on the listener within 10 s. A missing ping, an `error` or an `end` on the listening connection ends it; the adapter reconnects with exponential backoff and full jitter (1 s up to 30 s), runs `LISTEN` again and calls every subscriber's `onReset`.
- **Start.** `start()` makes the first connection attempt and resolves after it, connected or not; a failed attempt is logged and retried as above.
- **Shutdown.** `stop()` stops the ping, runs `UNLISTEN *`, and closes the listening connection and the pool. It is a no-op when the adapter was never started.
- **Poolers.** `LISTEN` needs a session connection. Behind a transaction-mode pooler the connection string points at Postgres directly. `apps/api` reads it from `PUBSUB_DATABASE_URL`, defaulting to `DATABASE_URL`.

### 3.4 Chat events

The writes that emit nothing today get domain events, appended inside their unit of work like every other chat write:

| Event | Data | Emitted by |
|---|---|---|
| `discussion.chat.read` | `chatId`, `communityId`, `orgUserId`, `lastReadMessageId` | `markRead`, which moves into the unit of work and stores the mark only when the message is newer (by `created_at`, then id) than the current one; an older mark is a no-op and emits nothing |
| `discussion.message.reactions.changed` | `messageId`, `chatId`, `communityId`, `orgUserId`, `reaction` (null when cleared) | every `setReaction` that changes the member's reaction; the repository's `setReaction` reports both whether it inserted and whether it changed anything, and `discussion.message.reaction.added` keeps its meaning |
| `discussion.subscription.changed` | `itemType`, `itemId`, `communityId`, `orgUserId` | `SubscriptionService.write`, which gains a unit of work with the outbox |

They are defined in `packages/core/src/discussion/events.ts` without a public form, so they are not automation triggers or webhook events (the trigger catalog lists every event that has one, `packages/core/src/automations/catalog.test.ts:114`), and a member's read marks and mutes stay theirs.

Messages gain a `clientId` (3.8). The event schemas leave it out (`messageSchema.omit({ clientId: true })` in `messageEventSchema`, the deleted event's data and `publicMessage`), so webhook payloads are unchanged and outbox rows written before the deploy still parse.

Typing is not stored and is not a domain event: `ChatService.typing` publishes straight to `PubSub` (3.8).

### 3.5 The forwarder

`ChatLiveForwarder` (`packages/core/src/discussion/live.ts`) subscribes on the `EventBus` to `chat.created`, `chat.updated`, `chat.participant.added`, `message.sent`, `message.updated`, `message.deleted`, `message.reactions.changed`, `chat.read`, and `subscription.changed` for chats. For each it publishes a `ChatChange` to the channel `discussion.chats`:

```ts
type ChatChange = {
  event: string;              // the domain event's type, or 'typing'
  orgId: string;
  communityId: string;
  chatId: string;
  messageId?: string;
  orgUserId?: string;         // the reader, the reacting or muting member, the added member, the typist
  actorOrgUserId?: string;    // from the event's metadata: on a leave, the member who left
  participantIds?: string[];  // chat events: the active participants after the change
  reaction?: string | null;   // reactions.changed
  until?: string;             // typing
};
```

A change never carries a body; each instance reads current state itself (3.6).

The forwarder never throws. A failed publish is logged as `live publish failed` and dropped, so a `PubSub` outage cannot hold back or park the event for `automations.handle`. Clients recover what they missed on their next load (3.11): a failed publish almost always means the database connection is down, which also drops every listener, and their reconnect sends `resync`.

A change can arrive twice, from a retried event or two relays dispatching one row. The hub reads current state for each, so the second push carries the same state, and the client merges by id.

### 3.6 The hub

`ChatHub` (`packages/core/src/discussion/live.ts`), one per process, holds this process's open streams indexed by member and by community. Both are fixed when a stream connects. The hub keeps no record of which chats a stream is in: for every change it reads the chat's current active participants, so a join, a leave or a missed change never leaves routing wrong.

It subscribes to `discussion.chats` in `start()`. Changes are queued per chat and handled one chat at a time per chat, many chats in parallel. While a chat's change is being handled, newer changes for it coalesce: message changes by message id, chat changes into one. The hub holds at most 5,000 pending changes; past that it drops them all and pushes `resync` to every stream.

| Change | Action |
|---|---|
| any, no local stream in the change's community | ignore |
| `message.sent`, `message.updated`, `message.deleted` | read the chat's active participants; keep the local streams of those members; if none, stop. Read the message once (`messageViews`, viewer-neutral) and push `message.created`, `message.updated` or `message.deleted` |
| `message.reactions.changed` | as above, reading the message's reaction counts once; push `message.reactions` |
| `chat.created`, `chat.updated`, `chat.participant.added` | the participants are `participantIds` from the change. Read the chat and its participants' profiles once. Push `chat.updated` to the local streams of participants. On a leave, push `chat.removed` to the local streams of `actorOrgUserId` when it is not a participant |
| `chat.read`, `subscription.changed` | for `orgUserId`'s local streams only |
| `typing` | read the active participants; push `typing` to the other participants' local streams |
| `onReset` from `PubSub` | push `resync` to every stream |

**Member state.** After a message is sent or deleted, a chat is started, accepted, left or joined, a read mark moves or a mute changes, each affected local member gets their `chat.state` for that chat and their `unread`. The hub reads them for all affected members in one query, and pushes at most once a second per member, always delivering the latest values at the end of the second.

**Failures.** When a read for a change fails, the hub logs it and pushes `resync` to the local streams in that community.

`ChatService.watch(communityId, session, actor)` opens one stream and returns an `AsyncIterable<ChatLiveEvent>`:

1. `requireSettings` and `requireActor` (entitlements), as `listChats` does.
2. Register the stream with the hub. When the hub is closing, yield `closed { reason: 'shutdown' }` and end.
3. Yield `ready`, then the member's current `unread`.
4. Every 30 s, with a random offset of up to 5 s so streams that connected together spread out: `session.current()` resolves the actor again, and `requireActor` runs with it. No actor yields `closed { reason: 'session' }`; no access yields `closed { reason: 'access' }`; either ends the stream. The re-resolved actor replaces the old one, so a changed role takes effect.
5. A queue of at most 256 events. On overflow drop it and yield `resync`.

`session.current()` is supplied by the HTTP layer: it verifies the request's cookie with the session cookie cache bypassed, then resolves the actor through `organizations.actorFor`, as `resolveActor` does. `SessionVerifier.verify` (`packages/core/src/types/identity.ts:33-34`) gains an option to bypass the cache, implemented with `getSession({ query: { disableCookieCache: true } })` in `adapters/auth/src/better-auth.ts`.

### 3.7 Startup and shutdown

- The entry point starts `container.pubsub` and `container.chatHub` before `listen`, beside `outboxRelay.start()` (`apps/api/src/main.ts`, `packages/create-headless-lms/templates/src/main.ts`).
- A `preClose` hook in `packages/server/src/http/server.ts` calls `chatHub.close()`. The hub sets `closing`, pushes `closed { reason: 'shutdown' }` to every stream and ends them. Without it, Fastify destroys the open connections after `preClose` (`forceCloseConnections` defaults to `'idle'`) and clients get a reset instead of the frame.
- The `onClose` hook stops the relay, then the automation engine, then `PubSub`, so events still in flight when the relay stops are forwarded.

### 3.8 Endpoints and contract changes

New routes, each declared `'member'` in `chatsDeclarations` and routed with `config: { operation }`:

| Route | operation | operationId | Response |
|---|---|---|---|
| `GET /api/member/communities/:communityId/chats/events` | `chats.watch` | `streamMemberChatEvents` | `200 text/event-stream`, items `ChatLiveEvent` |
| `GET /api/member/chats/:chatId` | `chats.chat` | `getMemberChat` | `ChatListItem` |
| `GET /api/member/communities/:communityId/chats/direct/:orgUserId` | `chats.directChat` | `getMemberDirectChat` | `ChatListItem`, or 404 when there is none |
| `GET /api/member/communities/:communityId/chats/unread` | `chats.unreadSummary` | `getMemberChatUnread` | `{ unread, requests }` |
| `POST /api/member/chats/:chatId/typing` | `chats.typing` | `sendChatTyping` | `204` |

- `chat` and `directChat` check access as `messages` does: community membership and an active participant.
- `unread` is the unread messages across the member's chats that are neither muted nor requests to them, plus the number of pending requests to them; `requests` is that number. This is the total the app computes today (`hlms-community/src/server/data.ts:87-98`).
- `typing` requires an active participant of a chat that is not closed or locked. It publishes `{ event: 'typing', …, until: now + 5 s }` and drops a repeat from the same member in the same chat within 2 s on that instance.
- `ChatService` gains `watch`, `chat`, `directChat`, `unreadSummary` and `typing`, actor last; `messageViews(orgId, messageIds)` is declared `'system'`.

Changes to existing contracts:

- `listMemberChats` gains an optional `requests` query: `true` returns only the pending requests to the member, `false` everything else, omitted everything as today.
- `ChatListItem` gains `participants: CommentAuthor[]`, the active participants' profiles (`headline`, `team` and `roleName` included), so the inbox, the chat header and the direct-message refusal need no directory. `ChatInboxRow` in `packages/core/src/discussion/ports.ts` and `listForUser` gain it.
- `SendMessage` gains an optional `clientId` (UUID), and `MessageView` returns it. A repeat send by the same member in the same chat with the same `clientId` returns the stored message and appends no event; two concurrent sends meet the unique index and the loser returns the winner's message. Stored as `messages.client_id`, unique on `(org_id, chat_id, org_user_id, client_id)`.

### 3.9 The stream route in Fastify

The route is an ordinary `r.route` with `preHandler: app.requireOrgSession`, `config: { operation: 'chats.watch' }`, a description from `describeOperation`, a Zod schema and one call:

```ts
handler: async (req, reply) => {
  const actor = await resolveActor(container, req);
  return sse(reply, chats.watch(req.params.communityId, sessionOf(container, req), actor));
},
```

`sse` (`packages/server/src/http/sse.ts`):

- calls `reply.hijack()` and writes the headers already set by the request hooks (`@fastify/cors` sets them in `onRequest`; `x-request-id`), plus `content-type: text/event-stream; charset=utf-8`, `cache-control: no-cache, no-transform` and `x-accel-buffering: no`;
- writes each event as `event: <type>` and `data: <JSON>`, the JSON including `type`, because the generated SDK client yields only the parsed `data` (`packages/sdk/src/generated/core/serverSentEvents.gen.ts:205-213`);
- waits for `drain` when a write returns false; a write still undrained after 30 s ends the stream;
- writes a `: ping` comment every 25 s;
- ends the response when the iterable ends, and ends the iterable when the client disconnects.

The schema declares the response as content:

```ts
response: {
  200: { content: { 'text/event-stream': { schema: ChatLiveEvent } } },
  ...refusals(403, 404, 503),
}
```

`fastify-type-provider-zod` passes the media type through to `@fastify/swagger`, and `@hey-api/openapi-ts` generates a stream method for a `text/event-stream` response on the SSE client the SDK already ships.

```
event: ready
data: {"type":"ready","heartbeatMs":25000}

event: unread
data: {"type":"unread","unread":3,"requests":1}

event: message.created
data: {"type":"message.created","chatId":"cht_1","message":{"id":"msg_9","clientId":"0f6c…","sender":{…},…}}

: ping
```

### 3.10 Event types

`ChatLiveEvent` is a union discriminated by `type`. `LiveMessage` is `MessageView` without `viewerReaction`.

| Event | Data | Meaning |
|---|---|---|
| `ready` | `heartbeatMs` | the stream is registered; load state (3.11) |
| `message.created` | `chatId`, `message` (`LiveMessage`) | a message was sent |
| `message.updated` | `chatId`, `message` (`LiveMessage`) | a message was edited |
| `message.deleted` | `chatId`, `messageId`, `deletedAt` | a message was deleted |
| `message.reactions` | `chatId`, `messageId`, `reactions`, `orgUserId`, `reaction` | a member's reaction changed; `reactions` are the new counts, `reaction` is null when cleared |
| `chat.updated` | `chatId`, `chat` (`Chat`), `participants` | the chat exists for this member, or its state or participants changed |
| `chat.removed` | `chatId` | the member left this chat |
| `chat.state` | `chatId`, `unread`, `lastReadMessageId`, `subscription` | the member's own state in this chat |
| `unread` | `unread`, `requests` | the member's unread total and pending requests |
| `typing` | `chatId`, `orgUserId`, `until` | a participant is typing until `until` |
| `resync` | — | events may have been missed; load state (3.11) |
| `closed` | `reason`: `access`, `session`, `shutdown` | the stream ended |

`chat.state` and `unread` carry the member's own state; every other event is the same for every recipient. A deleted message's body is never pushed; moderators read it through `messages` and `listChats` as today.

### 3.11 The client loads state on every connect

1. Open the stream.
2. On `ready`, start buffering events, and load inbox page 1 (`listMemberChats`), the pending requests (`listMemberChats` with `requests=true`) and the latest page of the open chat (`listChatMessages`). The `unread` after `ready` sets the badge.
3. When the loads settle, replace the inbox rows and the requests with them, drop every thread but the open one (it loads again when opened), merge the open chat's page by message id, and then apply the buffered events in order.
4. While connected, apply events as they arrive.
5. On `resync`, wait a random 0–3 s and repeat steps 2–3. On a dropped connection or `closed { reason: 'shutdown' }`, reconnect after a random 0–5 s; the new stream starts at step 1.

Sarah closes her laptop. James sends two messages in `cht_1` and edits one; Emma deletes hers in `cht_2`. Sarah's tab reconnects to instance B, gets `ready` and `unread`, and loads: the inbox with both chats moved up and their unread counts, and the latest page of `cht_1` with James's edit. Nothing depends on what the stream carried while she was away.

### 3.12 Auth

- The stream request passes `requireOrgSession` (Better Auth session from the cookie, active organization required), resolves the actor, and passes `requireActor` (entitlements), as `listChats` does.
- A stream receives a chat's events only while its member is an active participant at the moment the hub handles the change.
- Every 30 s the stream re-resolves the actor and re-checks community access. A revoked or expired grant, a removed bundle item or a removed org user ends it with `closed { reason: 'access' }`. A session that ended, by signing out in that browser, by a password reset (which revokes every session, `adapters/auth/src/better-auth.ts:190`) or by expiry, ends it with `closed { reason: 'session' }`.
- The browser connects with credentials from an allowed origin (`packages/server/src/http/plugins/cors.ts`); the cookie is `SameSite=Lax`, so other sites cannot open a stream with it.

### 3.13 Operations

- The heartbeat (25 s) stays under the common 60 s proxy idle timeout; proxies must not buffer the route.
- The API is served over HTTP/2 in production. Over HTTP/1.1 a browser allows six connections per origin across all tabs, and each open tab's stream holds one, so a sixth tab starves every request to the API.

### 3.14 The community app

**Store.** `src/lib/live/chat-store.ts` holds, per tab: inbox rows and requests by chat id, threads by chat id (messages by id, display order, `more`), the unread total, typing marks and the connection state. Components read it with `useSyncExternalStore`. A pure reducer applies events:

- `message.created` inserts by id, keeping a stored message's `viewerReaction`; when the sender is the viewer it also replaces the viewer's own pending message with the same `clientId`. It moves the inbox row up, or calls `getMemberChat` when the chat has no row. It clears the sender's typing mark.
- `message.updated` replaces the message's fields by id, keeping `viewerReaction`; `message.reactions` replaces the counts, and sets `viewerReaction` when `orgUserId` is the viewer.
- `message.deleted` marks the message deleted and drops its body and images.
- `chat.updated` upserts the row's chat and participants; `chat.removed` drops the row and leaves the thread if it is open.
- `chat.state` sets the row's unread count, read mark and mute; `unread` sets the badge. The client never counts unread itself.
- `typing` shows a mark until `until`.

When a mute on a loaded row lapses, the client fetches `getMemberChatUnread` at `mutedUntil`.

**Connection.** `src/lib/live/connection.ts` opens `Chats.streamMemberChatEvents` from a browser SDK client (`baseUrl` = `NEXT_PUBLIC_API_URL`, `credentials: 'include'`) with the SDK's own retry off (`sseMaxRetryAttempts: 0`), and drives reconnects itself: exponential backoff with full jitter from 1 s up to 30 s. A 401 or `closed { reason: 'session' }` stops and goes to sign-in; a 403 or `closed { reason: 'access' }` stops and shows the app's no-access state. When three connects fail within a minute it also polls `getMemberChatUnread`, inbox page 1 and the open chat's latest page every 15 s while visible, one request at a time, and stops polling once a stream reaches `ready`. It closes the stream after the tab has been hidden for 60 s and reopens it when the tab is visible again.

**Writes.** Chat actions use a `call` helper in `src/server/actions/shared.ts` that returns the API's result without calling `refresh()`. `mutate()` and every other action are unchanged.

**Optimistic send.** The composer adds a pending message with a new `clientId`, sends, and replaces it with the returned `MessageView`. If `message.created` with the same `clientId` and the viewer as sender lands first, it replaces the pending one. A failed send keeps the pending message with a retry that reuses the `clientId`.

**Read marks.** When a message from someone else arrives in the open chat while the tab is visible and the view is at the bottom, the client calls `markChatRead` after 1 s of quiet.

**Typing.** The composer calls `sendChatTyping` at most every 3 s while the member types.

## 4. Files

### 4.1 headless-lms

| File | Change |
|---|---|
| `packages/core/src/shared/ports.ts` | `PubSub` |
| `packages/core/src/types/identity.ts`, `adapters/auth/src/better-auth.ts` | `SessionVerifier.verify` option to bypass the cookie cache |
| `packages/core/src/discussion/events.ts` | `chat.read`, `message.reactions.changed`, `subscription.changed`; `clientId` left out of message event schemas |
| `packages/core/src/discussion/chats.ts` | `markRead` in the unit of work, forward only, with its event; `setReaction` event; `clientId` on send; `watch`, `chat`, `directChat`, `unreadSummary`, `typing`, `messageViews`; `participants` on list items |
| `packages/core/src/discussion/subscriptions.ts`, `subscriptions.test.ts` | unit of work and `subscription.changed` |
| `packages/core/src/discussion/live.ts`, `live.test.ts` | new: `ChatLiveForwarder`, `ChatHub`; tests use a local fake `PubSub` (lint keeps core from importing adapters) |
| `packages/core/src/discussion/ports.ts` | `ChatService` additions; `ChatInboxRow` and `ChatListItem` with `participants`; repository `findByClientId`, `unreadSummary`, `memberStates`, `activeParticipants`, `setRead` forward only, `setReaction` result |
| `packages/core/src/discussion/declarations.ts` | entries for the new `ChatService` methods |
| `packages/core/src/discussion/index.ts`, `packages/core/src/types/discussion.ts` | export the hub, the forwarder, `ChatLiveEvent`, `LiveMessage`, `ChatUnreadSummary` |
| `packages/core/src/types/schemas/discussion.ts` | `clientId` on message, `ChatLiveEvent`, `LiveMessage`, `ChatUnreadSummary` |
| `adapters/db/src/schema/discussion.ts` + a migration generated after `0017_configurable_roles` | `messages.client_id` and its unique index |
| `adapters/db/src/repositories/chats.ts` | the new repository reads; `client_id` on insert; `setRead` forward only; `setReaction` result; `requests` filter |
| `adapters/pubsub-postgres/` | new package: `PostgresPubSub`, tests, `README.md` |
| `packages/server/src/app/container.ts` | `adapters.pubsub`; with it, `container.pubsub`, `container.chatHub` and the forwarder on the bus; a unit of work for `SubscriptionService` |
| `packages/server/src/http/sse.ts` | new: frame writer, backpressure, heartbeat |
| `packages/server/src/http/routes/member/chats.ts`, `packages/server/src/http/schemas/chats.ts`, `schemas/chats.test.ts` | the five routes; `requests` query; `participants` on `ChatListItem`; `clientId` on send |
| `packages/server/src/http/server.ts` | `preClose` closes the hub; `onClose` stops relay, engine, then `PubSub` |
| `packages/server/src/http/config.ts`, `apps/api/src/config.ts`, `.env.example` | `pubsubDatabaseUrl` from `PUBSUB_DATABASE_URL` |
| `apps/api/src/main.ts`, `apps/api/package.json` | inject `PostgresPubSub`; start `PubSub` and the hub before `listen` |
| `packages/create-headless-lms/templates/src/main.ts` | start `PubSub` and the hub |
| `tsconfig.base.json`, `vitest.config.ts` | path and alias for `@headless-lms/adapter-pubsub-postgres` |
| `.github/workflows/ci.yml` | a Postgres service and `TEST_DATABASE_URL` for the Postgres suites |
| `.changeset/config.json` | `@headless-lms/adapter-pubsub-postgres` added to `ignore`, like the other optional adapters |
| `.changeset/*.md` | changesets for core, server, sdk, adapter-db, adapter-defaults and adapter-auth |
| `packages/sdk` | regenerate (`pnpm gen:sdk`, which also regenerates the MCP docs) |

### 4.2 hlms-community

| File | Change |
|---|---|
| `vendor/headless-lms-sdk-main.tgz`, `pnpm-lock.yaml` | repack the SDK from this branch |
| `src/components/chats/auto-refresh.tsx` | delete |
| `src/app/(community)/chats/layout.tsx` | remove `<AutoRefresh />` |
| `src/app/(community)/layout.tsx` | mount `<ChatLive>` once for the community |
| `src/lib/live/chat-store.ts`, `chat-store.test.ts`, `connection.ts`, `api.ts` | new: store and reducer; stream, load, reconnect and polling; browser SDK client |
| `src/components/chats/chat-live.tsx` | new: provider and connection lifecycle |
| `src/components/chats/inbox.tsx`, `inbox-pane.tsx` | page 1 and requests on the server, rows from the store, names from `participants` |
| `src/app/(community)/chats/[chatId]/page.tsx` | `getMemberChat` and the latest page only; header and refusal from `participants`; no `getChats()`, `getPeople()` or page loop |
| `src/app/(community)/chats/with/[orgUserId]/page.tsx` | `getMemberDirectChat` instead of `getChats()` |
| `src/lib/chats.ts`, `src/lib/chats.test.ts` | `chatTitle` and `otherParticipant` from `participants`, not the directory |
| `src/components/chats/thread.tsx` | render from the store; read marks |
| `src/components/chats/composer.tsx` | optimistic send with `clientId`; typing |
| `src/components/chats/chat-chrome.tsx` | addable people searched on open, not passed as a prop |
| `src/components/shell/frame.tsx` | chat badges from the store |
| `src/server/actions/chats.ts`, `src/server/actions/shared.ts` | chat actions through `call`; `clientId` on send |
| `src/server/data.ts` | `getChat`, `getDirectChat`, `getChatUnread`; the inbox reads page 1 and requests only |
| `src/proxy.ts` | the comment that only the server talks to the API after sign-in |
| `README.md` | the 5-second refresh and `refresh()` lines (`:19`); `NEXT_PUBLIC_API_URL` now also used for the chat stream (`:62`) |

## 5. Documentation

| Where | What |
|---|---|
| `adapters/pubsub-postgres/README.md` | what it implements; constructor options; wiring into `createContainer` and starting it; the dedicated listening connection and poolers; encoding of large messages; liveness and reconnect |
| `apps/website/content/docs/adapters/pubsub/postgres.mdx`, `pubsub/meta.json`, `adapters/meta.json`, `adapters/index.mdx` | the public page for the adapter, in the form of the Hatchet page; the `pubsub` slot listed with the other adapter slots and in the entry-point snippet |
| `README.md`, `docs/project-structure.md`, `apps/website/content/docs/project-structure.mdx`, `packages/server/README.md` | the package in the adapter tables; the entry-point snippet starts `PubSub` and the hub |
| `apps/website/content/docs/self-hosting.mdx` | live chat needs the `PubSub` adapter; `PUBSUB_DATABASE_URL`; HTTP/2 for the API; proxy buffering and idle timeouts for the stream route |
| `apps/website/content/docs/building-a-frontend.mdx` | live chat: open the stream, load state on `ready` and `resync` with buffering, apply events, send with `clientId`, drive reconnects, poll as a fallback |
| `apps/website/content/docs/architecture.mdx`, `docs/architecture.md` | the `PubSub` port beside the outbox and the bus |
| `apps/website/content/docs/api/chats/` | the new operations, generated from `openapi.json` (`pnpm --filter website gen:api-docs`) |
| `docs/domain/discussion.md` | live chat updates as a discussion capability; the new events, in domain terms |

## 6. Test plan

Suites that need Postgres run when `TEST_DATABASE_URL` is set and are skipped otherwise; CI sets it (4.1).

**`PostgresPubSub`** (Postgres, two adapter instances on one database).

- A message published on one instance reaches every subscriber of the channel on both, the publisher's included, and no subscriber of another channel.
- An unsubscribed handler receives nothing.
- A 50 KB message of quotes, backslashes, emoji and CJK text arrives whole and once.
- `pg_terminate_backend` on the listening connection: the adapter reconnects, `onReset` fires, later messages arrive.
- A listener that stops receiving without an error (its pings blocked): within 40 s the adapter reconnects and `onReset` fires.
- `publish` before `start` delivers once started; `start` with Postgres down resolves, and the adapter connects and fires `onReset` when Postgres is back.
- `stop()` closes the listening connection and the pool.

**Forwarder and hub** (`packages/core/src/discussion/live.test.ts`, fakes).

- A message in `cht_1` reaches Sarah's and James's streams and not Emma's.
- James starts a request to Sarah, who has a stream and no chats: she gets `chat.updated`, `chat.state` and `unread` with `requests` up by one; she accepts and it drops.
- James adds Emma to `cht_2` while her stream is connecting: once `ready`, her next `cht_2` message reaches her.
- Emma leaves `cht_2`: she gets `chat.removed`. A message James sends after her leave does not reach her, whichever of the two changes the hub handles first.
- 100 `chat.participant.added` changes for one group arriving together are handled with at most two participant reads.
- A message edited twice in quick succession: the last push carries the second edit.
- A failing `PubSub.publish` does not stop `automations.handle` for the event.
- A failing read sends `resync` to the community's streams; `onReset` and a full queue send `resync`.
- No pushed event carries `viewerReaction`, a deleted message's body or another member's state.
- `markRead` with an older message changes nothing and emits nothing.
- A repeat send with the same `clientId` returns the first message and appends no event.
- A typing repeat within 2 s is dropped.

**Two instances** (server integration, Postgres: two containers and two Fastify instances with `PostgresPubSub`).

- Sarah's stream on A; James sends through B: Sarah receives `message.created` with the body James sent; James's second tab on B receives it too.
- An edit, a delete and a reaction through A reach both.
- Abort Sarah's stream, send two messages and an edit through B, reconnect her to B: after `ready`, the loads in 3.11 return the two messages and the edit.

**Access.**

- No cookie: 401. A member of another community: 403. A server built without a `PubSub`: 503.
- Revoke Sarah's grant, let it expire through the expiry job, or remove the community from her bundle: within 35 s her stream yields `closed { reason: 'access' }`; a new connect returns 403.
- Sign Sarah out in the browser that holds the stream, or reset her password: her stream yields `closed { reason: 'session' }`; a new connect returns 401.

**Contract and operations.**

- `openapi.json` declares `text/event-stream` for `streamMemberChatEvents`; the regenerated SDK exposes it as a stream method whose items carry `type`.
- Through nginx with default buffering, events arrive as written and heartbeats keep a 5-minute idle stream open.
- `app.close()` with open streams completes and each client receives `closed { reason: 'shutdown' }`; a stream connecting during `close()` receives it too.
- A client that stops reading: its stream ends within 30 s of the first undrained write.
- Repeat the LOAD-05 burst (`hlms-community/docs/qa/issues.md:357-378`) with streams open on both instances, and record the time from each send's commit to its `message.created` on the other instance.

**Community app.**

- Reducer: merge by id keeps `viewerReaction`; optimistic replacement by `clientId` only for the viewer's own messages, whether the response or the event lands first; events buffered during the `ready` loads are applied after them; another member's message with the same `clientId` replaces nothing.
- Two browsers, Sarah and James: James's message appears for Sarah without a reload, and the network panel shows no RSC requests while the chat is idle.
- Repeat the UI-24 measurement (`hlms-community/docs/qa/issues.md:563-570`): an idle open chat transfers only heartbeats.
- Hide the tab for 60 s: the stream closes; show it: it reconnects and loads state.
- Block the stream route at the proxy: after three failed connects the app polls, and it returns to the stream when unblocked.
- A post, a comment and a profile edit still refresh their pages.
