# @headless-lms/adapter-defaults

## 0.4.1

### Patch Changes

- [`d902c10`](https://github.com/mdwt/headless-lms/commit/d902c1070ca1603a35ef0b525ba0c7899034abec) Thanks [@mdwt](https://github.com/mdwt)! - `describeError` (in `@headless-lms/core/shared/logger`) turns an error into a log line that names the cause: each distinct inner error of an `AggregateError`, and the error code when the message leaves it out. A refused Postgres connect is an `AggregateError` with an empty message, so `outbox poll failed` logged only "AggregateError" and the PubSub adapter's connect and listener errors logged an empty string. The outbox relay, the PubSub adapter and the live chat forwarder and hub use it for their errors, and the relay for the stored `last_error`; `live publish failed` had logged an empty error while PubSub was down.

- Updated dependencies [[`28b6239`](https://github.com/mdwt/headless-lms/commit/28b6239a2995088e33f877598e4fa116e54a49d3), [`2e99dd4`](https://github.com/mdwt/headless-lms/commit/2e99dd427b59ee7aed21572ebfc12b8039323998), [`d902c10`](https://github.com/mdwt/headless-lms/commit/d902c1070ca1603a35ef0b525ba0c7899034abec), [`5364095`](https://github.com/mdwt/headless-lms/commit/536409507d9d4956027c323fca8fdc5d60f19276), [`2a80581`](https://github.com/mdwt/headless-lms/commit/2a805817f266f5fd61b949f842622941b6262927), [`521a1c1`](https://github.com/mdwt/headless-lms/commit/521a1c11f2785dca67cb5c5b55a905ce4d3efcde)]:
  - @headless-lms/core@0.5.0
  - @headless-lms/adapter-db@0.5.0

## 0.4.0

### Minor Changes

- [`f9faa8f`](https://github.com/mdwt/headless-lms/commit/f9faa8fb287da9c3c8d8f50194155430d63e8516) Thanks [@mdwt](https://github.com/mdwt)! - Notification subsystem: notification types and recipient rules in code, community and org notification categories, member settings per category, channel and space, push devices, follows and mutes as subscriptions, mentions, reaction and edit events, debounced chat notifications, community digests on their own schedule, and a filtered notification list with unread counts. Timed product work (scheduled posts, grant expiry, digests, the upload sweep) runs as jobs on a new `Scheduler` port.

  Breaking: nothing is seeded for a new org or community, and the seeded automations, the `notify` action and the automation `source` are gone; `GET`/`PUT /api/member/notification-preferences`, the post follow routes and the chat mute routes are removed in favour of notification settings and subscriptions; a `workflows` adapter must implement `Scheduler` beside `AutomationEngine`. The scaffolded `main.ts` starts the outbox relay and the engine after `listen`.

### Patch Changes

- Updated dependencies [[`f9faa8f`](https://github.com/mdwt/headless-lms/commit/f9faa8fb287da9c3c8d8f50194155430d63e8516)]:
  - @headless-lms/core@0.4.0
  - @headless-lms/adapter-db@0.4.0

## 0.3.0

### Minor Changes

- Communities with spaces, posts, chats, moderation and member profiles; an MCP server with OAuth sign-in, connected apps and scoped API keys; access-checked proxy URLs for every file; per-person notification preferences; one API error envelope and request limits; security hardening across automations, auth and webhooks. Breaking: an organization no longer edits a person's name or email.

### Patch Changes

- Updated dependencies []:
  - @headless-lms/core@0.3.0
  - @headless-lms/adapter-db@0.3.0

## 0.2.0

### Minor Changes

- [`0ac4296`](https://github.com/mdwt/headless-lms/commit/0ac429661b55b308d60572445927036d398b522f) Thanks [@mdwt](https://github.com/mdwt)! - Bundles, webhook automations, course and student analytics, admin forgot-password, human-friendly automation trigger labels and self-signup externalId linking, plus API spec and content settings fixes.

### Patch Changes

- Updated dependencies [[`0ac4296`](https://github.com/mdwt/headless-lms/commit/0ac429661b55b308d60572445927036d398b522f)]:
  - @headless-lms/core@0.2.0
  - @headless-lms/adapter-db@0.2.0

## 0.1.0

### Minor Changes

- 0f137b9: Initial public release

### Patch Changes

- Updated dependencies [0f137b9]
  - @headless-lms/core@0.1.0
  - @headless-lms/adapter-db@0.1.0
