---
"@headless-lms/editor": minor
"@headless-lms/adapter-email-templates": minor
"@headless-lms/adapter-workflow-hatchet": minor
"@headless-lms/adapter-storage-s3": minor
"@headless-lms/adapter-email-resend": patch
"@headless-lms/adapter-email-ses": patch
"@headless-lms/plugin-slack": patch
---

These packages are released again, built against the current `@headless-lms/core`.

- `@headless-lms/editor`: a config stores the asset id of a media node, never its URL. `EditorProps` takes `assetUrls` (the URLs the host's API returned, keyed by asset id) and optional `slots`; `Renderer` takes `assetUrls`; an editor declares `assetIds(config)`. `refreshUrl` is removed from the playback callbacks.
- `@headless-lms/adapter-email-templates`: templates for events, reactions, mentions, course activities, the post digest, role assignment (replacing `youAreNowAModerator`), forgot password and access granted through a bundle.
- `@headless-lms/adapter-workflow-hatchet`: each notification delivery runs as an engine task; deliveries and scheduled jobs retry with exponential backoff; one pending run per job key; imports come from the SDK's v1 and rest entry points; Hatchet's log lines go through the API's logger; the worker no longer exits the process before the server closes.
- `@headless-lms/adapter-storage-s3`: `publish` and `publicUrl` serve public, immutable copies of images under `public/`, from `publicBaseUrl`.
- `@headless-lms/adapter-email-resend`, `@headless-lms/adapter-email-ses`: a permanent refusal (a 4xx other than 408 and 429) throws `EmailRejectedError`, so it is not retried.
