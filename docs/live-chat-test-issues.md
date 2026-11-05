# Live chat testing on feature/configurable-roles

Testing live chat after merging `worktree-realtime-chat` into `feature/configurable-roles` (merge `6d6a097c`). Design: `docs/realtime-chat.md`. Community app: `hlms-community` on its `feature/configurable-roles` branch.

## Stack

- API on :8200 from this worktree, `.env` with `DATABASE_URL` on `headless_lms_roles`; emails go to the local email sink, none to Resend.
- Community app on :3200, admin on :8201, student on :8202.
- Postgres `headless-lms-postgres` on :8005, `max_connections` raised from 100 to 300 for this run; the automated suites use `headless_lms_test_chat`.
- Test users on `@checkoutjoy.com`.

## Progress

| # | Area | Status |
|---|---|---|
| 1 | Automated suites | passed |
| 2 | Functional, two browsers | passed |
| 3 | Connection lifecycle | passed |
| 4 | Access and session | passed |
| 5 | Multiple instances behind a proxy | open |
| 6 | Infrastructure | open |
| 7 | Load and measurements | open |
| 8 | Regression | open |

## Issues

| # | Area | Issue | Status | Fix |
|---|---|---|---|---|
| 1 | Multiple instances | With two API instances, both outbox relays dispatched every event in the same millisecond: the rows were locked only for the select, so each poll took the same rows. Every live message reached a stream twice, and every automation ran twice before its unique key dropped the second. The `OutboxStore` port already says `fetchBatch` claims what it returns. | fixed | `521a1c11`: `fetchBatch` claims its rows for 60 s in the same transaction; a Postgres test with two stores fetching at once |
| 2 | Logging | A chat stream left no line when it ended: the route takes over the response, so Fastify never logs `request completed` when the client disconnects, and the hub logged opens and closes at debug without the member or the reason. A stream closed for access or session left no trace at info. | fixed | `4149b561`: `event stream ended` at info with duration, events sent and how it ended; `chat stream closed` at info with the member and reason |
| 3 | Shutdown | Stopping the API with SIGTERM never closed the server: nothing called `app.close()` on a signal, and the Hatchet worker's own handler exited the process once the worker stopped. Open streams got a reset instead of `closed { reason: 'shutdown' }`, which the self-hosting page promises; the relay, the engine and PubSub were never stopped. | fixed | `779799d9`: `closeOnSignals(app)` in both entry points, the Hatchet worker started with `handleKill: false`; the log now reads shutting down → chat hub closed → outbox relay stopped → hatchet worker stopped → pubsub stopped → shut down |

## Log

### 1. Automated suites

- headless-lms with `TEST_DATABASE_URL` on `headless_lms_test_chat`: 175 files, 2284 tests, none skipped. Build, lint and typecheck pass.
- hlms-community: 10 files, 116 tests; lint, typecheck and build pass.

### 2. Functional

Browsers (agent-browser, one session each for Sarah, James and Emma, community app on :3200, API on :8200):

- James sends, edits, deletes; Sarah reacts. Each shows in the other browser without a reload; Sarah's network log shows only the stream, no page refreshes.
- Emma's request to James: James accepts from the inbox, Emma's composer opens without a reload. James's Messages badge goes 3 → 4 when Emma sends, and her row moves up with its count.
- A new chat from Ruth appears in Sarah's inbox with the badge.
- Typing: "Emma is typing…" shows for James and clears after about 5 s.
- Group: James starts one with Sarah and Omar (it appears for Sarah), adds Emma (it appears for her with the history), Omar's message reaches her. She leaves: the chat leaves her inbox, James's header drops her, a later message does not reach her and reading it returns 403.
- Sarah (owner) locks her chat with James: his composer shows "This chat is locked" without a reload; unlocking brings it back.
- Double-clicking Send stores one message. Sending offline shows "Not sent" with Retry; retrying online stores one message.
- Console: no errors after the stack restart.

