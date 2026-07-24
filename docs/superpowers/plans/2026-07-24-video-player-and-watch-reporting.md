# Video Player & Watch Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The student portal plays video through Vidstack and reports watch facts (position, furthest, duration) through the existing progress report envelope, with resume-from-last-position.

**Architecture:** The Plate static renderer's video node becomes a `'use client'` Vidstack island inside `plugins/content-plate`. Media facts flow out (and resume positions / URL refreshes flow in) through a three-callback React context whose provider ships from a new `@headless-lms/content-plate/media` subpath entry, typed by `EditorMediaModule` in `@headless-lms/editor-contract`, and reached by the app only through a new swap-point file `apps/student/src/editor-media.config.ts` (a sibling of `editor.config.ts`; a separate entry so player routes don't bundle the whole editor). The student app owns all reporting policy in `apps/student/src/lib/video-tracking.ts` feeding the existing `progressReporter`. Read side: `CourseProgress` gains a `positions` map so the player can resume.

**Tech Stack:** `@vidstack/react` ^1.12.13 (no hls.js — progressive MP4 presigned URLs), React 19 / Next 15 app router, zod 4 contract, vitest.

## Global Constraints

- Never add `Co-Authored-By`, "Generated with Claude Code", or any AI-attribution trailer to commits (AGENTS.md).
- `packages/sdk` is generated only — the sole allowed change there is `pnpm gen:sdk` output, which is committed.
- `packages/editor-contract` stays types-only: no runtime code, no runtime deps.
- Apps import editor code only via swap-point config files (`editor.config.ts`, and the new `editor-media.config.ts`), never from an editor package directly.
- `content-plate` never imports LMS packages other than `@headless-lms/editor-contract`.
- Server write path (`core/progress`) and completion semantics are untouched.
- Comments: only where necessary, short (user preference).
- `pnpm gen:sdk` boots the real app — Postgres must be up (`pnpm dev` stack env).

---

### Task 1: Media tracking types in the editor contract

**Files:**
- Modify: `packages/editor-contract/src/index.ts` (append at end)
- Modify: `docs/superpowers/specs/2026-07-24-video-player-and-watch-reporting-design.md` (contract section — replace the `EditorModule` optional-field paragraph with the `EditorMediaModule` design)

**Interfaces:**
- Consumes: nothing.
- Produces: `MediaTrackingEvent`, `MediaTracking`, `EditorMediaModule` — imported by Tasks 2, 3, 5, 6.

- [ ] **Step 1: Add the types**

Append to `packages/editor-contract/src/index.ts`:

```ts
/** One media playback fact emitted by an editor's rendered media node. */
export interface MediaTrackingEvent {
  assetId: string;
  kind: "play" | "pause" | "timeupdate" | "seeked" | "ended";
  /** Current playback position, seconds. */
  seconds: number;
  /** Media duration as the player measured it; null until known. */
  duration: number | null;
}

/** Host-provided callbacks for media playback: facts out, resume/refresh in. */
export interface MediaTracking {
  onEvent?: (event: MediaTrackingEvent) => void;
  /** Resume point for an asset, seconds. */
  startPosition?: (assetId: string) => number | undefined;
  /** Fresh playback URL when the embedded presign has expired. */
  refreshUrl?: (assetId: string) => Promise<string | null>;
}

/**
 * Client-side media companion to EditorModule. Shipped as its own entry (and
 * its own swap-point config file in the host app) so routes that only play
 * content don't bundle the editor.
 */
export interface EditorMediaModule {
  /** Client component putting MediaTracking callbacks into context for media islands. */
  MediaProvider: ComponentType<MediaTracking & { children: ReactNode }>;
}
```

`ComponentType` is already imported at the top of the file; add `ReactNode` to that import:

```ts
import type { ComponentType, ReactNode } from "react";
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @headless-lms/editor-contract typecheck`
Expected: clean exit.

- [ ] **Step 3: Update the spec's contract section**

In `docs/superpowers/specs/2026-07-24-video-player-and-watch-reporting-design.md`, section "2. The context & `MediaProvider`": replace the sentence declaring the optional `EditorModule` field and the "Why a contract field" paragraph with:

