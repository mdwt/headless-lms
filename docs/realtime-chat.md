# Realtime chat: design

Nov 5, 2026 · @Meiring

The community app learns about chat changes by re-rendering every chat page every 5 seconds. This design replaces that with live delivery from the API: chat changes are domain events, every API instance receives them through a new pub/sub port, and each instance pushes them to the browsers connected to it over a server-sent events stream. It adds the `PubSub` port, one implementation of it as a new adapter package on Postgres `LISTEN/NOTIFY`, and the client changes in `hlms-community`. It adds no bounded context and no data migration.

**Example data.** The org Spanish in 90 Days, its community Spring cohort (`cmy_1`). Sarah and James have a direct chat (`cht_1`); Sarah, James and Emma have a group chat (`cht_2`). The API runs as two instances, A and B, behind one load balancer.

Paths without a prefix are in `headless-lms`; paths starting `hlms-community/` are in the community app.

## 1. The problem

`hlms-community/src/app/(community)/chats/layout.tsx:10` mounts `<AutoRefresh />`, which calls `router.refresh()` every 5,000 ms while the tab is visible (`hlms-community/src/components/chats/auto-refresh.tsx:6-19`). Each refresh re-renders the whole chat route on the server: `getHome()`, `getMe()`, the full member directory (`getPeople()`) and the full chat list (`getChats()`) (`hlms-community/src/app/(community)/chats/[chatId]/page.tsx:62`), plus every loaded page of messages. Every chat action also calls `refresh()` (`hlms-community/src/server/actions/shared.ts:19`).

Measured in QA (`hlms-community/docs/qa/issues.md`):

- about 9–10 API calls per open tab every 5 s, growing with the directory (`:366`);
- about 136 KB compressed, 549 KB decoded per refresh, about 1.6 MB per minute per open chat (`:569`);
- during an API stall, overlapping renders of one chat at 94–111 s each and 90 `fetch failed` errors (`:367`).

## 2. What we have

### 2.1 The event system

- A write and its domain events commit together: services append events to the outbox inside the write's `UnitOfWork` (`packages/core/src/shared/ports.ts:75-92`).
- Every API instance runs an outbox relay. A relay claims committed rows (`FOR UPDATE SKIP LOCKED`, `adapters/db/src/repositories/outbox.ts`) and publishes each to its `EventBus`, in order per chat (`orderingKey`, `adapters/defaults/src/events/outbox-relay.ts:41-53`). Delivery is at-least-once; handlers are idempotent on event id.
- The only subscriber is `automations.handle` (`packages/server/src/app/container.ts:726-727`).

Each event is handled on exactly one instance, which is right for automations. Nothing delivers an event to every instance, which is what live delivery needs: Sarah's stream is open on A while James's message is dispatched on B.

### 2.2 Chat events

| Write | Event today |
|---|---|
| start a chat | `discussion.chat.created` |
| send | `discussion.message.sent`; `discussion.chat.updated` when a reply opens a request |
| edit, delete | `discussion.message.updated`, `discussion.message.deleted` |
| accept, leave, lock, unlock | `discussion.chat.updated` |
| add participant | `discussion.chat.participant.added` |
| reaction | `discussion.message.reaction.added` for the first reaction of a kind only; clearing or replacing emits nothing (`packages/core/src/discussion/chats.ts:449-480`) |
| mark read | nothing; written outside a unit of work (`chats.ts:482-492`) |
| mute a chat | nothing; `SubscriptionService.write` writes the repository directly (`packages/core/src/discussion/subscriptions.ts:141-166`) |

### 2.3 Reads

All chat routes are in `packages/server/src/http/routes/member/chats.ts`. There is no read for one chat; the app loads every chat to find one. There is no read for the unread total; the app sums `unread` over every chat (`hlms-community/src/server/data.ts`). `ChatListItem` carries `participantIds` only (`packages/server/src/http/schemas/chats.ts:18-27`), so the app reads the whole directory for names and avatars.

## 3. Design

