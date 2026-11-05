# create-headless-lms

## 0.3.0

### Minor Changes

- [`5364095`](https://github.com/mdwt/headless-lms/commit/536409507d9d4956027c323fca8fdc5d60f19276) Thanks [@mdwt](https://github.com/mdwt)! - Live chat: every chat change is delivered to the members' open streams on every API instance. A new `PubSub` port carries chat changes between instances; the chat hub on each instance pushes the current state to the streams connected to it over server-sent events. `GET /api/member/communities/:communityId/chats/events` (`streamMemberChatEvents`) streams `ChatLiveEvent`s; access is checked when the stream opens. New reads: one chat (`getMemberChat`), the direct chat with a person (`getMemberDirectChat`) and the unread total (`getMemberChatUnread`); `sendChatTyping` tells the chat you are typing. `listMemberChats` takes `requests`, `ChatListItem` carries the participants' profiles, and a send takes a `clientId` that makes a repeat send return the stored message.

  Marking a chat read, changing a reaction and muting a chat now emit domain events (`discussion.chat.read`, `discussion.message.reactions.changed`, `discussion.chat.muted`) with no public form; a read mark only moves forward. `adapter-db` adds `messages.client_id` with its unique index (migration `0018`).

  Breaking: `ServerConfig` requires `pubsubDatabaseUrl`. The container takes `adapters.pubsub` (a `PubSub` or a factory given the logger) and exposes `container.pubsub` and `container.chatHub`; without one the stream answers 503. The entry point starts both after `listen` and before the outbox relay, as the scaffolded `main.ts` now does.

### Patch Changes

- [`779799d`](https://github.com/mdwt/headless-lms/commit/779799d9c21d703707b26003377bf4aa2075f7ff) Thanks [@mdwt](https://github.com/mdwt)! - `closeOnSignals(app)` closes the server on SIGTERM or SIGINT so its close hooks run: open chat streams get `closed { reason: 'shutdown' }`, the outbox relay drains, the automation engine stops and PubSub unlistens. A second signal, or a close that takes longer than 10 s, exits at once. The API entry point and the project template call it after `listen`. Before this, nothing closed the server on a signal, and the Hatchet worker's own signal handler exited the process as soon as the worker stopped. `adapter-workflow-hatchet` now starts its worker with `handleKill: false` and logs `hatchet worker stopped`.

## 0.2.0

### Minor Changes

- [`f9faa8f`](https://github.com/mdwt/headless-lms/commit/f9faa8fb287da9c3c8d8f50194155430d63e8516) Thanks [@mdwt](https://github.com/mdwt)! - Notification subsystem: notification types and recipient rules in code, community and org notification categories, member settings per category, channel and space, push devices, follows and mutes as subscriptions, mentions, reaction and edit events, debounced chat notifications, community digests on their own schedule, and a filtered notification list with unread counts. Timed product work (scheduled posts, grant expiry, digests, the upload sweep) runs as jobs on a new `Scheduler` port.

  Breaking: nothing is seeded for a new org or community, and the seeded automations, the `notify` action and the automation `source` are gone; `GET`/`PUT /api/member/notification-preferences`, the post follow routes and the chat mute routes are removed in favour of notification settings and subscriptions; a `workflows` adapter must implement `Scheduler` beside `AutomationEngine`. The scaffolded `main.ts` starts the outbox relay and the engine after `listen`.

## 0.1.2

### Patch Changes

- Communities with spaces, posts, chats, moderation and member profiles; an MCP server with OAuth sign-in, connected apps and scoped API keys; access-checked proxy URLs for every file; per-person notification preferences; one API error envelope and request limits; security hardening across automations, auth and webhooks. Breaking: an organization no longer edits a person's name or email.

## 0.1.1

### Patch Changes

- [`f66e702`](https://github.com/mdwt/headless-lms/commit/f66e70258c748f01b966201a697707591dd06cef) Thanks [@mdwt](https://github.com/mdwt)! - Resolve @headless-lms/* dependency versions from the npm registry at scaffold time. The template hardcoded ^0.0.0, which was never published, so pnpm install failed in every scaffolded project (and migrate with it).

## 0.1.0

### Minor Changes

- 0f137b9: Initial public release