```markdown
`MediaProvider` ships from a dedicated `@headless-lms/content-plate/media`
entry (`'use client'`), typed by `EditorMediaModule` in the contract, and the
app reaches it through its own swap-point file `editor-media.config.ts` — a
sibling of `editor.config.ts`. A field on `EditorModule` would force client
components to import the whole module (and thus bundle the editor) to get a
20-line provider; a separate entry keeps player routes editor-free while
preserving the swap-point rule and contract typing.
```

- [ ] **Step 4: Commit**

```bash
git add packages/editor-contract/src/index.ts docs/superpowers/specs/2026-07-24-video-player-and-watch-reporting-design.md
git commit -m "feat(editor-contract): media tracking types and EditorMediaModule"
```

---

### Task 2: `content-plate/media` — context and provider

**Files:**
- Create: `plugins/content-plate/src/media/index.tsx`
- Modify: `plugins/content-plate/package.json` (exports map)
- Test: `plugins/content-plate/src/media/media.test.tsx`

**Interfaces:**
- Consumes: `MediaTracking`, `EditorMediaModule` from `@headless-lms/editor-contract` (Task 1).
- Produces: `MediaProvider` (satisfies `EditorMediaModule["MediaProvider"]`) and `useMediaTracking(): MediaTracking` — consumed by Task 3 (island, via relative import) and Task 6 (app, via the `./media` subpath).

- [ ] **Step 1: Write the failing test**

Create `plugins/content-plate/src/media/media.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import type { EditorMediaModule } from '@headless-lms/editor-contract';

import { MediaProvider, useMediaTracking } from './index';

describe('media entry', () => {
  it('satisfies the EditorMediaModule contract', () => {
    const module: EditorMediaModule = { MediaProvider };
    expect(typeof module.MediaProvider).toBe('function');
    expect(typeof useMediaTracking).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @headless-lms/content-plate test -- media`
Expected: FAIL — cannot resolve `./index`.

- [ ] **Step 3: Implement the provider**

Create `plugins/content-plate/src/media/index.tsx`:

```tsx
'use client';
// Media tracking entry — a dumb pipe between the host and media islands.
// No reporter, no timers, no LMS vocabulary; the host owns all policy.
import * as React from 'react';
import type { MediaTracking } from '@headless-lms/editor-contract';

const MediaTrackingContext = React.createContext<MediaTracking>({});

export function MediaProvider({
  onEvent,
  startPosition,
  refreshUrl,
  children,
}: MediaTracking & { children: React.ReactNode }) {
  const value = React.useMemo(
    () => ({ onEvent, startPosition, refreshUrl }),
    [onEvent, startPosition, refreshUrl],
  );
  return <MediaTrackingContext.Provider value={value}>{children}</MediaTrackingContext.Provider>;
}

/** Default {} — content rendered outside a provider plays and reports nothing. */
export function useMediaTracking(): MediaTracking {
  return React.useContext(MediaTrackingContext);
}

export type { MediaTracking, MediaTrackingEvent } from '@headless-lms/editor-contract';
```

Add the subpath to `plugins/content-plate/package.json` exports:

```json
"exports": {
  ".": "./src/index.ts",
  "./media": "./src/media/index.tsx"
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @headless-lms/content-plate test -- media`
Expected: PASS.

Run: `pnpm --filter @headless-lms/content-plate typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add plugins/content-plate/src/media plugins/content-plate/package.json
git commit -m "feat(content-plate): media tracking context and provider entry"
```

---

### Task 3: Vidstack island replaces the static `<video>`

**Files:**
- Modify: `plugins/content-plate/package.json` (add dependency `"@vidstack/react": "^1.12.13"`)
- Create: `plugins/content-plate/src/ui/media-video-player.tsx`
- Modify: `plugins/content-plate/src/ui/media-video-node-static.tsx`

**Interfaces:**
- Consumes: `useMediaTracking` from `../media` (Task 2).
- Produces: `MediaVideoPlayer({ assetId?: string; url: string })` — rendered only by the static video node; not exported from any entry.

- [ ] **Step 1: Add the dependency**

In `plugins/content-plate/package.json` dependencies add (alphabetical position, after `"@udecode/cn"` line is fine but keep the list sorted — it belongs after `@platejs/toggle`):

```json
"@vidstack/react": "^1.12.13",
```

Run: `pnpm install`
Expected: lockfile updated, no peer warnings for react 19.

