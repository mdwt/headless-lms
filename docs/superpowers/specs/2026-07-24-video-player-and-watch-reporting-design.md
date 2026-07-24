# Video player & watch reporting — design

The student portal plays video through a real player and reports watch facts
through the existing progress report envelope. The player plays; the server
records. Completion semantics do not change — the manual button stays, and the
watch data lands in the record's per-asset state map where a future
watch-percent evaluator will find it.

## Today

Videos are Plate content nodes rendered **on the server**: the static renderer
turns a video node into a bare `<video controls src={presignedUrl}>`
(`plugins/content-plate/src/ui/media-video-node-static.tsx`). No client
component wraps it, so nothing observes playback and nothing reports.
`resolve-asset-urls.ts` already re-presigns each node's `assetId` at page render
via the Learn download-url broker.

## Player

**Vidstack** (`@vidstack/react`), the same player as webinar-onboard's player
app — minus hls.js: LMS video is progressive MP4 behind presigned MinIO URLs,
so the plain `src` path suffices. The dependency lives in
`plugins/content-plate` (the package that owns the video node's rendering).

## Architecture: client island + host-provided context

The editor contract already blesses this: the RSC-safe `Renderer` "may render
'use client' islands internally; props passed into islands must be
serializable".

### 1. The island (`plugins/content-plate`)

`MediaVideoElementStatic` renders a `'use client'` island in place of the bare
`<video>`, keeping the figure/caption/width chrome. Props (all serializable):
`assetId`, `url`, `caption`, `width`, `align`.

The island:

- renders the Vidstack `MediaPlayer` with the default video layout;
- on mount asks the context for a resume point (`startPosition(assetId)`) and
  seeks there before playback;
- forwards player callbacks as media facts to the context: `play`, `pause`,
  `timeupdate`, `seeked`, `ended` — each `{ assetId, kind, seconds, duration }`;
- on a media error suggesting an expired presign, asks the context for a fresh
  URL (`refreshUrl(assetId)`) and reloads the source at the current position
  (one retry, then the player's error UI). The editor never talks to the LMS
  API — the host supplies the refresh the same way it supplies `onEvent`.

No context provider above it (admin preview, non-tracking host) → default
context `{}`: the video plays, nothing is reported.

### 2. The context & `MediaProvider` (`plugins/content-plate`, contract type in `packages/editor-contract`)

A dumb pipe — no reporter, no timers, no LMS vocabulary:

```tsx
export interface MediaTrackingEvent {
  assetId: string;
  kind: "play" | "pause" | "timeupdate" | "seeked" | "ended";
  seconds: number;
  duration: number | null;
}

interface MediaTracking {
  onEvent?: (e: MediaTrackingEvent) => void;
  startPosition?: (assetId: string) => number | undefined;
  /** Fresh playback URL when the embedded one has expired. */
  refreshUrl?: (assetId: string) => Promise<string | null>;
}
```

`MediaProvider` ships from a dedicated `@headless-lms/content-plate/media`
entry (`'use client'`), typed by `EditorMediaModule` in the contract, and the
app reaches it through its own swap-point file `editor-media.config.ts` — a
sibling of `editor.config.ts`. A field on `EditorModule` would force client
components to import the whole module (and thus bundle the editor) to get a
20-line provider; a separate entry keeps player routes editor-free while
preserving the swap-point rule and contract typing.

### 3. Translation to reports (`apps/student`)

`course-player.tsx` (already `'use client'`) wraps the rendered tree:

```tsx
<editorModule.MediaProvider
  onEvent={onMediaEvent}
  startPosition={startPosition}
  refreshUrl={(assetId) => mintDownloadUrl(assetId)} // Learn.requestLearnAssetDownload
>
  {renderedContent}
</editorModule.MediaProvider>
```

A new app-side module `lib/video-tracking.ts` owns the reporting policy —
testable pure logic plus a thin sender over the existing `progressReporter`:

- **Report item shape** (the progress domain stores it opaquely per asset):
  `{ asset: assetId, seconds, furthest, duration }` — `seconds` is the resume
  point (current time), `furthest` the monotonic high-water mark this client
  has observed, `duration` as the player measured it.
- **Cadence**: while playing, a heartbeat every 10 s; an immediate send on
  `pause`, `seeked`, and `ended`; identical consecutive payloads are not
  re-sent. `ended` reports `seconds = duration`.
- **Flush on leave**: pending state is sent on `pagehide`/`visibilitychange`
  (hidden) with `fetch(..., { keepalive: true })` against the same endpoint and
  credentials the SDK uses — a normal SDK call may be cancelled by navigation.
- **Resume**: `startPosition(assetId)` reads the hydrated position map (below)
  for the current lesson; local reports made this session take precedence over
  the hydrated value.

Reporting never throws and never blocks playback — same posture as
`progress-reporter.ts`.

## Read side: resume needs positions

`CourseProgress` today returns only statuses. It gains a sibling map, leaving
the existing `activities` shape untouched:

```ts
positions: z.record(z.string(), z.unknown()), // activity id → per-asset state map
```

- `reporting/learn` `courseProgress` includes each activity record's `position`
  (already fetched — no new query).
- `apps/student` server page passes `positions` into the player alongside
  `initialCompletion`; the app reads `positions[lessonId]?.[assetId]?.seconds`.
- The position map is the student's own reported data; no additional exposure.

`pnpm gen:sdk` regenerates the client for the contract change; the SDK stays
purely generated.

## Not touched

- `core/progress` — the report envelope, state-map merge, and rule seam
  already accept exactly these items. No server write-path changes.
- Completion — `manual` remains the only rule; the button remains the only way
  an activity completes.
- The admin editor's interactive video node (`media-video-node.tsx`) — editing
  is unchanged.

## Testing

- `plugins/content-plate` — contract shape: module exports `MediaProvider`
  satisfying the type (typecheck); island renders without a provider (default
  context) — existing render tests extended.
- `apps/student` `lib/video-tracking` — unit tests on the pure policy:
  heartbeat cadence, dedupe of unchanged payloads, furthest monotonicity,
  immediate send on pause/seek/ended, flush composition.
- `reporting/learn` — `courseProgress` includes `positions` keyed by activity,
  absent for unstarted activities.
- Route/API — schema validation via the regenerated contract; no new route
  harness (matches the progress work's testing posture).
