# @headless-lms/adapter-defaults

## 0.5.5

### Patch Changes

- Updated dependencies [[`b57078e`](https://github.com/mdwt/headless-lms/commit/b57078e0299aeee8f796f9170f6b9155720debb5), [`8a4f692`](https://github.com/mdwt/headless-lms/commit/8a4f69250aa9535954e5b724985169826b7b137e)]:
  - @headless-lms/core@0.10.0
  - @headless-lms/adapter-db@0.6.4

## 0.5.4

### Patch Changes

- Updated dependencies [[`e6ea327`](https://github.com/mdwt/headless-lms/commit/e6ea327d00ed2d84411bbc882dbf51f3fed33f68), [`41766f7`](https://github.com/mdwt/headless-lms/commit/41766f7e66c9614857855e832d05082d7b1bdea7), [`932f883`](https://github.com/mdwt/headless-lms/commit/932f883c8a287e349083d2849a5ccc20a007e141), [`c9a3c48`](https://github.com/mdwt/headless-lms/commit/c9a3c48a547aad25b57d5602da63fb2c35ba3d6a), [`eb3ab88`](https://github.com/mdwt/headless-lms/commit/eb3ab88e7e294d035640c5a7cd55edd3bbfeb24d), [`9f13ac2`](https://github.com/mdwt/headless-lms/commit/9f13ac23d37a814749be2599dd703f4b3260003e)]:
  - @headless-lms/core@0.9.0
  - @headless-lms/adapter-db@0.6.3

## 0.5.3

### Patch Changes

- Updated dependencies [[`ca0f1da`](https://github.com/mdwt/headless-lms/commit/ca0f1da6ce3f92f2cfd0ec02d63df006f8dd0ac8)]:
  - @headless-lms/core@0.8.0
  - @headless-lms/adapter-db@0.6.2

## 0.5.2

### Patch Changes

- [#12](https://github.com/mdwt/headless-lms/pull/12) [`09803d1`](https://github.com/mdwt/headless-lms/commit/09803d113718799a421c6b0c4f5040cf5e5efdd1) Thanks [@mdwt](https://github.com/mdwt)! - The notification process runs apart from org automations. It has its own event bus subscriber, so a notification failure no longer fails the automations handler, and notifications no longer wait for automations to be dispatched. Notification deliveries have their own executor: `AutomationExecutor` no longer has `runDelivery`; an `AutomationEngine` takes a `DeliveryExecutor` through `registerDeliveries`, and `NotificationDelivery` implements it (`run` is now `runDelivery`). `AutomationsServiceImpl` no longer takes `delivery` or `processor`. `InMemoryEventBus` runs every handler even when one throws, then rejects with that error, or an `AggregateError` when several fail, so the outbox redelivers the event.

- Updated dependencies [[`09803d1`](https://github.com/mdwt/headless-lms/commit/09803d113718799a421c6b0c4f5040cf5e5efdd1)]:
  - @headless-lms/core@0.7.0
  - @headless-lms/adapter-db@0.6.1

## 0.5.1

### Patch Changes

- Updated dependencies [[`5906dfa`](https://github.com/mdwt/headless-lms/commit/5906dfa2c2ff2f05a913f0e73ec5911af37b06c7), [`0f1c31c`](https://github.com/mdwt/headless-lms/commit/0f1c31c68cfa57059446b3ef5b7665f54d8f4f98), [`6924b0d`](https://github.com/mdwt/headless-lms/commit/6924b0d941ba149e3c7a8ee250e9e487ef8edf1e)]:
  - @headless-lms/core@0.6.0
  - @headless-lms/adapter-db@0.6.0

## 0.5.0

### Minor Changes

- [`96a06eb`](https://github.com/mdwt/headless-lms/commit/96a06eb1fd501da91f2324bedbb57ed3d3c4e866) Thanks [@mdwt](https://github.com/mdwt)! - Rich post bodies: the server reads a post's body through a `BodyParser` port, which returns its plain text, its mentions and the files it shows. The default `PlainBodyParser` (`@headless-lms/adapter-defaults/body`) reads the body as plain text; the container takes another through `adapters.bodyParser`. Notification and email excerpts use the parsed text.

  A body can show any file its author uploaded: a member upload takes any content type, and its kind (image, video, audio or document) follows the type. `PostView.assets` describes each file the body shows (its URL, kind, filename and size), and `GET /api/member/posts/:postId/assets/:assetId` (`getPostAsset`) serves it to whoever can read the post; a file a browser cannot show inline downloads under its filename. A body holds at most 20 files. A post no longer needs a topic in a space that defines topics. A refused upload names the size limit.

  Breaking: `ServerConfig` requires `memberFileMaxBytes`, the largest member upload that is not an image (`MEMBER_FILE_MAX_BYTES` in the scaffolded config, 100 MB by default).

### Patch Changes

- [`d902c10`](https://github.com/mdwt/headless-lms/commit/d902c1070ca1603a35ef0b525ba0c7899034abec) Thanks [@mdwt](https://github.com/mdwt)! - `describeError` (in `@headless-lms/core/shared/logger`) turns an error into a log line that names the cause: each distinct inner error of an `AggregateError`, and the error code when the message leaves it out. A refused Postgres connect is an `AggregateError` with an empty message, so `outbox poll failed` logged only "AggregateError" and the PubSub adapter's connect and listener errors logged an empty string. The outbox relay, the PubSub adapter and the live chat forwarder and hub use it for their errors, and the relay for the stored `last_error`; `live publish failed` had logged an empty error while PubSub was down.

- Updated dependencies [[`b1e591a`](https://github.com/mdwt/headless-lms/commit/b1e591aec98dd633713f55ee99f424853ea3bd41), [`28b6239`](https://github.com/mdwt/headless-lms/commit/28b6239a2995088e33f877598e4fa116e54a49d3), [`2e99dd4`](https://github.com/mdwt/headless-lms/commit/2e99dd427b59ee7aed21572ebfc12b8039323998), [`d902c10`](https://github.com/mdwt/headless-lms/commit/d902c1070ca1603a35ef0b525ba0c7899034abec), [`4f7fde0`](https://github.com/mdwt/headless-lms/commit/4f7fde0636b5829c477f194334b90f2299576905), [`5364095`](https://github.com/mdwt/headless-lms/commit/536409507d9d4956027c323fca8fdc5d60f19276), [`2a80581`](https://github.com/mdwt/headless-lms/commit/2a805817f266f5fd61b949f842622941b6262927), [`521a1c1`](https://github.com/mdwt/headless-lms/commit/521a1c11f2785dca67cb5c5b55a905ce4d3efcde), [`86a39a0`](https://github.com/mdwt/headless-lms/commit/86a39a04c887fddd787cb700bd40c2f9368907d6), [`96a06eb`](https://github.com/mdwt/headless-lms/commit/96a06eb1fd501da91f2324bedbb57ed3d3c4e866)]:
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