- [ ] **Step 2: Create the island**

Create `plugins/content-plate/src/ui/media-video-player.tsx`:

```tsx
'use client';
// Vidstack island for the static video node. Emits media facts to the host's
// MediaTracking context; plays plain progressive sources (no hls.js).
import * as React from 'react';
import {
  MediaPlayer,
  MediaProvider as VidstackMediaProvider,
  type MediaPlayerInstance,
  type MediaTimeUpdateEventDetail,
} from '@vidstack/react';
import {
  DefaultVideoLayout,
  defaultLayoutIcons,
} from '@vidstack/react/player/layouts/default';
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';

import { useMediaTracking, type MediaTrackingEvent } from '../media';

export function MediaVideoPlayer({ assetId, url }: { assetId?: string; url: string }) {
  const { onEvent, startPosition, refreshUrl } = useMediaTracking();
  const playerRef = React.useRef<MediaPlayerInstance>(null);
  const [src, setSrc] = React.useState(url);
  const resumedRef = React.useRef(false);
  const retriedRef = React.useRef(false);
  const resumeAtRef = React.useRef<number | null>(null);

  const emit = (kind: MediaTrackingEvent['kind'], seconds: number) => {
    if (!assetId || !onEvent) return;
    const raw = playerRef.current?.duration;
    onEvent({
      assetId,
      kind,
      seconds,
      duration: typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : null,
    });
  };

  return (
    <MediaPlayer
      ref={playerRef}
      src={{ src, type: 'video/mp4' }}
      playsInline
      onCanPlay={() => {
        // After an expiry reload, resume where playback stopped; on first
        // load, at the host's stored position.
        const target =
          resumeAtRef.current ??
          (!resumedRef.current && assetId ? (startPosition?.(assetId) ?? null) : null);
        resumedRef.current = true;
        resumeAtRef.current = null;
        if (target && playerRef.current) playerRef.current.currentTime = target;
      }}
      onPlay={() => emit('play', playerRef.current?.currentTime ?? 0)}
      onPause={() => emit('pause', playerRef.current?.currentTime ?? 0)}
      onSeeked={() => emit('seeked', playerRef.current?.currentTime ?? 0)}
      onEnded={() => emit('ended', playerRef.current?.duration ?? 0)}
      onTimeUpdate={(detail: MediaTimeUpdateEventDetail) => emit('timeupdate', detail.currentTime)}
      onError={() => {
        if (retriedRef.current || !assetId || !refreshUrl) return;
        retriedRef.current = true;
        resumeAtRef.current = playerRef.current?.currentTime ?? null;
        void refreshUrl(assetId).then((fresh) => {
          if (fresh) setSrc(fresh);
        });
      }}
    >
      <VidstackMediaProvider />
      <DefaultVideoLayout icons={defaultLayoutIcons} />
    </MediaPlayer>
  );
}
```

- [ ] **Step 3: Render the island from the static node**

Replace the `<video …/>` element in `plugins/content-plate/src/ui/media-video-node-static.tsx`. The full new file:

```tsx
import {
  NodeApi,
  type TCaptionElement,
  type TResizableProps,
  type TVideoElement,
} from 'platejs';
import { SlateElement, type SlateElementProps } from 'platejs/static';
import * as React from 'react';

import { MediaVideoPlayer } from './media-video-player';

export function MediaVideoElementStatic(
  props: SlateElementProps<TVideoElement & TCaptionElement & TResizableProps>
) {
  const { align = 'center', caption, url, width } = props.element;
  // Stable asset reference persisted by the upload flow; absent on external URLs.
  const assetId = (props.element as { assetId?: unknown }).assetId;

  return (
    <SlateElement className="py-2.5" {...props}>
      <div style={{ textAlign: align }}>
        <figure
          className="group relative m-0 inline-block cursor-default"
          style={{ width }}
        >
          <MediaVideoPlayer
            assetId={typeof assetId === 'string' ? assetId : undefined}
            url={url}
          />
          {caption && <figcaption>{NodeApi.string(caption[0])}</figcaption>}
        </figure>
      </div>
      {props.children}
    </SlateElement>
  );
}
```