Script `02-functional.mjs` (six streams, real API), 49/49 after the fix for issue 1:

- ready then unread on connect; a request raises the requests count, accepting lowers it, the last pushed unread equals `getMemberChatUnread`;
- chat.state for read marks and mutes goes only to that member;
- the same clientId sent twice at once and once more returns one message, one stored event, one `message.created`; another member's message with that clientId is its own;
- leaving pushes `chat.removed` and nothing more of that chat; being added back pushes `chat.updated` and the next message;
- Mia (community Moderator, not in the chat) locks and unlocks: both members get it live, Mia gets no row and the chat is not in her list, sends are refused while locked;
- typing reaches the other member with `until` about 5 s ahead, a repeat within 2 s is dropped, the typist gets none;
- no pushed message carries `viewerReaction`, no `message.deleted` carries a body, no stream gets another member's `chat.state`.

### 3. Connection lifecycle

nginx (`hlms-chat-nginx`, default buffering) on :8300 in front of A (:8200) and B (:8210); a cookie pins Sarah's browser to A and James's to B. The community app's `NEXT_PUBLIC_API_URL` and `API_URL` point at :8300.

- Hidden tab: Sarah's tab hidden at 18:09:44; her stream ended at 18:10:44 (`event stream ended`, `ended: client`). James sent while hidden. Shown again: a new stream, then the inbox, the requests and the chat's latest page load, and James's message is there.
- Chrome's offline mode does not cut an open stream (it kept delivering), so the network drop was done at the proxy instead.
- Proxy stopped for 13 s while James sent two messages and edited one through B: three failed connects, then polling; 2 s after the proxy was back, the stream reconnected and both messages and the edit were shown.
- Instance A killed with `kill -9` while Sarah's stream was on it; James sent two through B and deleted one; after A restarted, Sarah's chat showed the first and the second as deleted.
- Stream route blocked at the proxy (502): three failed connects, then the app polls unread, inbox, requests and the open chat every 15 s; James's message showed by polling within 3 s of the next poll. Unblocked: back on the stream, no requests over the next 20 s, and the next message arrived live in 1.5 s.
- Graceful restart of A (SIGTERM) with streams open, direct and through the proxy: after the fix for issue 3, each received `closed { reason: 'shutdown' }` 127 ms after the signal; the browser reconnected and caught up.

### 4. Access and session

Script `04-access.mjs`, each case with a freshly invited member (invite email from the sink, sign-up, accept, grant), streams on A or B:

- No cookie 401; an org member without the community 403; another community's stream 403.
- Grant revoked: `closed { access }` after 30 s, a new connect 403.
- Grant expiring 8 s after it was given, then the expiry job run through Hatchet (`scheduled-job` with `entitlements.grants.expire`): the job records `entitlement.expired`; the stream gets `closed { access }` 24 s after the job; a new connect 403.
- Community removed from the bundle the member holds: `closed { access }` after 31 s.
- Member removed from the org: `closed { access }` after 31 s.
- Signed out: `closed { session }` after 31 s; the old cookie gets 401.
- Password reset through the emailed link: `closed { session }` after 34 s.
- A custom role based on Moderator, given on the community, holds `communities:moderate` and locks the James–Emma chat; Emma gets it live on the other instance; the chat is not in the steward's list and their stream gets no row. A member without the permission gets 403 "You need communities:moderate". Taking the role back refuses the next lock at once.
- The hub logs each closure at info with the member and reason (issue 2).

Browsers:

- 403 path: a fresh member with `/chats` open; Sarah revokes the grant; 22 s later the page shows the app's not-a-member state without a reload.
- 401 path: Emma signs out in a second tab; the hub closes her stream for `session` and the first tab goes through `/session/reset` to sign-in.
- Mia (community Moderator) locks the flagged Pod 1 chat from the admin moderation queue; James's open chat shows "This chat is locked" without a reload, and the flagged message leaves the queue.
- Warnings and errors in both API logs since the run began: only the two expected "chat moderation refused" warnings.
