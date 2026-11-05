# Realtime chat: design

Nov 4, 2026 · @Meiring

This document replaces the community app's chat auto-refresh with live delivery from the API. It covers the API stream in `headless-lms` and the client changes in `hlms-community`. It adds no bounded context and no data migration.

**Example data.** The org Spanish in 90 Days, its community Spring cohort (`cmy_1`). Sarah and James have a direct chat; Sarah, James and Emma have a group chat. The API runs as two instances, A and B, behind one load balancer.

Paths without a prefix are in `headless-lms`; paths starting `hlms-community/` are in the community app.

## 1. The problem

`hlms-community/src/app/(community)/chats/layout.tsx:10` mounts `<AutoRefresh />`. It calls `router.refresh()` every 5,000 ms while the tab is visible, whether or not the previous refresh finished (`hlms-community/src/components/chats/auto-refresh.tsx:6-19`). `router.refresh()` re-runs every Server Component of the current route, parent layouts included (`hlms-community/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md:46`).

Each refresh of `/chats/<id>` re-renders:

- `getHome()`, `getMe()`, `getPeople()` and `getChats()` (`hlms-community/src/app/(community)/chats/[chatId]/page.tsx:62`). `getPeople()` reads the whole member directory, 100 rows per call, until done (`hlms-community/src/server/data.ts:23-31`, `:55-67`). `getChats()` reads every chat the member is in the same way (`:76-79`).
- every loaded page of messages, re-fetched in full (`[chatId]/page.tsx:40-48`);
- the inbox, which runs the same reads again (`hlms-community/src/components/chats/inbox.tsx:19`);
- the shell's chat badges, which call `getInbox()` (`hlms-community/src/components/shell/frame.tsx:153-156`, `:175-178`);
- an "addable" list of every member not in the chat, serialized into the header even for a direct chat (`[chatId]/page.tsx:163-165`).

Every chat mutation also calls `refresh()` (`hlms-community/src/server/actions/shared.ts:17-21`), so a send re-renders the same tree once more.

Measured cost (QA log, `hlms-community/docs/qa/issues.md`):

| Measure | Value | Source |
|---|---|---|
| API calls per open tab per refresh | about 9–10 (4 directory pages at 321 members, 2 chat-list pages for a member with 167 chats) | `issues.md:366` |
| Transfer per refresh, one open chat | about 136 KB compressed, 549 KB decoded RSC | `issues.md:569` |
| Per minute, one open chat | about 1.6 MB | `issues.md:569` |
| During an API stall | overlapping renders of the same chat at 94–111 s each; 90 `fetch failed` errors from `allPages` | `issues.md:367` |
| Growth | linear in member and chat count; a community of a few thousand serves a `/members` page over 10 MB | `issues.md:377` |

The QA expectation is that a chat fetches only what changed (`issues.md:364`, `:568`).

## 2. How it's usually done

### 2.1 Transport

- **SSE.** `text/event-stream` over a plain GET. `event:` sets the type, `data:` the payload, `id:` the last event id, `retry:` the reconnect delay; lines starting `:` are comments. On a network error the browser reconnects and sends `Last-Event-ID`; a non-200 response or a wrong content type stops it, and 204 tells it not to reconnect. `EventSource` takes no custom headers, so auth is a cookie (`withCredentials: true` cross-origin). The spec advises a comment line about every 15 s for proxies that drop idle connections. https://html.spec.whatwg.org/multipage/server-sent-events.html
- **Connection limits.** Without HTTP/2, SSE is limited to 6 connections per browser and domain across all tabs, marked "Won't fix" in Chrome and Firefox; HTTP/2 negotiates concurrent streams, typically 100. https://developer.mozilla.org/en-US/docs/Web/API/EventSource, https://www.rfc-editor.org/rfc/rfc9113.txt
- **Proxies.** nginx buffers proxied responses by default; a response header `X-Accel-Buffering: no` turns it off per response. `proxy_read_timeout` is 60 s between reads. https://nginx.org/en/docs/http/ngx_http_proxy_module.html. AWS ALB's idle timeout defaults to 60 s; HTTP/2 PING frames do not reset it, data bytes do; long connections are recycled after the client keepalive (default 3,600 s). https://docs.aws.amazon.com/elasticloadbalancing/latest/application/edit-load-balancer-attributes.html
- **WebSocket.** Two-way, needs `Upgrade` handling in every proxy, closes after 60 s idle on nginx without pings, and has no built-in resume. https://nginx.org/en/docs/http/websocket.html. Browsers send cookies on the handshake, so servers must check `Origin` against an allowlist to stop cross-site WebSocket hijacking. https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html, https://www.rfc-editor.org/rfc/rfc6455
- **Long-polling.** Works through anything. Matrix `/sync`, Zulip's `/events` and Discourse MessageBus use it; Discourse streams chunked long-polls because chunked encoding "provides all the benefits of EventSource". https://github.com/discourse/message_bus
- **Fastify.** `reply.hijack()` hands the raw response to the handler; headers set through the reply API are not written for it. https://fastify.dev/docs/latest/Reference/Reply/. `@fastify/sse` (0.x) adds `reply.sse.send`, heartbeats and a `Last-Event-ID` replay hook. https://github.com/fastify/sse. `@fastify/websocket` runs `preHandler` before the upgrade, so auth can refuse with 401. https://github.com/fastify/fastify-websocket
- **OpenAPI.** 3.2 adds `itemSchema` for sequential media types including `text/event-stream`, applied to each event. 3.0 and 3.1 can declare the media type but not a per-event schema. https://spec.openapis.org/oas/v3.2.0.html. WebSocket APIs are described with AsyncAPI instead. https://www.asyncapi.com/blog/release-notes-3.0.0

### 2.2 Fan-out across instances

