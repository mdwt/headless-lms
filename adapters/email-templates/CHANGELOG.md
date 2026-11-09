# @headless-lms/adapter-email-templates

## 0.2.0

### Minor Changes

- [`4f7fde0`](https://github.com/mdwt/headless-lms/commit/4f7fde0636b5829c477f194334b90f2299576905) Thanks [@mdwt](https://github.com/mdwt)! - Events: a content type with a time, a time zone, a location (a venue with its address, a meeting link, or both), a recording, attached files and settings (`public` or `private`, a capacity, notifications on or off, and replay). Staff create, edit, publish, cancel and delete events through `/api/events` and the MCP event tools; members list, open and register through `/api/member/events`, and get a calendar file per event. Going to an event is a grant: registering, staff adding someone, an API client and the automations Grant access action all call `entitlements.grant`, which holds every event rule, takes a capacity lock and counts the attendees under it. Attendees are notified when they are added or removed, when the event moves or changes place, when it is canceled, and a day and an hour before it starts. The admin overview counts upcoming events, and each event has attendee and analytics reads.

  `entitlements.revoke` takes a person and a content id. `entitlements.ensureGrant` is removed: automations grant through `grant`, so granting again makes a revoked or expired grant active with the new expiry. The service sets a grant's `source` from the caller (`self`, `automation` or `manual`); `GrantEntitlementInput` no longer takes one.

  Domain events carry `metadata.actorId`, renamed from `actorOrgUserId`, and so do the request context and notifications (`actorId`, column `actor_id`).

  `ContainerConfig.databasePool` sizes the API's Postgres pool: `max`, `idleTimeoutMillis` and `connectionTimeoutMillis` (`DATABASE_POOL_MAX`, `DATABASE_POOL_IDLE_TIMEOUT_MS` and `DATABASE_POOL_CONNECTION_TIMEOUT_MS` in the API). Unset values keep pg's defaults.

  Breaking: `actorOrgUserId` is `actorId` in domain event metadata and notifications; `EntitlementsService.ensureGrant` and `EntitlementsRepository.insertIfAbsent` and `setExpiresAt` are removed; the entitlements `SpaceReader` port is `ContentReader`.

- [`f6096c4`](https://github.com/mdwt/headless-lms/commit/f6096c4922e176321639c265a8fb4f4d173dd2dc) Thanks [@mdwt](https://github.com/mdwt)! - These packages are released again, built against the current `@headless-lms/core`.

  - `@headless-lms/editor`: a config stores the asset id of a media node, never its URL. `EditorProps` takes `assetUrls` (the URLs the host's API returned, keyed by asset id) and optional `slots`; `Renderer` takes `assetUrls`; an editor declares `assetIds(config)`. `refreshUrl` is removed from the playback callbacks.
  - `@headless-lms/adapter-email-templates`: templates for events, reactions, mentions, course activities, the post digest, role assignment (replacing `youAreNowAModerator`), forgot password and access granted through a bundle.
  - `@headless-lms/adapter-workflow-hatchet`: each notification delivery runs as an engine task; deliveries and scheduled jobs retry with exponential backoff; one pending run per job key; imports come from the SDK's v1 and rest entry points; Hatchet's log lines go through the API's logger; the worker no longer exits the process before the server closes.
  - `@headless-lms/adapter-storage-s3`: `publish` and `publicUrl` serve public, immutable copies of images under `public/`, from `publicBaseUrl`.
  - `@headless-lms/adapter-email-resend`, `@headless-lms/adapter-email-ses`: a permanent refusal (a 4xx other than 408 and 429) throws `EmailRejectedError`, so it is not retried.

### Patch Changes

- Updated dependencies [[`b1e591a`](https://github.com/mdwt/headless-lms/commit/b1e591aec98dd633713f55ee99f424853ea3bd41), [`28b6239`](https://github.com/mdwt/headless-lms/commit/28b6239a2995088e33f877598e4fa116e54a49d3), [`d902c10`](https://github.com/mdwt/headless-lms/commit/d902c1070ca1603a35ef0b525ba0c7899034abec), [`4f7fde0`](https://github.com/mdwt/headless-lms/commit/4f7fde0636b5829c477f194334b90f2299576905), [`5364095`](https://github.com/mdwt/headless-lms/commit/536409507d9d4956027c323fca8fdc5d60f19276), [`2a80581`](https://github.com/mdwt/headless-lms/commit/2a805817f266f5fd61b949f842622941b6262927), [`86a39a0`](https://github.com/mdwt/headless-lms/commit/86a39a04c887fddd787cb700bd40c2f9368907d6), [`96a06eb`](https://github.com/mdwt/headless-lms/commit/96a06eb1fd501da91f2324bedbb57ed3d3c4e866)]:
  - @headless-lms/core@0.5.0

## 0.1.0

### Minor Changes

- 0f137b9: Initial public release

### Patch Changes

- Updated dependencies [0f137b9]
  - @headless-lms/core@0.1.0