### 3.1 How a message travels

```
James ── POST /chats/cht_1/messages ──▶ instance B
         ChatService.send: save message + outbox.append(message.sent) ── commit

relay (whichever instance claims the row, say B)
  EventBus ─▶ automations.handle                      (as today)
           └▶ ChatLiveForwarder ─▶ PubSub.publish('discussion.chats', { message.sent, cht_1, msg_9 })

PubSub delivers to every instance
  instance A: ChatHub — Sarah has a stream in cht_1 → read msg_9 once → push message.created
  instance B: ChatHub — James's second tab is in cht_1 → read msg_9 once → push message.created
```

The write path does not change. Live delivery is one more consumer of the events chat writes already commit.

### 3.2 The `PubSub` port

In `packages/core/src/shared/ports.ts`:

```ts
/** Messages published on any instance, delivered to every subscriber on every
 *  instance. Best effort: a subscriber can miss messages while its instance is
 *  disconnected, and `onReset` fires after every reconnect. No ordering is
 *  promised across publishers. */
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

| Implementation | Package | Use |
|---|---|---|
| `InMemoryPubSub` | `@headless-lms/adapter-defaults/pubsub` | one process: development, tests, a single instance. The fallback when none is injected. |
| `PostgresPubSub` | `@headless-lms/adapter-pubsub-postgres` (new, `adapters/pubsub-postgres`) | more than one instance on Postgres |

The container takes it as `adapters.pubsub`, like `workflows` and `pushSender` (`container.ts:135-142`):

```ts
import { PostgresPubSub } from '@headless-lms/adapter-pubsub-postgres';

