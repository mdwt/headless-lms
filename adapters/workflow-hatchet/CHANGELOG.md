# @headless-lms/adapter-workflow-hatchet

## 0.2.2

### Patch Changes

- [#12](https://github.com/mdwt/headless-lms/pull/12) [`09803d1`](https://github.com/mdwt/headless-lms/commit/09803d113718799a421c6b0c4f5040cf5e5efdd1) Thanks [@mdwt](https://github.com/mdwt)! - The notification process runs apart from org automations. It has its own event bus subscriber, so a notification failure no longer fails the automations handler, and notifications no longer wait for automations to be dispatched. Notification deliveries have their own executor: `AutomationExecutor` no longer has `runDelivery`; an `AutomationEngine` takes a `DeliveryExecutor` through `registerDeliveries`, and `NotificationDelivery` implements it (`run` is now `runDelivery`). `AutomationsServiceImpl` no longer takes `delivery` or `processor`. `InMemoryEventBus` runs every handler even when one throws, then rejects with that error, or an `AggregateError` when several fail, so the outbox redelivers the event.

- Updated dependencies [[`09803d1`](https://github.com/mdwt/headless-lms/commit/09803d113718799a421c6b0c4f5040cf5e5efdd1)]:
  - @headless-lms/core@0.7.0
  - @headless-lms/adapter-defaults@0.5.2

## 0.2.1

### Patch Changes

- Updated dependencies [[`5906dfa`](https://github.com/mdwt/headless-lms/commit/5906dfa2c2ff2f05a913f0e73ec5911af37b06c7), [`0f1c31c`](https://github.com/mdwt/headless-lms/commit/0f1c31c68cfa57059446b3ef5b7665f54d8f4f98), [`6924b0d`](https://github.com/mdwt/headless-lms/commit/6924b0d941ba149e3c7a8ee250e9e487ef8edf1e)]:
  - @headless-lms/core@0.6.0
  - @headless-lms/adapter-defaults@0.5.1

## 0.2.0

### Minor Changes

- [`f6096c4`](https://github.com/mdwt/headless-lms/commit/f6096c4922e176321639c265a8fb4f4d173dd2dc) Thanks [@mdwt](https://github.com/mdwt)! - These packages are released again, built against the current `@headless-lms/core`.

  - `@headless-lms/editor`: a config stores the asset id of a media node, never its URL. `EditorProps` takes `assetUrls` (the URLs the host's API returned, keyed by asset id) and optional `slots`; `Renderer` takes `assetUrls`; an editor declares `assetIds(config)`. `refreshUrl` is removed from the playback callbacks.
  - `@headless-lms/adapter-email-templates`: templates for events, reactions, mentions, course activities, the post digest, role assignment (replacing `youAreNowAModerator`), forgot password and access granted through a bundle.
  - `@headless-lms/adapter-workflow-hatchet`: each notification delivery runs as an engine task; deliveries and scheduled jobs retry with exponential backoff; one pending run per job key; imports come from the SDK's v1 and rest entry points; Hatchet's log lines go through the API's logger; the worker no longer exits the process before the server closes.
  - `@headless-lms/adapter-storage-s3`: `publish` and `publicUrl` serve public, immutable copies of images under `public/`, from `publicBaseUrl`.
  - `@headless-lms/adapter-email-resend`, `@headless-lms/adapter-email-ses`: a permanent refusal (a 4xx other than 408 and 429) throws `EmailRejectedError`, so it is not retried.

### Patch Changes

- Updated dependencies [[`b1e591a`](https://github.com/mdwt/headless-lms/commit/b1e591aec98dd633713f55ee99f424853ea3bd41), [`28b6239`](https://github.com/mdwt/headless-lms/commit/28b6239a2995088e33f877598e4fa116e54a49d3), [`d902c10`](https://github.com/mdwt/headless-lms/commit/d902c1070ca1603a35ef0b525ba0c7899034abec), [`4f7fde0`](https://github.com/mdwt/headless-lms/commit/4f7fde0636b5829c477f194334b90f2299576905), [`5364095`](https://github.com/mdwt/headless-lms/commit/536409507d9d4956027c323fca8fdc5d60f19276), [`2a80581`](https://github.com/mdwt/headless-lms/commit/2a805817f266f5fd61b949f842622941b6262927), [`86a39a0`](https://github.com/mdwt/headless-lms/commit/86a39a04c887fddd787cb700bd40c2f9368907d6), [`96a06eb`](https://github.com/mdwt/headless-lms/commit/96a06eb1fd501da91f2324bedbb57ed3d3c4e866)]:
  - @headless-lms/core@0.5.0
  - @headless-lms/adapter-defaults@0.5.0

## 0.1.0

### Minor Changes

- 0f137b9: Initial public release

### Patch Changes

- Updated dependencies [0f137b9]
  - @headless-lms/core@0.1.0
