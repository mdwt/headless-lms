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
| 3 | Connection lifecycle | open |
| 4 | Access and session | open |
| 5 | Multiple instances behind a proxy | open |
| 6 | Infrastructure | open |
| 7 | Load and measurements | open |
| 8 | Regression | open |

## Issues

| # | Area | Issue | Status | Fix |
|---|---|---|---|---|
| 1 | Multiple instances | With two API instances, both outbox relays dispatched every event in the same millisecond: the rows were locked only for the select, so each poll took the same rows. Every live message reached a stream twice, and every automation ran twice before its unique key dropped the second. The `OutboxStore` port already says `fetchBatch` claims what it returns. | fixed | `521a1c11`: `fetchBatch` claims its rows for 60 s in the same transaction; a Postgres test with two stores fetching at once |

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