- **NOTIFY.** The payload must be shorter than 8,000 bytes by default. The queue is 8 GB; when full, notifying transactions fail at commit. A notification is delivered only if the transaction commits, in commit order across transactions; identical payloads on one channel in one transaction collapse into one. It is not durable: only sessions that have run `LISTEN` receive it. https://www.postgresql.org/docs/current/sql-notify.html
- **LISTEN.** Takes effect at commit and ends with the session. The documented race-free order is: commit the `LISTEN`, then read state, then apply notifications, accepting that early ones may repeat what was read. https://www.postgresql.org/docs/current/sql-listen.html. PgBouncer's transaction pooling does not support `LISTEN`; `NOTIFY` works. https://www.pgbouncer.org/features.html
- **Commit lock.** Commits of transactions that ran `NOTIFY` take a cluster-wide lock in `PreCommit_Notify` and serialize; Recall.ai hit this with hundreds of waiting backends and moved notification out of Postgres. https://www.recall.ai/blog/postgres-listen-notify-does-not-scale. PostgreSQL 19 wakes only backends listening on the channel (commit 282b1cd); the commit lock remains. https://github.com/postgres/postgres/commit/282b1cd, https://www.postgresql.org/docs/19/release-19.html
- **Log table plus NOTIFY.** Discourse MessageBus's Postgres backend writes each message to a `message_bus` table and calls `pg_notify` as a hint; clients catch up from the table. https://github.com/discourse/message_bus/blob/main/lib/message_bus/backends/postgres.rb. Rails Action Cable's Postgres adapter uses `LISTEN/NOTIFY` and documents the 8,000-byte limit; Solid Cable polls a table every 0.1 s instead. https://github.com/rails/rails/blob/main/guides/source/action_cable_overview.md, https://github.com/rails/solid_cable
- **Brokers.** Redis pub/sub is at-most-once: a disconnected subscriber loses messages for good. https://redis.io/docs/latest/develop/pubsub/. Synapse workers replicate over Redis pub/sub. https://element-hq.github.io/synapse/latest/workers.html. Rocket.Chat 7.7 disabled database change streams by default and moved all events to its transport, with NATS recommended. https://forums.rocket.chat/t/troubleshooting-event-propagation-reactivity-issues-in-rocket-chat-7-7-0/22524
- **Logical replication.** Supabase Realtime's Postgres Changes reads the WAL and "authorizes every event against each subscriber", on a single thread to keep order; above about 3,000 subscribers to the same changes it recommends Broadcast. https://supabase.com/docs/guides/realtime/postgres-changes, https://github.com/supabase/walrus. "Broadcast from Database" writes to a `realtime.messages` table from triggers and reads it by replication. https://supabase.com/docs/guides/realtime/broadcast

### 2.3 Auth on the stream

- Authorize each event, not only the connection; re-validate the session periodically and close a user's connections on logout. https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html
- Mattermost checks every event per connection against the session and a cached channel membership, with a 5 s auth check interval. https://github.com/mattermost/mattermost/blob/master/server/channels/app/platform/web_conn.go
- Campfire authenticates by cookie, re-checks the session every minute and closes with `unauthorized`; revoking a membership disconnects so subscriptions re-authorize. https://github.com/basecamp/once-campfire/blob/main/app/channels/application_cable/connection.rb
- Better Auth: with the cookie cache on, a revoked session stays valid on other devices until the cache expires; `getSession` with `disableCookieCache: true` reads the database. https://www.better-auth.com/docs/concepts/session-management
- Tokens in query strings leak into access logs. https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html

### 2.4 Delivery and resume

- **Idempotent send and echo.** Matrix sends carry a client transaction id and the echo returns it to the sender. https://spec.matrix.org/latest/client-server-api/. Zulip sends `local_id` and gets it back in the message event. https://zulip.com/api/send-message. Campfire reconciles pending messages by `client_message_id`. https://github.com/basecamp/once-campfire/blob/main/app/javascript/controllers/messages_controller.js
- **Cursors.** Matrix `since`/`next_batch`, with `limited` and `prev_batch` for backfill; Zulip `last_event_id`; Discord `seq` with RESUME; Mattermost `sequence_number`; Discourse a last id per channel. On a gap they cannot repair, all of them refetch state: Zulip `BAD_EVENT_QUEUE_ID`, Matrix `M_UNKNOWN_POS`, Mattermost a new `connection_id`. https://zulip.com/api/get-events, https://docs.discord.com/developers/events/gateway, https://github.com/matrix-org/matrix-spec-proposals/blob/main/proposals/4186-simplified-sliding-sync.md
- **Replay buffers.** Mattermost keeps the last 128 sent events per connection and replays from a sequence number, fetching the buffer from another cluster node when needed; otherwise the client resyncs over REST. https://github.com/mattermost/mattermost/blob/master/server/channels/app/platform/web_hub.go
- **Subscribe, then snapshot.** Zulip registers the queue, fetches initial state, then applies events queued since. https://zulip.readthedocs.io/en/latest/subsystems/events-system.html
- **Thin or fat events.** A thin event carries ids and the client fetches; a fat one carries the state. https://martinfowler.com/articles/201701-event-driven.html. Replicache's "poke" carries no data and only tells the client to pull. https://doc.replicache.dev/byob/poke

### 2.5 What goes over the wire

- Mattermost: `posted`, `post_edited`, `post_deleted`, `typing`, `channel_viewed`, `status_change`, `hello`; typing and reactions go only to users who have the channel open. https://docs.mattermost.com/api/reference/mattermost-api
- Matrix: messages in the timeline; typing and receipts as ephemeral events; per-room unread counts in `/sync`. https://spec.matrix.org/latest/client-server-api/
- Zulip typing is stateless on the server; receivers expire the indicator so a dropped connection never shows someone typing forever. https://zulip.com/api/set-typing-status
- Slack does not persist typing indicators. https://slack.engineering/real-time-messaging/
- Campfire sends unread state per member on its own channel. https://github.com/basecamp/once-campfire/tree/main/app/channels
- Supabase Presence is for slow-changing state; rapid updates flood the channel. https://supabase.com/docs/guides/realtime/presence

### 2.6 Client patterns

- `router.refresh()` re-renders the route on the server and merges the payload; it is a whole-route round trip per update. https://nextjs.org/docs/app/api-reference/functions/use-router
- `useSyncExternalStore` reads an external store; `getSnapshot` must return a cached value, and `getServerSnapshot` must match the first client render. https://react.dev/reference/react/useSyncExternalStore
- Background tabs throttle timers but not open network connections. https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API. Discourse MessageBus slows to one poll a minute in a background tab. https://github.com/discourse/message_bus
- Retries use capped exponential backoff with jitter. https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/. Mattermost's client adds up to 2 s of random jitter, reconnects on the `online` event, and reconnects on a sequence mismatch. https://github.com/mattermost/mattermost/blob/master/webapp/platform/client/src/websocket.ts
- Fallback: Discourse MessageBus runs chunked long-poll, long-poll or polling, in that order.

### 2.7 Summary of practice

