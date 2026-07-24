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