(The `cn` import and its classes move into the player's own layout; drop the now-unused import.)

- [ ] **Step 4: Verify**

Run: `pnpm --filter @headless-lms/content-plate typecheck && pnpm --filter @headless-lms/content-plate test`
Expected: clean, existing tests pass.

Run: `pnpm --filter student typecheck`
Expected: clean (island crosses the RSC boundary with serializable props only).

- [ ] **Step 5: Commit**

```bash
git add plugins/content-plate/package.json pnpm-lock.yaml plugins/content-plate/src/ui/media-video-player.tsx plugins/content-plate/src/ui/media-video-node-static.tsx
git commit -m "feat(content-plate): vidstack player island for the static video node"
```

---

### Task 4: `CourseProgress.positions` — contract, reporting view, SDK

**Files:**
- Modify: `packages/api-contract/src/learn.ts` (CourseProgress schema)
- Modify: `packages/server/src/reporting/learn/model.ts`, `packages/server/src/reporting/learn/service.ts`
- Test: `packages/server/src/reporting/learn/service.test.ts`
- Regenerate: `packages/sdk/openapi.json`, `packages/sdk/src/generated/*`

**Interfaces:**
- Consumes: existing `LearnReportServiceImpl.courseProgress` and `ProgressRecord.position`.
- Produces: `CourseProgressView.positions: Record<string, unknown>` (activity id → per-asset state map) on the API response — consumed by Task 6.

- [ ] **Step 1: Write the failing test**

In `packages/server/src/reporting/learn/service.test.ts`, inside `describe('LearnReportServiceImpl.courseProgress')`, add (mirror the existing tests' fixture helpers — records are created through the same fake repo/service the neighboring tests use):

```ts
it('includes stored positions keyed by activity, omitting recordless activities', async () => {
  // Arrange exactly like the existing status-map test: student enrolled,
  // course with activities act_1 and act_2, a progress record for act_1
  // whose position is { vid_1: { seconds: 612, furthest: 700, duration: 1475 } },
  // no record for act_2.
  const view = await service.courseProgress(ORG, STUDENT, COURSE);
  expect(view?.positions).toEqual({
    act_1: { vid_1: { seconds: 612, furthest: 700, duration: 1475 } },
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/server/src/reporting/learn/service.test.ts`
Expected: FAIL — `positions` undefined.

- [ ] **Step 3: Implement**

`packages/server/src/reporting/learn/model.ts` — add to `CourseProgressView`:

```ts
/** Per-activity reported state (the record's position map); absent key = none reported. */
positions: Record<string, unknown>;
```

`packages/server/src/reporting/learn/service.ts` — in `courseProgress`, build alongside the status map (same loop):

```ts
const positions: CourseProgressView['positions'] = {};
for (const r of records) {
  if (r.targetType !== 'activity') {
    continue;
  }
  activities[r.targetId] = r.completedAt ? 'completed' : 'in-progress';
  if (r.completedAt) {
    done += 1;
  }
  if (r.position != null) {
    positions[r.targetId] = r.position;
  }
}
```

and include `positions` in the returned object.

`packages/api-contract/src/learn.ts` — add to the `CourseProgress` object:

```ts
/** Keyed by activity id: the per-asset reported state map (opaque). */
positions: z.record(z.string(), z.unknown()),
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run packages/server/src/reporting/learn/service.test.ts`
Expected: PASS (all, including prior tests — they now need `positions` in any exact-equality assertions; update those assertions to include `positions: {}` where applicable).

Run: `pnpm --filter @headless-lms/server typecheck`
Expected: only the pre-existing `EmailTemplatePayloads` error — no new errors.

- [ ] **Step 5: Regenerate the SDK**

Run: `pnpm gen:sdk` (Postgres must be running)
Expected: `packages/sdk/openapi.json` and `packages/sdk/src/generated/types.gen.ts` gain `positions` on the course-progress response.

- [ ] **Step 6: Commit**

```bash
git add packages/api-contract/src/learn.ts packages/server/src/reporting/learn packages/sdk
git commit -m "feat(learn): expose reported positions in course progress"
```

---

### Task 5: `video-tracking` policy module in the student app

**Files:**
- Modify: `apps/student/package.json` (devDependency `"vitest": "^2.1.8"`, script `"test": "vitest run"`)
- Create: `apps/student/src/lib/video-tracking.ts`
- Test: `apps/student/src/lib/video-tracking.test.ts`

**Interfaces:**
- Consumes: `MediaTrackingEvent` from `@headless-lms/editor-contract` (Task 1).
- Produces: `createVideoTracker(opts): VideoTracker` and `flushKeepalive(activityId, items)` — consumed by Task 6. Exact shapes below.

- [ ] **Step 1: Add vitest**

In `apps/student/package.json`: add `"test": "vitest run"` to scripts and `"vitest": "^2.1.8"` to devDependencies. Run `pnpm install`.

- [ ] **Step 2: Write the failing tests**

Create `apps/student/src/lib/video-tracking.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { MediaTrackingEvent } from "@headless-lms/editor-contract";

import { createVideoTracker, type VideoReportItem } from "./video-tracking";

function harness(startAt = 0) {
  let now = startAt;
  const sent: VideoReportItem[][] = [];
  const tracker = createVideoTracker({
    send: (items) => sent.push(items),
    now: () => now,
  });
  const ev = (kind: MediaTrackingEvent["kind"], seconds: number, duration: number | null = 100) =>
    tracker.handleEvent({ assetId: "vid_1", kind, seconds, duration });
  return { tracker, sent, ev, tick: (ms: number) => (now += ms) };
}

describe("createVideoTracker", () => {
  it("heartbeats at the cadence, not on every timeupdate", () => {
    const { sent, ev, tick } = harness();
    ev("play", 0);
    for (let s = 0; s <= 12; s++) {
      ev("timeupdate", s);
      tick(1000);
    }
    expect(sent.length).toBe(2); // t=0 first tick, t=10s heartbeat
    expect(sent[1]![0]).toMatchObject({ asset: "vid_1", seconds: 10, furthest: 10 });
  });

  it("sends immediately on pause and ended; ended clamps to duration", () => {
    const { sent, ev } = harness();
    ev("play", 0);
    ev("timeupdate", 1);
    ev("pause", 1.4);
    expect(sent.at(-1)![0]).toMatchObject({ seconds: 1.4 });
    ev("ended", 99.7, 100);
    expect(sent.at(-1)![0]).toMatchObject({ seconds: 100, furthest: 100, duration: 100 });
  });

  it("furthest is monotonic and ignores seek jumps", () => {
    const { sent, ev } = harness();
    ev("play", 0);
    ev("timeupdate", 1);
    ev("timeupdate", 2);
    ev("seeked", 80);       // jump — not watched
    ev("timeupdate", 81);
    ev("seeked", 5);        // back
    ev("timeupdate", 6);
    const last = sent.at(-1)![0]!;
    expect(last.furthest).toBe(81); // 80→81 was continuous playback after the seek baseline
    expect(last.seconds).toBe(6);
  });

  it("does not resend identical payloads", () => {
    const { sent, ev } = harness();
    ev("play", 0);
    ev("pause", 3);
    const count = sent.length;
    ev("pause", 3);
    expect(sent.length).toBe(count);
  });

  it("flush returns pending state once", () => {
    const { tracker, ev } = harness();
    ev("play", 0);
    ev("timeupdate", 1);
    ev("timeupdate", 2); // dirty, under heartbeat cadence
    const items = tracker.flush();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ asset: "vid_1", seconds: 2 });
    expect(tracker.flush()).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter student test`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

Create `apps/student/src/lib/video-tracking.ts`:

```ts
// Watch-reporting policy: what to send and when. The island emits raw facts;
// this module turns them into report items for the progress endpoint.
import type { MediaTrackingEvent } from "@headless-lms/editor-contract";

export interface VideoReportItem {
  asset: string;
  seconds: number;
  /** Monotonic high-water mark of continuously watched position. */
  furthest: number;
  duration: number | null;
  [key: string]: unknown;
}

export interface VideoTracker {
  handleEvent(event: MediaTrackingEvent): void;
  /** Drain unsent state (for page-leave); marks it sent. */
  flush(): VideoReportItem[];
}

const HEARTBEAT_MS = 10_000;
/** Max gap between timeupdates still counted as continuous playback. */
const CONTINUOUS_S = 2;

interface AssetState {
  furthest: number;
  lastTick: number;
  duration: number | null;
  lastSent: string | null;
  lastSentAt: number;
  pending: VideoReportItem | null;
}

export function createVideoTracker(opts: {
  send: (items: VideoReportItem[]) => void;
  now?: () => number;
  heartbeatMs?: number;
}): VideoTracker {
  const now = opts.now ?? Date.now;
  const heartbeatMs = opts.heartbeatMs ?? HEARTBEAT_MS;
  const assets = new Map<string, AssetState>();

  const state = (id: string): AssetState => {
    let s = assets.get(id);
    if (!s) {
      s = { furthest: 0, lastTick: 0, duration: null, lastSent: null, lastSentAt: -Infinity, pending: null };
      assets.set(id, s);
    }
    return s;
  };

  const item = (id: string, s: AssetState, seconds: number): VideoReportItem => ({
    asset: id,
    seconds: Math.round(seconds * 10) / 10,
    furthest: Math.round(s.furthest * 10) / 10,
    duration: s.duration,
  });

  const sendNow = (id: string, s: AssetState, seconds: number, force = false) => {
    const payload = item(id, s, seconds);
    const key = JSON.stringify(payload);
    if (!force && key === s.lastSent) {
      return;
    }
    opts.send([payload]);
    s.lastSent = key;
    s.lastSentAt = now();
    s.pending = null;
  };

  return {
    handleEvent(event) {
      const s = state(event.assetId);
      if (event.duration != null) {
        s.duration = event.duration;
      }
      switch (event.kind) {
        case "play":
          s.lastTick = event.seconds;
          break;
        case "timeupdate": {
          const delta = event.seconds - s.lastTick;
          if (delta > 0 && delta <= CONTINUOUS_S) {
            s.furthest = Math.max(s.furthest, event.seconds);
          }
          s.lastTick = event.seconds;
          s.pending = item(event.assetId, s, event.seconds);
          if (now() - s.lastSentAt >= heartbeatMs) {
            sendNow(event.assetId, s, event.seconds);
          }
          break;
        }
        case "pause":
        case "seeked":
          s.lastTick = event.seconds;
          sendNow(event.assetId, s, event.seconds);
          break;
        case "ended": {
          const end = s.duration ?? event.seconds;
          s.furthest = Math.max(s.furthest, end);
          s.lastTick = end;
          sendNow(event.assetId, s, end, true);
          break;
        }
      }
    },
    flush() {
      const items: VideoReportItem[] = [];
      for (const s of assets.values()) {
        if (s.pending && JSON.stringify(s.pending) !== s.lastSent) {
          items.push(s.pending);
          s.lastSent = JSON.stringify(s.pending);
          s.lastSentAt = now();
          s.pending = null;
        }
      }
      return items;
    },
  };
}

/** Page-leave delivery: a plain keepalive fetch — an SDK call would be
 *  cancelled by navigation. Same endpoint, body, and credentials. */
export function flushKeepalive(activityId: string, items: VideoReportItem[]): void {
  if (items.length === 0) return;
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  void fetch(`${base}/api/learn/progress`, {
    method: "POST",
    credentials: "include",
    keepalive: true,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ activity: activityId, reports: items }),
  }).catch(() => {});
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter student test`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/student/package.json pnpm-lock.yaml apps/student/src/lib/video-tracking.ts apps/student/src/lib/video-tracking.test.ts
git commit -m "feat(student): video watch-reporting policy module"
```

---

### Task 6: Wire the player — swap point, provider, resume, flush

**Files:**
- Create: `apps/student/src/editor-media.config.ts`
- Modify: `apps/student/src/lib/api/server.ts` (`courseProgress` return type)
- Modify: `apps/student/src/app/courses/[courseId]/page.tsx`
- Modify: `apps/student/src/components/player/course-player.tsx`

**Interfaces:**
- Consumes: `EditorMediaModule` (Task 1), `@headless-lms/content-plate/media` (Task 2), `createVideoTracker`/`flushKeepalive` (Task 5), `positions` on course progress (Task 4), existing `progressReporter`, `ensureClientSdk`, `Learn.requestLearnAssetDownload`.
- Produces: working end-to-end playback + reporting; no new exports.

- [ ] **Step 1: The media swap point**

Create `apps/student/src/editor-media.config.ts`:

```ts
/**
 * Client-side media companion to `editor.config.ts`. Deployers swapping
 * editors edit both files. Separate entry so player routes don't bundle the
 * editor itself.
 */
import type { EditorMediaModule } from "@headless-lms/editor-contract";
import { MediaProvider } from "@headless-lms/content-plate/media";

const editorMedia: EditorMediaModule = { MediaProvider };

export default editorMedia;
```

- [ ] **Step 2: Read side passes positions through**

`apps/student/src/lib/api/server.ts` — widen `courseProgress`'s declared return type and pass-through (the endpoint already returns it after Task 4):

```ts
async courseProgress(courseId: string): Promise<{
  activities: Record<string, "in-progress" | "completed">;
  positions: Record<string, unknown>;
} | null> {
```

(body unchanged — `res.data` already carries `positions` in the regenerated SDK types.)

`apps/student/src/app/courses/[courseId]/page.tsx` — pass it to the player:

```tsx
initialCompletion={progress?.activities ?? {}}
initialPositions={progress?.positions ?? {}}
```

- [ ] **Step 3: Player wiring in `course-player.tsx`**

Add the prop:

```ts
/** Server-hydrated per-activity position maps (activity id → asset id → state). */
initialPositions?: Record<string, unknown>;
```

Add imports:

```ts
import editorMedia from "@/editor-media.config";
import { createVideoTracker, flushKeepalive } from "@/lib/video-tracking";
import type { MediaTrackingEvent } from "@headless-lms/editor-contract";
import { Learn } from "@headless-lms/sdk";
```

Inside the component, alongside the existing `reporter` memo:

```tsx
const tracker = React.useMemo(
  () => (reporter ? createVideoTracker({ send: (items) => void reporter.report(items) }) : null),
  [reporter],
);

const onMediaEvent = React.useCallback(
  (e: MediaTrackingEvent) => tracker?.handleEvent(e),
  [tracker],
);

const startPosition = React.useCallback(
  (assetId: string): number | undefined => {
    const byAsset = initialPositions?.[curLessonId] as
      | Record<string, { seconds?: unknown }>
      | undefined;
    const seconds = byAsset?.[assetId]?.seconds;
    return typeof seconds === "number" ? seconds : undefined;
  },
  [initialPositions, curLessonId],
);

const refreshUrl = React.useCallback(async (assetId: string): Promise<string | null> => {
  ensureClientSdk();
  try {
    const res = await Learn.requestLearnAssetDownload({ path: { id: assetId }, body: {} });
    return res.data?.url ?? null;
  } catch {
    return null;
  }
}, []);

// Flush unsent watch state when the tab hides or the lesson unmounts.
React.useEffect(() => {
  if (!tracker || !curLessonId) return;
  const flush = () => flushKeepalive(curLessonId, tracker.flush());
  const onVisibility = () => {
    if (document.visibilityState === "hidden") flush();
  };
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    window.removeEventListener("pagehide", flush);
    document.removeEventListener("visibilitychange", onVisibility);
    flush();
  };
}, [tracker, curLessonId]);
```

Wrap the rendered content where the current lesson's node is placed (the `ContentArea` usage):

```tsx
<editorMedia.MediaProvider
  onEvent={onMediaEvent}
  startPosition={startPosition}
  refreshUrl={refreshUrl}
>
  <ContentArea node={renderedContent[curLessonId] ?? null} />
</editorMedia.MediaProvider>
```

(Match the actual `ContentArea` call already in the file — wrap it, don't duplicate it.)

- [ ] **Step 4: Verify**

Run: `pnpm --filter student typecheck && pnpm --filter student test`
Expected: clean, tests pass.

Run: `pnpm --filter student lint`
Expected: clean.

- [ ] **Step 5: End-to-end check**

With the dev stack up (`pnpm dev`, Postgres running): open a course with a video lesson as a student, play ~15 s, pause. Then:

```bash
psql "$DATABASE_URL" -c "select target_id, position from progress_records where target_type = 'activity' order by updated_at desc limit 3;"
```

Expected: the lesson's record's `position` contains `{ "<assetId>": { "seconds": ..., "furthest": ..., "duration": ... } }`. Reload the lesson — playback resumes near the paused position.

- [ ] **Step 6: Commit**

```bash
git add apps/student/src/editor-media.config.ts apps/student/src/lib/api/server.ts "apps/student/src/app/courses/[courseId]/page.tsx" apps/student/src/components/player/course-player.tsx
git commit -m "feat(student): vidstack playback with watch reporting and resume"
```