Production systems push over one long-lived connection per client (WebSocket for Slack, Discord, Mattermost and Rocket.Chat; long-poll or chunked HTTP for Matrix, Zulip and Discourse). They fan out across servers through a broker or Postgres, treat the live channel as at-least-once, dedupe by id, give the client a cursor, and resync from a durable store when the cursor cannot be served. Typing is ephemeral and expires on the receiver. Sends are idempotent through a client-generated id.

## 3. What we have

### 3.1 Chat model

| Fact | Where |
|---|---|
| `chats`: `id`, `communityId`, `kind` (`direct \| group`), `status` (`pending \| open \| closed`), `createdBy`, `lockedAt`, `lockedBy`, `updatedAt` | `packages/core/src/types/schemas/discussion.ts:312` |
| `chat_users`: `joinedAt`, `leftAt`, `lastReadMessageId`; a participant is active while `leftAt` is null | `discussion.ts:328-336` |
| `messages`: `id`, `chatId`, `orgUserId`, `body`, `replyToId`, `editedAt`, `deletedAt`, `createdAt`, `updatedAt`. Primary key `(org_id, id)`; index `(org_id, chat_id, created_at)` | `discussion.ts:343`; `adapters/db/src/schema/discussion.ts:439-479` |
| `MessageView` adds `sender`, `attachments`, `reactions`, `viewerReaction`, `mentions`. `viewerReaction` is per viewer | `discussion.ts:363` |
| A message id is a KSUID generated in the service; `createdAt` is the app server's clock at send | `packages/core/src/discussion/chats.ts:1078-1098`; `packages/core/src/shared/id.ts:1-10` |
| KSUIDs sort by second, then randomly within a second | `shared/id.ts:6-7` |
| Group size is a community setting, 3–100, default 8 | `packages/core/src/types/schemas/content.ts:322`, `:488-492` |

### 3.2 Routes and pagination

All chat routes are in `packages/server/src/http/routes/member/chats.ts`, guarded by `requireOrgSession` and resolved to the org user by `actorOf` (`routes/member/actor.ts:4-10`).

| Route | Service call | Paging |
|---|---|---|
| `GET /api/member/communities/:communityId/chats` (`:36-54`) | `chats.listChats` | `page`/`pageSize` (max 100) offset paging (`http/schemas/shared.ts:64-69`); ordered by `chats.updated_at desc` (`adapters/db/src/repositories/chats.ts:256-258`) |
| `GET /api/member/chats/:chatId/messages` (`:152-169`) | `chats.messages` | offset paging, newest first, `created_at desc, id desc` (`repositories/chats.ts:453-471`) |
| `POST /api/member/chats/:chatId/messages` (`:172-191`) | `chats.send` | — |
| `PATCH`/`DELETE /api/member/messages/:messageId` (`:193-229`) | `editMessage`, `deleteMessage` | — |
| `PUT`/`DELETE /api/member/messages/:messageId/reaction` (`:232-268`) | `setReaction` | — |
| `POST /api/member/chats/:chatId/read` (`:312-327`) | `markRead` | — |
| `POST /api/member/chats/:chatId/acceptance` (`:134-150`) | `accept` | — |

There is no single-chat read; the app loads every chat to find one (`[chatId]/page.tsx:62-63`). There is no cursor or "changed since" read. Offset pages shift while new messages arrive; the app dedupes by id after re-reading every page (`[chatId]/page.tsx:45-46`).

### 3.3 Unread counts and read marks

- `markRead` stores `lastReadMessageId` on the reader's `chat_users` row (`chats.ts:482-492`, `repositories/chats.ts:351-367`). It sets the value unconditionally and emits no event.
- The inbox's per-chat `unread` counts others' undeleted messages with `created_at` after the read message's (`repositories/chats.ts:205-221`). `unreadFor` does the same for one chat (`:369-403`).
- The app's badge total sums `unread` over unmuted chats plus pending requests to the member, which needs every chat (`hlms-community/src/server/data.ts:87-98`).

### 3.4 Events on chat writes

Each write appends events to the outbox in the same transaction as the write (`packages/core/src/shared/ports.ts:75-87`).

| Write | Events | Where |
|---|---|---|
| send | `discussion.message.sent`; also `discussion.chat.updated` when a reply opens a request | `chats.ts:343-370` |
| edit | `discussion.message.updated` | `chats.ts:372-410` |
| delete | `discussion.message.deleted` | `chats.ts:412-447` |
| first reaction of a kind | `discussion.message.reaction.added`; removal and change are not evented | `chats.ts:449-480` |
| accept a request | `discussion.chat.updated` (status `open`) | `chats.ts:319-341` |
| leave, lock, unlock | `discussion.chat.updated` with the active `participantIds` | `chats.ts:299-317`, `:776-817`, `:1107-1129` |
| add participant | `discussion.chat.participant.added` | `chats.ts:250-297` |
| mark read, block, unblock | none | `chats.ts:482-524` |

Event definitions: `packages/core/src/discussion/events.ts:196-243`. The public form of a message event omits the body (`events.ts:84`).

The repository bumps `chats.updated_at` on every message insert and update (`repositories/chats.ts:422`, `:440`, `:828-833`). That `UPDATE` holds the chat row lock until the transaction commits. Reactions do not touch the chat (`repositories/chats.ts:514-541`).

### 3.5 Outbox, relay and Hatchet

- The relay is a same-process poller started by each API process after `listen` (`apps/api/src/main.ts:28-34`). It polls every 1,000 ms, 100 rows a batch, 16 lanes (`packages/server/src/app/container.ts:193-198`), publishes each row to the in-process `InMemoryEventBus` and stamps it processed (`adapters/defaults/src/events/outbox-relay.ts:106-182`). Delivery is at-least-once (`outbox-relay.ts:6`).
- The only bus subscriber is `automations.handle` (`container.ts:726-734`), which runs matching automations and then the notification processor (`packages/core/src/automations/service.ts:257-278`).
- `fetchBatch` selects with `FOR UPDATE SKIP LOCKED` inside a transaction that commits as it returns, so the lock does not span the dispatch (`adapters/db/src/repositories/outbox.ts:47-72`). Two instances can dispatch the same row; handlers are idempotent on event id.
- A `message.sent` is not notified at once: the processor arms a per-recipient flush job 2 minutes later on the scheduler (`automations/notifications/processor.ts:150-152`, `automations/notifications/debounce.ts:12-40`). Hatchet runs it (`adapters/workflow-hatchet/src/index.ts:226-268`); the flush skips a member who has read the chat (`debounce.ts:65-68`). Web push is a delivery channel of that process (`adapters/push`).
- Under load the relay lags: an 18-second burst delayed notifications by a median 29 s and up to 54 s, because notification derivation runs per event (`hlms-community/docs/qa/issues.md:401-404`).
- The `OutboxRelay` port names LISTEN/NOTIFY as a future relay mechanism (`shared/ports.ts:111-113`).