const container = await createContainer(config, {
  adapters: {
    pubsub: new PostgresPubSub({ connectionString: config.pubsubDatabaseUrl }),
  },
});
```

### 3.3 `@headless-lms/adapter-pubsub-postgres`

A new package in `adapters/pubsub-postgres`, depending on `@headless-lms/core` and `pg` (the version `adapters/db` uses). It reads no environment itself.

- **Listening.** `start()` opens one dedicated `pg.Client`, outside any pool, and runs `LISTEN hlms_pubsub`. Every channel shares that one Postgres channel; a notification carries `{ c: channel, … }` and the adapter dispatches by `c` to that channel's handlers.
- **Publishing.** `publish` runs `SELECT pg_notify('hlms_pubsub', $1)` on the adapter's own small `pg.Pool` (2 connections). Postgres delivers a notification once the notifying transaction commits; here each publish is its own statement.
- **Large messages.** A notification payload must stay under 8,000 bytes. A message whose JSON exceeds 7,900 bytes is split into numbered chunks `{ c, id, i, n, part }` sent with `pg_notify` in one transaction. Postgres delivers a transaction's notifications together and in the order they were sent, so the listener reassembles by `id` and dispatches once all `n` parts arrived. Partial messages are dropped on reconnect.
- **Reconnect.** When the listening connection errors or ends, the adapter reconnects with exponential backoff and jitter (1 s up to 30 s), runs `LISTEN` again and calls every subscriber's `onReset`.
- **Shutdown.** `stop()` runs `UNLISTEN *` and closes the listening connection and the pool. It is a no-op when the adapter was never started, as when `gen:openapi` boots the app with `ready()` and `close()` only.
- **Poolers.** `LISTEN` needs a session connection. Behind a transaction-mode pooler the connection string points at Postgres directly; `apps/api` reads it from `PUBSUB_DATABASE_URL`, defaulting to `DATABASE_URL`.

### 3.4 Chat events

The writes that emit nothing today get domain events, appended inside their unit of work like every other chat write:

| Event | Data | Emitted by |
|---|---|---|
| `discussion.chat.read` | `chatId`, `communityId`, `orgUserId`, `lastReadMessageId` | `markRead`, which moves into the unit of work |
| `discussion.message.reactions.changed` | `messageId`, `chatId`, `communityId`, `orgUserId`, `reaction` (null when cleared) | every `setReaction` that changes the member's reaction; `discussion.message.reaction.added` stays as it is |
| `discussion.subscription.changed` | `itemType`, `itemId`, `orgUserId` | `SubscriptionService.write`, which gains a unit of work with the outbox |

They are defined in `packages/core/src/discussion/events.ts` without a public form, so they are not automation triggers or webhook events: the trigger catalog lists every event that has one (`packages/core/src/automations/catalog.test.ts:114`), and a member's read marks and mutes are theirs alone.

Typing is not stored and is not a domain event: `ChatService.typing` publishes straight to `PubSub`.

### 3.5 The forwarder

`ChatLiveForwarder` (`packages/core/src/discussion/live.ts`) subscribes on the `EventBus` to the chat events: `chat.created`, `chat.updated`, `chat.participant.added`, `message.sent`, `message.updated`, `message.deleted`, `message.reactions.changed`, `chat.read` and `subscription.changed` for chats. For each it publishes a `ChatChange` to the channel `discussion.chats`:

```ts
type ChatChange = {
  event: string;        // the domain event's type, or 'typing'
  orgId: string;
  chatId: string;
  messageId?: string;
  orgUserId?: string;   // the reader, the muting member, the typist
  until?: string;       // typing only
};
```

A change names what changed and never carries a body; each instance reads current state itself (3.6). A failed publish throws, the relay retries the event, and a duplicate change is harmless.

### 3.6 The hub

`ChatHub` (`packages/core/src/discussion/live.ts`), one per instance, subscribes to `discussion.chats` when the container starts it. It holds this instance's open streams:

- `byChat`: chat id → streams whose member is an active participant;
- `byMember`: org user id → streams.

It handles changes one chat at a time, and reads current state when it handles a change, so the last push for a message is its latest state whatever order changes arrived in.

| Change | Action |
|---|---|
| any, no local stream in the chat or for the member | ignore |
| `message.sent` | read the message once (`messageViews`); push `message.created` |
| `message.updated` | read it once; push `message.updated` |
| `message.deleted` | push `message.deleted` |
| `message.reactions.changed` | read the message's reaction counts once; push `message.reactions` |
| `chat.created`, `chat.updated`, `chat.participant.added` | read the chat and its active participants once; push `chat.updated` to streams already in it, `chat.added` to new participants' streams (each with that member's `ChatListItem`), `chat.removed` to those who left; update `byChat` |
| `chat.read` | for that member's streams only: push `chat.read` |
| `subscription.changed` | for that member's streams only: push `chat.subscription` |
| `typing` | push `typing` to the other participants' streams |
| `onReset` from `PubSub` | push `resync` to every stream |

After any change that can move a member's unread total or pending requests (a message sent or deleted, a chat started, accepted or left, a read mark, a mute), each affected local member's total is pushed as `unread`, at most once a second per member and computed for all of them in one read.

`ChatService.watch(orgId, actor, communityId, session)` opens one stream and returns an `AsyncIterable<ChatLiveEvent>`:

1. `requireSettings` and `requireActor` (entitlements), as every chat read does.
2. Load the member's active chat ids in the community, register with the hub, then yield `ready` and the current `unread`.
3. Every 30 s: `isCommunityMember` and `session.current()`. On failure yield `closed` with `access` or `session` and end.
4. A queue of at most 256 events. On overflow drop it and yield `resync`.

`session.current()` is supplied by the HTTP layer and verifies the request's cookie with the session cookie cache bypassed, so a sign-out or a password reset ends the stream at the next check. `SessionVerifier.verify` (`packages/core/src/types/identity.ts:33-34`) gains an option for that.

### 3.7 Endpoints

| Route | operationId | Call | Response |
|---|---|---|---|
| `GET /api/member/communities/:communityId/chats/events` | `streamMemberChatEvents` | `chats.watch` | `200 text/event-stream`, items `ChatLiveEvent` |
| `GET /api/member/chats/:chatId` | `getMemberChat` | `chats.chat` | `ChatListItem` |
| `GET /api/member/communities/:communityId/chats/unread` | `getMemberChatUnread` | `chats.unreadSummary` | `{ unread, requests }` |
| `POST /api/member/chats/:chatId/typing` | `sendChatTyping` | `chats.typing` | `204` |

Each new read checks access as `chats.messages` does. Changes to existing contracts:

- `ChatListItem` gains `participants: { orgUserId, displayName, imageUrl }[]`, so the inbox and the chat header need no directory.
- `SendMessage` gains an optional `clientId` (UUID); `MessageView` returns it. A repeat send with the same `clientId` returns the stored message and appends no event; two concurrent sends with one `clientId` meet the unique index, and the loser returns the winner's message. Stored as `messages.client_id`, unique on `(org_id, chat_id, org_user_id, client_id)`.

### 3.8 The stream route in Fastify

The route is an ordinary `r.route` with `preHandler: app.requireOrgSession`, a Zod schema and one call. A shared helper, `packages/server/src/http/sse.ts`:

- calls `reply.hijack()` and writes the headers already set by the request hooks (CORS, `x-request-id`) plus `content-type: text/event-stream; charset=utf-8`, `cache-control: no-cache, no-transform` and `x-accel-buffering: no`;
- writes one frame per event, with `event:` set to the event's `type`;
- writes a `: ping` comment every 25 s;
- ends the response when the iterable ends, and ends the iterable when the client disconnects.

The `onClose` hook in `packages/server/src/http/server.ts` ends every open stream with `closed { reason: 'shutdown' }` and stops `PubSub`, beside the relay and the automation engine.

The schema declares the response as content:

```ts
response: {
  200: { content: { 'text/event-stream': { schema: ChatLiveEvent } } },
  ...refusals(403, 404),
}
```

`@fastify/swagger` emits the media type, and the SDK generator turns it into a stream method on the SSE client the SDK already ships (`packages/sdk/src/generated/core/serverSentEvents.gen.ts`).

```
event: ready
data: {"heartbeatMs":25000}

