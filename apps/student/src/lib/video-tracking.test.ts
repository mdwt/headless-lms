import { describe, expect, it } from "vitest";
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
    const { tracker, sent, ev } = harness();
    ev("play", 0);
    ev("timeupdate", 1);
    ev("timeupdate", 2);
    ev("seeked", 80);       // jump — not watched
    ev("timeupdate", 81);
    ev("seeked", 5);        // back
    ev("timeupdate", 6);    // under heartbeat cadence — pending, not sent
    const last = sent.at(-1)![0]!;
    expect(last.furthest).toBe(81); // 80→81 was continuous playback after the seek baseline
    expect(last.seconds).toBe(5);   // the seek-back was the last immediate send
    expect(tracker.flush()[0]).toMatchObject({ seconds: 6, furthest: 81 });
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
