import { describe, expect, it } from "vitest";
import type { MediaTrackingEvent } from "@headless-lms/editor-contract";

import {
  createVideoTracker,
  recordSessionItems,
  type SessionPositions,
  type VideoAssetSeed,
  type VideoReportItem,
} from "./video-tracking";

function harness(opts: { initial?: (assetId: string) => VideoAssetSeed | undefined } = {}) {
  let now = 0;
  const sent: VideoReportItem[][] = [];
  const tracker = createVideoTracker({
    send: (items) => sent.push(items),
    now: () => now,
    initial: opts.initial,
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

  it("sends immediately on pause; watching to the end clamps furthest to duration", () => {
    const { sent, ev, tick } = harness();
    ev("play", 0);
    ev("timeupdate", 1);
    ev("pause", 1.4);
    expect(sent.at(-1)![0]).toMatchObject({ seconds: 1.4 });
    // watch continuously to the end
    for (let s = 2; s <= 99; s++) {
      ev("timeupdate", s);
      tick(1000);
    }
    ev("ended", 99.7, 100);
    expect(sent.at(-1)![0]).toMatchObject({ seconds: 100, furthest: 100, duration: 100 });
  });

  it("seek-to-end does not inflate furthest", () => {
    const { sent, ev, tick } = harness();
    ev("play", 0);
    ev("timeupdate", 1);
    ev("timeupdate", 2);
    tick(5000);
    ev("seeked", 99.5);
    ev("ended", 100, 100);
    expect(sent.at(-1)![0]).toMatchObject({ seconds: 100, furthest: 2 });
  });

  it("furthest is monotonic and ignores seek jumps", () => {
    const { tracker, sent, ev, tick } = harness();
    ev("play", 0);
    ev("timeupdate", 1);
    ev("timeupdate", 2);
    tick(5000);
    ev("seeked", 80);       // jump — not watched; immediate send (first seek)
    ev("timeupdate", 81);
    ev("seeked", 5);        // scrub-burst window — stays pending
    ev("timeupdate", 6);
    const last = sent.at(-1)![0]!;
    expect(last.furthest).toBe(2);  // the jump itself credits nothing
    expect(last.seconds).toBe(80);
    expect(tracker.flush()[0]).toMatchObject({ seconds: 6, furthest: 81 }); // 80→81 was continuous
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

  it("watched accumulates continuous playback only — seeks add nothing", () => {
    const { tracker, ev, tick } = harness();
    ev("play", 0);
    ev("timeupdate", 1);
    ev("timeupdate", 2);   // watched 2
    tick(5000);
    ev("seeked", 80);      // jump — adds nothing
    ev("timeupdate", 81);  // watched 3
    expect(tracker.flush()[0]).toMatchObject({ watched: 3, furthest: 81, seconds: 81 });
  });

  it("seeds watched across sessions", () => {
    const { sent, ev } = harness({
      initial: () => ({ seconds: 10, watched: 30, furthest: 40, duration: 90 }),
    });
    ev("play", 10);
    ev("timeupdate", 11);
    ev("pause", 11);
    expect(sent.at(-1)![0]).toMatchObject({ watched: 31, furthest: 40 });
  });

  it("seeds furthest and duration from prior state so a revisit never rewinds them", () => {
    const { sent, ev } = harness({
      initial: () => ({ seconds: 32.4, furthest: 70, duration: 90 }),
    });
    ev("seeked", 32.4, null); // the resume seek, were it reported
    expect(sent.at(-1)![0]).toMatchObject({ seconds: 32.4, furthest: 70, duration: 90 });
    ev("play", 32.4, null);
    ev("timeupdate", 33, null);
    expect(sent.at(-1)![0]).toMatchObject({ furthest: 70 }); // still the high-water mark
  });

  it("seeding tolerates malformed prior state", () => {
    const { sent, ev } = harness({
      initial: () => ({ seconds: "x", furthest: null, duration: "90" }),
    });
    ev("pause", 1, 100);
    expect(sent.at(-1)![0]).toMatchObject({ seconds: 1, furthest: 0, duration: 100 });
  });
});

describe("recordSessionItems", () => {
  it("keeps the latest item per activity and asset", () => {
    const map: SessionPositions = {};
    const item = (seconds: number): VideoReportItem => ({
      asset: "vid_1",
      seconds,
      furthest: seconds,
      watched: seconds,
      duration: 90,
    });
    recordSessionItems(map, "act_1", [item(10)]);
    recordSessionItems(map, "act_1", [item(25)]);
    recordSessionItems(map, "act_2", []);
    expect(map.act_1!.vid_1).toMatchObject({ seconds: 25 });
    expect(map.act_2).toBeUndefined();
  });
});