### 3.6 Pub/sub, LISTEN/NOTIFY, SSE, WebSocket

None exist. No `pg_notify`, `LISTEN`, `text/event-stream`, WebSocket or broker client appears in `packages`, `adapters` or `apps/api`. The server depends on `fastify`, `@fastify/cors` and `@fastify/swagger` only (`packages/server/package.json:23-35`). The database adapter uses one `pg.Pool` (`adapters/db/src/client.ts:20`). The `EventBus` is in-process (`adapters/defaults/src/events/index.ts:1-6`).

### 3.7 Auth

- `requireOrgSession` calls `auth.verify(request.headers)`, which runs Better Auth's `getSession` on the cookie, and requires an active organization (`packages/server/src/http/plugins/auth.ts:60-81`; `adapters/auth/src/better-auth.ts:531-553`).
- Sessions use a signed cookie cache valid for 5 minutes; sign-out and expiry invalidate it (`better-auth.ts:149-158`). Password reset revokes sessions (`:190`).
- Cookies are `SameSite=Lax`, `HttpOnly`, shared across subdomains of one parent domain (`better-auth.ts:168-179`). CORS allows credentials for the configured client origins (`packages/server/src/http/plugins/cors.ts:7-15`).
- Community access: `requireActor` calls entitlements' `isCommunityMember` (`chats.ts:827-831`; `packages/core/src/entitlements/service.ts:159-162`). Chat reads also require an active participant (`chats.ts:983-997`).
- The community app signs in from the browser against the API (`hlms-community/src/lib/auth-client.ts:4`; `hlms-community/README.md:22`). Pages and actions forward the browser's cookie to the API from the Next server (`hlms-community/src/server/api.ts:57-59`). Production puts app and API under one parent domain with `AUTH_COOKIE_DOMAIN` (`README.md:56`), so the browser holds a cookie the API accepts.

### 3.8 API contract and SDK

- The spec is generated from the Zod route schemas by `@fastify/swagger` (`packages/server/src/http/plugins/openapi.ts:43-55`), as OpenAPI 3.0.3 (`packages/sdk/openapi.json:2`).
- The SDK is generated by `@hey-api/openapi-ts` 0.99 (`packages/sdk/openapi-ts.config.ts`). It treats an operation whose response media type is `text/event-stream` as a stream (`hasOperationSse` in the generator) and already ships an SSE client: fetch-based, sends `Last-Event-ID` on reconnect, honours `retry:`, backs off exponentially (`packages/sdk/src/generated/core/serverSentEvents.gen.ts:115`, `:174-178`, `:225-228`; `packages/sdk/src/generated/client/client.gen.ts:228-273`).

## 4. What we need

1. A stream from the API to a member's browser carrying the changes to the chats they are in, delivered within a second of commit, on any API instance.
2. Fan-out across instances that does not wait on the outbox relay or the notification process.
3. A per-chat change cursor that orders changes by commit, so a client can detect a gap exactly and fetch what it missed. `created_at` and message ids cannot do this (3.1).
4. Reads that return only what changed: one chat, the changes since a cursor, the unread total. Today only full lists exist (3.2).
5. Access on the stream decided by the same checks as the reads (entitlements for the community, participation for the chat), re-checked while the stream is open, and the stream closed when access ends.
6. Signals for state that emits no event today: read marks, reaction removal and change, mutes, typing.
7. A stream route described in the OpenAPI spec so the SDK generates it.
8. In the app: no `AutoRefresh`, no `refresh()` after chat actions, a client store merged from the stream, optimistic send, the directory read on demand instead of on every render, and a fallback when the stream cannot connect.

## 5. Approaches

Four decisions, each ranked by technical merit.

### 5.1 Transport

| Rank | Option | For | Against |
|---|---|---|---|
| 1 | **SSE** for server-to-client, existing REST for writes | Plain HTTP GET: the cookie, CORS and `requireOrgSession` work unchanged. Describable in OpenAPI as `text/event-stream`; the generated SDK already has a client with resume and backoff (3.8). Multiplexed over HTTP/2. Built-in `id`/`retry` and reconnect. | One direction only. Needs proxy buffering off and heartbeats. Six-connection limit per origin on HTTP/1.1. |
| 2 | WebSocket (`@fastify/websocket`) | Bidirectional: typing and read marks could go up the same socket. Binary frames. | Not describable in OpenAPI (AsyncAPI instead); the SDK does not generate it. A new dependency. Needs an Origin check against cross-site WebSocket hijacking and an upgrade-aware proxy. No built-in resume. Writes already have validated REST routes, so the upstream half adds a second write path. |
| 3 | Long-polling (`GET …/changes?since=&wait=`) | Pure JSON, schema-first, passes any proxy. Same cursor model. | A request, a session check and headers per batch. A second of extra latency per cycle under chatty load. Used by Zulip, Matrix and Discourse largely for proxy compatibility. Kept as the fallback. |
| 4 | Short delta polling every N seconds | Fixes the cost of today's refresh with one endpoint. | Latency up to N; constant load from idle tabs. |

Web push already exists for notifications. It wakes a closed app; it is not a channel for an open tab.

### 5.2 Fan-out across instances