event: unread
data: {"unread":3,"requests":1}

event: message.created
data: {"chatId":"cht_1","message":{"id":"msg_9","clientId":"0f6c…","orgUserId":"orm_james",…}}

: ping
```

### 3.9 Event types

`ChatLiveEvent` is a union discriminated by `type`.

| Event | Data | Meaning |
|---|---|---|
| `ready` | `heartbeatMs` | the stream is registered; load state (3.10) |
| `message.created` | `chatId`, `message` | a message was sent |
| `message.updated` | `chatId`, `message` | a message was edited |
| `message.deleted` | `chatId`, `messageId`, `deletedAt` | a message was deleted |
| `message.reactions` | `chatId`, `messageId`, `reactions`, `orgUserId`, `reaction` | a member's reaction changed; `reactions` are the new counts, `reaction` is null when cleared |
| `chat.added` | `chat` (`ChatListItem`) | the member is now in this chat |
| `chat.updated` | `chatId`, `chat` (`Chat`), `participants` | the chat's state or participants changed |
| `chat.removed` | `chatId` | the member is no longer in this chat |
| `chat.read` | `chatId`, `lastReadMessageId`, `unread` | the member marked the chat read, on any device |
| `chat.subscription` | `chatId`, `subscription` | the member's mute on the chat changed |
| `unread` | `unread`, `requests` | the member's unread total and pending requests |
| `typing` | `chatId`, `orgUserId`, `until` | a participant is typing until `until` |
| `resync` | — | events may have been missed; load state (3.10) |
| `closed` | `reason`: `access`, `session`, `shutdown` | the stream ended; on `shutdown`, reconnect |

Every event but `chat.added`, `chat.read`, `chat.subscription` and `unread` is the same for every recipient: no `viewerReaction`, no per-member fields on the chat, and no body for a deleted message. The four member events carry that member's own state.

### 3.10 The client loads state on every connect

1. Open the stream.
2. On `ready`, fetch the unread total (`getMemberChatUnread`), inbox page 1 (`listMemberChats`) and the latest page of the open chat (`listChatMessages`). The inbox rows are replaced by page 1, and every thread but the open one is dropped from the store, to load again when opened. Anything sent while these run also arrives on the stream; messages merge by id.
3. While connected, apply events.
4. On `resync`, or after the connection drops and reconnects, repeat step 2.

Sarah closes her laptop. James sends two messages in `cht_1` and edits one; Emma deletes hers in `cht_2`. Sarah's tab reconnects to instance B, gets `ready`, and loads: the badge, the inbox with both chats moved up, and the latest page of `cht_1` with James's edit. Nothing depends on what the stream carried while she was away.

### 3.11 Auth

- The stream request passes `requireOrgSession` (Better Auth session from the cookie, active organization required) and `requireActor` (entitlements), as every chat read does.
- A stream receives a chat's events only while its member is an active participant; the hub re-reads participants on every `chat` change.
- Every 30 s the stream re-checks community access through entitlements and the session through Better Auth. A revoked or expired grant, a removed bundle item, a removed org user or a signed-out session ends it with `closed`.
- The browser connects with credentials from an allowed origin (`packages/server/src/http/plugins/cors.ts`); the cookie is `SameSite=Lax`, so other sites cannot open a stream with it.

### 3.12 Operations

- The heartbeat (25 s) stays under the common 60 s proxy idle timeout; proxies must not buffer the route.
- One stream per tab. Over HTTP/2 the browser multiplexes them; over HTTP/1.1 a browser allows six connections per origin across tabs, and the client falls back to polling (3.13).
- A single instance needs no adapter; `InMemoryPubSub` delivers within the process.

### 3.13 The community app

**Store.** `src/lib/live/chat-store.ts` holds, per tab: inbox rows by chat id, threads by chat id (messages by id, display order, `more`), the unread total, typing marks and the connection state. Components read it with `useSyncExternalStore`. A pure reducer applies events and merges by message id:

- `message.created` inserts the message (or replaces it, by id or by `clientId`), moves the inbox row up, and adds one to the row's unread count when the sender is someone else and the chat is not open in a visible tab;
- `message.updated` and `message.reactions` replace by id; `message.reactions` also sets the viewer's own reaction when `orgUserId` is the viewer;
- `message.deleted` marks the message deleted and drops its body and images;
- `chat.added`, `chat.updated` and `chat.removed` insert, patch and drop inbox rows; `chat.removed` leaves the thread if it is open;
- `chat.read` and `chat.subscription` set the row's read state and mute;
- `unread` sets the badge; `typing` shows a mark until `until`.

When a mute on a loaded row lapses, the client fetches the unread total at `mutedUntil`.

**Connection.** `src/lib/live/connection.ts` opens `Chats.streamMemberChatEvents` from a browser SDK client (`baseUrl` = `NEXT_PUBLIC_API_URL`, `credentials: 'include'`) and loads state on `ready` and `resync` (3.10). It closes the stream after the tab has been hidden for 60 s and reopens it when the tab is visible again. If no `ready` arrives within 10 s, or three connects fail within a minute, it polls `getMemberChatUnread` and the open chat's latest page every 15 s while visible, one request at a time, and retries the stream with backoff up to 60 s.

**Writes.** Chat actions stay Server Actions, return the API's result and no longer call `refresh()`.

**Optimistic send.** The composer adds a pending message with a new `clientId`, sends, and replaces it with the returned `MessageView`. If `message.created` with the same `clientId` lands first, it replaces the pending one. A failed send keeps the pending message with a retry that reuses the `clientId`.

**Read marks.** When a message from someone else arrives in the open chat while the tab is visible and the view is at the bottom, the client calls `markChatRead` after 1 s of quiet.

## 4. Files

### 4.1 headless-lms

| File | Change |
|---|---|
| `packages/core/src/shared/ports.ts` | `PubSub` |
| `packages/core/src/discussion/events.ts` | `chat.read`, `message.reactions.changed`, `subscription.changed` |
| `packages/core/src/discussion/chats.ts` | `markRead` in the unit of work with its event; `setReaction` event; `clientId` on send; `watch`, `chat`, `unreadSummary`, `typing` |
| `packages/core/src/discussion/subscriptions.ts` | unit of work and `subscription.changed` |
| `packages/core/src/discussion/live.ts` | new: `ChatLiveForwarder`, `ChatHub` |
| `packages/core/src/discussion/ports.ts` | `ChatService` additions; repository `findByClientId`, `unreadSummary`, `activeChatIds`, `participantsOf`; `messageViews`, a viewer-neutral read of messages for the hub |
| `packages/core/src/discussion/index.ts` | export the hub, the forwarder and the new types |
| `packages/core/src/types/schemas/discussion.ts` | `clientId` on message, `ChatLiveEvent`, `ChatUnreadSummary` |
| `adapters/db/src/schema/discussion.ts` + a generated migration | `messages.client_id` and its unique index |
| `adapters/db/src/repositories/chats.ts` | the new repository reads; `client_id` on insert |
| `adapters/defaults/src/pubsub/index.ts`, `adapters/defaults/package.json` | new: `InMemoryPubSub`, exported as `./pubsub` |
| `adapters/pubsub-postgres/` | new package: `PostgresPubSub`, tests, `README.md` |
| `packages/server/src/app/container.ts` | `adapters.pubsub` with the in-memory fallback; forwarder on the bus; hub |
| `packages/server/src/http/sse.ts` | new: frame writer and heartbeat |
| `packages/server/src/http/routes/member/chats.ts`, `packages/server/src/http/schemas/chats.ts` | the four routes; `participants` on `ChatListItem`; `clientId` on send |
| `packages/server/src/http/server.ts` | close streams and stop `PubSub` in `onClose` |
| `apps/api/src/main.ts`, `apps/api/src/config.ts` | inject `PostgresPubSub`; `PUBSUB_DATABASE_URL`; start it before `listen` |
| `packages/sdk` | regenerate (`pnpm gen:sdk`) |

### 4.2 hlms-community

| File | Change |
|---|---|
| `src/components/chats/auto-refresh.tsx` | delete |
| `src/app/(community)/chats/layout.tsx` | remove `<AutoRefresh />` |
| `src/app/(community)/layout.tsx` | mount `<ChatLive>` once for the community |
| `src/lib/live/chat-store.ts`, `connection.ts`, `api.ts` | new: store and reducer; stream, load and fallback; browser SDK client |
| `src/components/chats/chat-live.tsx` | new: provider and connection lifecycle |
| `src/components/chats/inbox.tsx` | page 1 on the server, rows from the store, names from `participants` |
| `src/app/(community)/chats/[chatId]/page.tsx` | `getMemberChat` and the latest page only; no `getChats()`, `getPeople()` or page loop |
| `src/components/chats/thread.tsx` | render from the store; read marks |
| `src/components/chats/composer.tsx` | optimistic send with `clientId`; typing at most every 3 s |
| `src/components/chats/chat-chrome.tsx` | addable people searched on open, not passed as a prop |
| `src/components/shell/frame.tsx` | chat badges from the store |
| `src/server/actions/chats.ts`, `src/server/actions/shared.ts` | return results; no `refresh()`; `clientId` on send |
| `src/server/data.ts` | `getChat`, `getChatUnread`; the inbox reads page 1 only |
| `README.md` | replace the 5-second refresh line |

## 5. Documentation

| Where | What |
|---|---|
| `adapters/pubsub-postgres/README.md` | what it implements; constructor options; wiring into `createContainer`; the dedicated listening connection and poolers; large messages; reconnect and `onReset`; when a single instance needs no adapter |
| `apps/website/content/docs/adapters/pubsub/postgres.mdx`, `meta.json`; `adapters/meta.json`; `adapters/index.mdx` | the public page for the adapter, in the same form as the Hatchet page; the port listed with the other adapter slots |
| `apps/website/content/docs/self-hosting.mdx` | running more than one API instance needs a `PubSub` adapter; `PUBSUB_DATABASE_URL`; proxy buffering and idle timeouts for the stream route |
| `apps/website/content/docs/building-a-frontend.mdx` | live chat: open the stream, load state on `ready` and `resync`, apply events, send with `clientId`, fall back to polling |
| `apps/website/content/docs/architecture.mdx`, `docs/architecture.md` | the `PubSub` port beside the outbox and the bus |
| `apps/website/content/docs/api/chats/` | the new operations, generated from `openapi.json` (`pnpm --filter website gen:api-docs`) |
| `docs/domain/discussion.md` | live chat updates as a discussion capability; the new events |

## 6. Test plan

**PubSub contract** (one suite run against `InMemoryPubSub` and `PostgresPubSub`).

- A message published on one instance reaches every subscriber of the channel on every instance, and no subscriber of another channel.
- An unsubscribed handler receives nothing.
- A 50 KB message arrives whole and once.

**`PostgresPubSub`** (real Postgres).

- `pg_terminate_backend` on the listening connection: the adapter reconnects, `onReset` fires, and later messages arrive.
- `stop()` closes both connections.

**Hub and forwarder** (`packages/core/src/discussion/live.test.ts`, in-memory adapters).

- A message in `cht_1` reaches Sarah's and James's streams and not Emma's.
- Emma leaves `cht_2`: she gets `chat.removed`, then nothing more from it. James adds her back: she gets `chat.added` and later messages.
- A message edited twice in quick succession: the last push carries the second edit.
- `onReset` sends `resync` to every stream; a full queue yields `resync`.
- No pushed event carries `viewerReaction` or a deleted message's body.
- A repeat send with the same `clientId` returns the first message and appends no event.
- `markRead`, a cleared reaction and a chat mute each emit their event and reach only the right streams.
- James starts a request to Sarah: her stream gets `chat.added` and an `unread` with `requests` up by one; she accepts and it drops.
- `chat.updated` carries no member's read state or mute; `chat.added` carries the receiving member's own.

**Two instances** (server integration: two containers and two Fastify instances on one Postgres with `PostgresPubSub`).

- Sarah's stream on A; James sends through B: Sarah receives `message.created` with the body James sent. James's second tab on B receives it too.
- An edit, a delete and a reaction through A reach both.
- Abort Sarah's stream, send two messages and an edit through B, reconnect her to B: after `ready`, the loads in 3.10 return the two messages and the edit.

**Access.**

- No cookie: 401. A member of another community: 403.
- Revoke Sarah's grant, let it expire through the expiry job, or remove the community from her bundle: within 30 s her stream yields `closed { reason: 'access' }`; a new connect returns 403.
- Sign Sarah out on another device: her stream yields `closed { reason: 'session' }`; a new connect returns 401.

**Contract and operations.**

- `openapi.json` declares `text/event-stream` for `streamMemberChatEvents`; the regenerated SDK exposes it as a stream method.
- Through nginx with default buffering, events arrive as written and heartbeats keep a 5-minute idle stream open.
- `app.close()` with open streams completes, and each client receives `closed { reason: 'shutdown' }`.
- Repeat the LOAD-05 burst (`hlms-community/docs/qa/issues.md:357-378`) with streams open on both instances, and record the time from each send's commit to its `message.created` on the other instance.

**Community app.**

- Reducer: merge by id, optimistic replacement by `clientId` whether the response or the event lands first.
- Two browsers, Sarah and James: James's message appears for Sarah without a reload, and the network panel shows no RSC requests while the chat is idle.
- Repeat the UI-24 measurement (`hlms-community/docs/qa/issues.md:563-570`): an idle open chat transfers only heartbeats.
- Hide the tab for 60 s: the stream closes; show it: it reconnects and loads state.
- Block the stream route at the proxy: the app polls within 10 s and returns to the stream when unblocked.