| Rank | Option | For | Against |
|---|---|---|---|
| 1 | **`pg_notify` inside the write transaction; one `LISTEN` connection per instance** | Delivered only on commit and never on rollback, so a signal always describes committed state. No new dependency. Independent of the relay's poll and backlog. | 8,000-byte payload. Commits that notify serialize on a global lock. Not durable: lost while a listener is disconnected. `LISTEN` needs a session connection, not a transaction-pooled one. |
| 2 | Redis or NATS pub/sub, published after commit | Throughput past Postgres's commit lock. | A new self-hosted service to run. Publishing after commit is not atomic with the write, so a crash between them loses a signal (the cursor model covers it, as for 1). Not needed at the measured ceiling of about 250 requests per second (`hlms-community/docs/qa/issues.md:398`). |
| 3 | Logical replication of `messages` and `chats` (Supabase Realtime's Postgres Changes) | Commit-ordered and durable through a slot. | `wal_level=logical`, a slot to manage (a stalled slot retains WAL), decoding of every change, and per-subscriber filtering. |
| 4 | Outbox relay → bus → broadcast | Reuses the relay. | Up to 1 s poll latency plus the relay's backlog (29–54 s measured, 3.5). The bus is in-process, so it still needs a cross-instance hop. |
| 5 | Each connection polls the database (Solid Cable style) | No listener. | Load grows with connections × poll rate. |

Option 1 sits behind a port, so option 2 can replace it without touching core.

### 5.3 Resume after a reconnect

| Rank | Option | For | Against |
|---|---|---|---|
| 1 | **Per-chat contiguous `seq`, bumped under the chat row lock; subscribe first, then fetch changes since each cursor** | Commit-ordered within a chat, contiguous, so a client sees a gap exactly (`seq` ≠ last + 1). Survives a reconnect to another instance. No server-side buffer. | A schema change (`chats.seq`, `messages.seq`); every chat write must bump it. |
| 2 | Server replay buffer keyed by `Last-Event-ID` | Standard SSE resume. | Per instance unless stored centrally; one id cannot carry the positions of many multiplexed chats. |
| 3 | Re-read everything shown on reconnect | Simple, correct. | The cost this design removes, paid on every reconnect. |
| 4 | `updated_at > t` cursor | No schema change. | Wrong: `created_at` is set before commit (3.1), so a slower transaction commits a smaller value after the client moved past it. |

### 5.4 Event content

| Rank | Option | For | Against |
|---|---|---|---|
| 1 | **Each instance reads the change once and pushes the message to its local subscribers** | One database read per instance per change; no request per recipient. | The pushed view cannot carry per-viewer fields; `viewerReaction` is derived on the client and deleted bodies are not sent. |
| 2 | Thin signal; every client fetches the change | Reads stay on the existing authorized path. | One HTTP request per recipient per change: a message in a 100-person group is 100 requests. |
| 3 | Full payload in the NOTIFY | No read. | A body can be 10,000 characters, over the payload limit. |

### 5.5 Placement (decision for you)

The design needs no new bounded context. Two placements fit:

- **a. discussion.** The stream carries only chat changes, which discussion owns. `ChatService` gains `watch`; the hub is a discussion service. Recommended.
- **b. `reporting/member`.** A member stream that composes discussion with other reads (for example the notification bell). Reporting reads every context and owns nothing, but the write-time signals still come from discussion.

Confirm a, or choose b.

### 5.6 Recommendation

SSE (5.1-1), `pg_notify` in the write transaction (5.2-1), per-chat `seq` with subscribe-then-fetch (5.3-1), one read per instance (5.4-1), in discussion (5.5-a). Section 6 specifies it.

## 6. Design

### 6.1 How a message travels

```
James (browser) ─POST /chats/cht_1/messages─▶ instance B
  ChatService.send, one transaction:
    UPDATE chats SET seq = seq + 1 … RETURNING seq      → 42 (row locked until commit)
    INSERT messages (…, seq = 42)
    outbox.append(message.sent)
    signals.append({ topic: chat, key: cht_1, seq: 42, kind: message })  → pg_notify
  COMMIT ─▶ Postgres delivers the notification to every listener

instance A (Sarah's stream)          instance B (James's other tab)
  hub: chat cht_1 has local subscribers, last read seq 41
  repo.changesSince(cht_1, 41) → message 42, rendered once
  push `message.created` to Sarah's connections
                                      same, for James's connections
```

The outbox and the notification process run as before; the 2-minute quiet period still decides whether James's message notifies Sarah.

### 6.2 Schema

| Table | Column | Meaning |
|---|---|---|
| `chats` | `seq bigint not null default 0` | The chat's change counter. |
| `messages` | `seq bigint not null default 0` | `chats.seq` at the message's last change. Index `(org_id, chat_id, seq)`. |
| `messages` | `client_id text null` | The sender's idempotency key. Unique `(org_id, chat_id, org_user_id, client_id)`. |

`DrizzleChatRepository.touch` becomes `bump`: `UPDATE chats SET seq = seq + 1, updated_at = now() … RETURNING seq`, run first in every chat write so the row lock orders the whole transaction. Insert, edit, delete and reaction set `messages.seq` to the bumped value; reactions now bump too. Chat changes (accept, leave, lock, add participant) bump the chat only.

### 6.3 Ports and adapters

`packages/core/src/shared/ports.ts`:

```ts
export interface LiveSignal {
  orgId: string;
  topic: 'chat' | 'member';
  key: string;          // chat id or org user id
  kind: string;         // 'message' | 'chat' | 'read' | 'subscription' | 'typing'
  seq?: number;
  data?: JsonValue;     // small; typing only
}

/** Tx-bound: signals become visible to listeners when the surrounding write commits. */
export interface LiveSignalAppender {
  append(signals: LiveSignal[]): Promise<void>;
}

/** Signals committed on any instance. `reset` fires when signals may have been lost. */
export interface LiveSignalFeed {
  subscribe(handler: (signal: LiveSignal) => void, reset: () => void): () => void;
  publish(signal: LiveSignal): Promise<void>;   // outside a transaction; ephemeral signals
  start(): Promise<void>;
  stop(): Promise<void>;
}
```

| Port | Adapter | Package |
|---|---|---|
| `LiveSignalAppender` | `PgNotifySignalAppender`: `SELECT pg_notify('hlms_live', $1)` on the transaction's executor; refuses payloads over 7,900 bytes | `adapters/db` |
| `LiveSignalFeed` | `PgListenSignalFeed`: a dedicated `pg.Client` (not the pool) on `LIVE_DATABASE_URL`, default `DATABASE_URL`; `LISTEN hlms_live`; reconnects with backoff and calls `reset` after every reconnect | `adapters/db` |
| both | `InMemorySignals` for tests and a single process | `adapters/defaults` |

`ChatWriteScope` gains `signals: LiveSignalAppender` (`packages/core/src/discussion/ports.ts:691-695`). `markRead` and subscription changes move into the unit of work so their signals commit with them.

Signals by write:

| Write | Signal |
|---|---|
| send, edit, delete, reaction set or cleared | `chat`/`message`, `seq` |
| start, accept, add participant, leave, lock, unlock | `chat`/`chat`, `seq` |
| mark read | `member`/`read`, key = reader |
| chat mute set or cleared | `member`/`subscription`, key = member |
| typing | `chat`/`typing`, published outside a transaction |

### 6.4 The hub

`ChatLiveHub` in `packages/core/src/discussion/live.ts`, one per process, built in the container with the feed, the chat repository, the profile reader, `FileUrls`, entitlements as `CommunityAccessReader`, and a `recheckMs` setting (default 30,000).

State, per instance:

- `byChat`: chat id → local connections whose member is an active participant.
- `byMember`: org user id → local connections.
- `lastSeq`: chat id → highest `seq` pushed from this instance.
- a promise chain per chat, so one chat's signals are handled in order.

On a signal:

| Signal | Action |
|---|---|
| `chat`/`message`, no local subscribers | ignore |
| `chat`/`message` | `changesSince(chatId, lastSeq)`; render each message without `viewerReaction`; push `message.created`, `message.updated`, `message.deleted` or `message.reactions` per change; set `lastSeq` |
| `chat`/`chat` | read the chat and its active participants once; add the chat to `byChat` for local connections of new participants (push `chat.added`); remove it for those who left (push `chat.removed`); push `chat.updated` to the rest |
| `member`/`read`, `member`/`subscription` | for that member's local connections only: `unreadFor` and the unread total, push `chat.read` and `unread` |
| `chat`/`typing` | push `typing` to the other participants' connections |
| `reset` | push `resync` to every local connection; clear `lastSeq` |

After `message.created` or `message.deleted`, each recipient's unread total is recomputed and pushed as `unread`, at most once a second per member.

`ChatService.watch(orgId, actor, communityId, session)` returns an `AsyncIterable<ChatLiveEvent>`:

1. `requireSettings` and `requireActor` (entitlements), as every chat read does.
2. Load the member's active chat ids in the community, register the connection, then yield `ready` and the current `unread`. The connection is registered before the client fetches, so nothing committed after `ready` is missed.
3. Every `recheckMs`: `isCommunityMember` again and `session.current()`. On failure yield `closed` with reason `access` or `session` and end.
4. A bounded queue of 256 events per connection. On overflow, drop the queue, yield `resync`.

`session.current()` is passed in by the HTTP layer and calls `auth.verify` with the cookie cache bypassed, so a sign-out or a password reset ends the stream at the next check.

`ChatService` also gains `chat(orgId, actor, chatId)`, `changes(orgId, actor, chatId, since)`, `unreadSummary(orgId, actor, communityId)` and `typing(orgId, actor, chatId)`. Each checks access exactly as `messages` does (`chats.ts:636-651`).

### 6.5 Endpoints

| Route | operationId | Call | Response |
|---|---|---|---|
| `GET /api/member/communities/:communityId/chats/events` | `streamMemberChatEvents` | `chats.watch` | `200 text/event-stream`, items `ChatLiveEvent` |
| `GET /api/member/chats/:chatId` | `getMemberChat` | `chats.chat` | `ChatListItem` |
| `GET /api/member/chats/:chatId/changes?since=` | `listChatChanges` | `chats.changes` | `{ seq, messages: MessageView[], reset }` |
| `GET /api/member/communities/:communityId/chats/unread` | `getMemberChatUnread` | `chats.unreadSummary` | `{ unread, requests }` |
| `POST /api/member/chats/:chatId/typing` | `sendChatTyping` | `chats.typing` | `204` |

Changes to existing contracts:

- `ChatListItem` gains `seq` and `participants: { orgUserId, displayName, imageUrl }[]`, so the inbox and the chat header need no directory.
- `MessageView` gains `seq` and `clientId`.
- `SendMessage` gains optional `clientId` (UUID). A repeat with the same `clientId` returns the stored message.
- `listChatMessages` gains `before` (a message id): the page of messages older than it, by `created_at, id`. The offset parameters stay.
- `listChatChanges` returns the messages with `seq > since` in `seq` order, each as a full per-viewer `MessageView`. When more than 200 changes are pending it returns `reset: true` and no messages; the client reloads the latest page.

### 6.6 Wire format

The stream route is a schema and one call. A shared helper, `packages/server/src/http/sse.ts`, hijacks the reply, writes the headers already set by hooks (CORS, `x-request-id`) plus the stream headers, writes one frame per event, a heartbeat every 25 s, and ends the response when the iterable ends or the client disconnects.

```
HTTP/1.1 200 OK
content-type: text/event-stream; charset=utf-8
cache-control: no-cache, no-transform
x-accel-buffering: no

retry: 3000

event: ready
data: {"heartbeatMs":25000}

event: unread
data: {"unread":3,"requests":1}

event: message.created
data: {"chatId":"cht_1","seq":42,"message":{"id":"msg_…","clientId":"0f6c…","orgUserId":"orm_james",…}}

: ping
```

Frames carry no `id:`. The stream multiplexes many chats, so a single `Last-Event-ID` cannot hold the resume point; each chat's `seq` does (5.3).

In the route schema the response is declared as content, which `@fastify/swagger` emits as a media type and the SDK generator turns into a stream method:

```ts
response: {
  200: { content: { 'text/event-stream': { schema: ChatLiveEvent } } },
  ...refusals(403, 404),
}
```

The spec stays 3.0.3. There, the schema under `text/event-stream` is read as the schema of one event's `data`. This is the meaning OpenAPI 3.2 gives `itemSchema` (2.1), and it is what the SDK generator uses to type the stream's items. A test pins the generated method's item type to `ChatLiveEvent`.

The helper is written over `reply.hijack()` rather than added as `@fastify/sse`. The route needs a heartbeat, an async iterable and a close hook; it does not need the plugin's `Last-Event-ID` replay (6.9). Hijacking also skips the reply lifecycle, so the helper has to write the CORS headers itself either way.

### 6.7 Event types

`ChatLiveEvent` is a union discriminated by `type`, which is also the SSE `event:` name.

| Event | Data | Client action |
|---|---|---|
| `ready` | `heartbeatMs` | reconcile (6.9) |
| `message.created` | `chatId`, `seq`, `message` (a `MessageView` without `viewerReaction`) | insert by id; set `seq`; bump the inbox row |
| `message.updated` | `chatId`, `seq`, `messageId`, `body`, `editedAt`, `mentions` | patch by id |
| `message.deleted` | `chatId`, `seq`, `messageId`, `deletedAt` | mark deleted, drop body and images |
| `message.reactions` | `chatId`, `seq`, `messageId`, `reactions`, `orgUserId`, `emoji` (null when cleared) | replace counts; set own reaction when `orgUserId` is the viewer |
| `chat.updated` | `chatId`, `seq`, `chat`, `participantIds` | replace chat fields |
| `chat.added` | `chatId`, `seq` | `getMemberChat`, insert into the inbox |
| `chat.removed` | `chatId` | drop from inbox; leave the thread view if open |
| `chat.read` | `chatId`, `lastReadMessageId`, `unread` | set the row's read state (another tab or device of the same member) |
| `unread` | `unread`, `requests` | set the badge total |
| `typing` | `chatId`, `orgUserId`, `until` | show until `until` |
| `resync` | — | reconcile (6.9) |
| `closed` | `reason`: `access`, `session`, `shutdown` | `access`/`session`: stop and follow the app's 403/401 path; `shutdown`: reconnect |

Typing and presence are optional. Typing is specified because it needs nothing stored. Presence (who is online) needs a shared record of live connections across instances and is left unspecified here.

### 6.8 Auth on the stream

- `requireOrgSession` on the request: Better Auth session from the cookie, active organization required.
- `requireActor`: entitlements decides community membership, as for every chat read.
- Per chat: events reach only connections whose member is an active participant; the hub's index is rebuilt from the database on every `chat` signal.
- Re-check every 30 s: community membership through entitlements and the session through Better Auth. A revoked grant, an expired grant, a removed org user, a removed bundle item or a signed-out session ends the stream with `closed`.
- The browser connects with credentials from an allowed origin (`cors.ts:8-13`); the cookie is `SameSite=Lax`, so other sites cannot open a stream with it.
- The pushed message view is the same for every recipient: no `viewerReaction`, no body for a deleted message. Staff read deleted bodies through `listChatChanges`.

### 6.9 Reconnect and backfill

The client keeps `seq` per loaded chat. On `ready` and on `resync`:

1. `getMemberChatUnread` for the badge.
2. `listMemberChats` page 1 for the inbox rows (ordered by activity, so every changed chat is on it or below a chat that did not change).
3. For the open chat and each chat with a loaded thread: `listChatChanges?since=<seq>`; on `reset`, the latest page.

While connected, a `message.*` event with `seq` greater than known + 1 triggers step 3 for that chat; one with `seq` ≤ known is a duplicate and is dropped. Messages merge by id, so a change seen on both the stream and a fetch applies once.

Sarah closes her laptop with `cht_1` at `seq` 41. James sends two messages (42, 43), edits 42 (44) and Emma deletes hers (45 in the group). Sarah's tab reconnects to instance B, gets `ready`, calls `listChatChanges?since=41` and receives 42 (edited) and 43; the group thread receives 45. The badge comes from `getMemberChatUnread`.

### 6.10 Operations

- Heartbeat 25 s, under the common 60 s proxy idle timeout.
- Proxies must not buffer the route; `x-accel-buffering: no` covers nginx.
- One stream per tab. Behind HTTP/2 the browser multiplexes; on HTTP/1.1 more than five tabs on one API origin exhaust the connection limit, and the client falls back (6.11).
- Shutdown: an `onClose` hook ends every stream with `closed { reason: shutdown }` before the relay stops (`packages/server/src/http/server.ts:58-61`), so `app.close()` does not wait on open streams.
- `LISTEN` uses one session connection per instance. Behind PgBouncer in transaction mode, `LIVE_DATABASE_URL` points at Postgres directly; `pg_notify` inside the write works through any pooler.
- Only chat writes notify, which keeps the commit lock that `NOTIFY` takes off every other write.

### 6.11 The community app

**Store.** `src/lib/live/chat-store.ts` holds, per tab: inbox rows by chat id, threads by chat id (messages by id, display order, `seq`, oldest loaded id, `more`), the unread total, typing marks and the connection state. Components read it with `useSyncExternalStore`. A pure reducer applies events, dedupes by message id and reports gaps.

**Connection.** `src/lib/live/connection.ts` opens `Chats.streamMemberChatEvents` with a browser SDK client (`baseUrl` = `NEXT_PUBLIC_API_URL`, `credentials: 'include'`). It reconciles on `ready` and `resync`. It closes the stream when the tab has been hidden for 60 s and reopens it on `visibilitychange` to visible, which reconciles. If no `ready` arrives within 10 s, or three connects fail within a minute, it switches to polling: `listChatChanges` for the open chat and `getMemberChatUnread` every 15 s while visible, one request at a time; it retries the stream with exponential backoff and jitter up to 60 s and leaves polling when one connects.

**Reads from the browser.** Gap fills, "Show earlier" and `getMemberChat` go from the browser SDK client straight to the API. Server Actions dispatch one at a time per client (`hlms-community/node_modules/next/dist/docs/01-app/02-guides/server-actions.md:28`) and re-render on `refresh()`; reads do not need either.

**Writes.** Chat actions stay Server Actions, return the API's result and stop calling `refresh()`. Sequential dispatch keeps send order.

**Optimistic send.** The composer adds a pending message with a new `clientId`, sends, and replaces it with the returned `MessageView`. If the stream's `message.created` with the same `clientId` lands first, it replaces the pending one and the response is a no-op. A failed send keeps the pending message with a retry; the retry reuses the `clientId`, so the API stores it once.

**Read marks.** When a message from someone else arrives in the open chat while the tab is visible and the view is near the bottom, the client calls `markChatRead` after 1 s of quiet.

**Files.**

| File | Change |
|---|---|
| `src/components/chats/auto-refresh.tsx` | delete |
| `src/app/(community)/chats/layout.tsx` | remove `<AutoRefresh />` |
| `src/app/(community)/layout.tsx` | mount `<ChatLive>` once for the community, seeded with the unread total |
| `src/lib/live/chat-store.ts` | new: store and reducer |
| `src/lib/live/connection.ts` | new: stream, reconcile, visibility, fallback |
| `src/lib/live/api.ts` | new: browser SDK client with credentials |
| `src/components/chats/chat-live.tsx` | new: provider, connection lifecycle |
| `src/components/chats/inbox.tsx` | server part loads page 1 only; a client list renders store rows; names and avatars from `participants`, no `getPeople()` |
| `src/app/(community)/chats/[chatId]/page.tsx` | `getMemberChat` and the latest message page only; no `getChats()`, `getPeople()` or page loop; seed the store |
| `src/components/chats/thread.tsx` | render from the store; "Show earlier" with `before`; read marks on arrival |
| `src/components/chats/composer.tsx` | optimistic send with `clientId`; typing signal at most every 3 s |
| `src/components/chats/chat-chrome.tsx` | load addable people on open from the directory with `search`, not from a prop |
| `src/components/shell/frame.tsx` | chat badges read the store's unread total |
| `src/server/actions/chats.ts` | return results; no `refresh()`; `clientId` on send |
| `src/server/actions/shared.ts` | a `call` variant of `mutate` without `refresh()` |
| `src/server/data.ts` | `getChat`, `getInboxPage`, `getChatUnread`; `getInbox` no longer reads every chat |
| `README.md` | replace the 5-second refresh line |

### 6.12 Files in headless-lms

| File | Change |
|---|---|
| `packages/core/src/shared/ports.ts` | `LiveSignal`, `LiveSignalAppender`, `LiveSignalFeed` |
| `packages/core/src/types/schemas/discussion.ts` | `seq` on chat and message, `clientId` on message, `ChatLiveEvent`, `ChatChanges`, `ChatUnreadSummary` |
| `packages/core/src/discussion/ports.ts` | `signals` in `ChatWriteScope`; `ChatService.watch`, `chat`, `changes`, `unreadSummary`, `typing`; repository `bump`, `changesSince`, `chatIdsFor`, `unreadSummary`, `messagesBefore`, `findByClientId` |
| `packages/core/src/discussion/chats.ts` | signals in every chat write; `clientId` idempotency; new reads |
| `packages/core/src/discussion/live.ts` | new: `ChatLiveHub` |
| `packages/core/src/discussion/subscriptions.ts` | signal on chat mute changes |
| `packages/core/src/discussion/index.ts` | export the hub and the new types |
| `adapters/db/src/schema/discussion.ts` + a generated migration | `chats.seq`, `messages.seq`, `messages.client_id`, indexes |
| `adapters/db/src/repositories/chats.ts` | `bump` replaces `touch`; `seq` on writes and reactions; new reads |
| `adapters/db/src/live.ts` | new: `PgNotifySignalAppender`, `PgListenSignalFeed` |
| `adapters/defaults/src/live/index.ts` | new: `InMemorySignals` |
| `packages/server/src/app/container.ts` | wire the appender into the chat unit of work, the feed and the hub; start and stop the feed |
| `packages/server/src/http/sse.ts` | new: SSE frame writer and heartbeat |
| `packages/server/src/http/routes/member/chats.ts` | the five routes; `before` and `clientId` on existing ones |
| `packages/server/src/http/schemas/chats.ts` | route schemas |
| `packages/server/src/http/server.ts` | close streams in `onClose` |
| `apps/api/src/main.ts`, `apps/api/src/config.ts` | start the feed; `LIVE_DATABASE_URL` |
| `packages/sdk` | regenerate (`pnpm gen:sdk`) |
| `docs/domain/discussion.md` | the change sequence on a chat and the live stream as a discussion capability |

## 7. Test plan

**Core (`packages/core/src/discussion/live.test.ts`, in-memory signals).**

- A message in `cht_1` reaches Sarah's and James's connections and not Emma's.
- A non-participant in the community receives nothing for `cht_1`.
- Emma leaves the group: she gets `chat.removed`, then nothing more from it.
- James adds Emma: she gets `chat.added` and later messages.
- `reset` from the feed sends `resync` to every connection.
- A full connection queue yields `resync` and drops the queue.
- `seq` in pushed events is contiguous per chat; two concurrent sends get 42 and 43 in commit order.
- `message.reactions` carries counts and the reacting member; no event carries `viewerReaction`.
- `clientId`: a repeat send returns the first message and appends no event.

**Adapter (`adapters/db`, real Postgres).**

- A signal appended in a transaction that rolls back is never delivered; a committed one is delivered once.
- A payload over the limit is refused before the commit.
- `pg_terminate_backend` on the listener: the feed reconnects and calls `reset`.
- `bump` under concurrent writers to one chat yields gap-free `seq` matching commit order.

**Multi-instance fan-out (server integration).** Two containers and two Fastify instances on one Postgres. Sarah's stream on A; James sends through B. Sarah receives `message.created` within 1 s with the body James sent. James's second tab, also on B, receives it too. An edit and a delete through A reach both. A send through B to a chat with no subscriber on A causes no read on A.

**Reconnect with missed messages.** Sarah connected to A at `cht_1` `seq` 41. Abort her stream. Through B, James sends two messages, edits one and deletes one. Sarah reconnects to B: she gets `ready`, `listChatChanges?since=41` returns exactly the changes 42–45 in order, and her store equals a fresh load of the chat. Repeat with 250 changes: the response is `reset: true`, and the latest page loads.

**Revoked access closes the stream.**

- Revoke Sarah's grant to the community: within 30 s her stream yields `closed { reason: access }` and ends; a new connect returns 403.
- Let the grant expire through the expiry job: same result.
- Remove the community from the bundle Sarah holds: same result.
- Sign Sarah out on another device: her stream yields `closed { reason: session }`; a new connect returns 401.
- No event for `cht_1` is written to her connection after the close.

**Auth and contract.**

- No cookie: 401. A member of another community: 403. A disallowed `Origin`: no CORS headers.
- `openapi.json` declares `text/event-stream` for `streamMemberChatEvents`; the regenerated SDK exposes it as a stream method.
- Through nginx with default buffering: events arrive as written; heartbeats keep a 5-minute idle stream open.
- `app.close()` with open streams completes and each client receives `closed { reason: shutdown }`.

**Community app.**

- Reducer: dedupe by id, gap detection, out-of-order `seq`, optimistic replacement by `clientId` whether the response or the event lands first.
- Two browsers, Sarah and James: James's message appears for Sarah without a reload; the network panel shows no RSC requests while the chat is idle.
- Repeat the UI-24 measurement (`hlms-community/docs/qa/issues.md:563-570`): an idle open chat transfers only heartbeats; a received message costs one event of a few KB.
- Hide the tab for 60 s: the stream closes; show it: it reconnects and reconciles.
- Block the stream route at the proxy: the app switches to polling within 10 s and back when unblocked.
- Repeat the LOAD-05 pass (`issues.md:357-378`) with the API stalled: no overlapping chat renders.
