"use client";

import { Captions, Maximize, Pause, Play } from "lucide-react";

import { timecode } from "@/lib/format";
import { COVER_GRADIENTS } from "@/lib/covers";
import type { CoverTone } from "@/lib/types";

/** Video poster + simulated playback controls (handoff §10). */
export function VideoLesson({
  tone,
  letter,
  durationSeconds,
  playing,
  t,
  onTogglePlay,
}: {
  tone: CoverTone;
  letter: string;
  durationSeconds: number;
  playing: boolean;
  t: number;
  onTogglePlay: () => void;
}) {
  const pct = durationSeconds ? Math.min(100, Math.round((100 * t) / durationSeconds)) : 0;
  const [a, b] = posterStops(tone);

  return (
    <div
      className="relative flex items-center justify-center overflow-hidden rounded-card"
      style={{
        aspectRatio: "16 / 9",
        background: "#0d0d10",
        boxShadow: "0 24px 60px -36px rgba(0,0,0,0.55)",
      }}
    >
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(160deg, ${a}, ${b})` }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 78% 14%, rgba(255,255,255,0.12), transparent 55%)",
        }}
      />
      <span
        aria-hidden
        className="absolute left-[26px] bottom-16 z-[1] font-semibold leading-none"
        style={{ fontSize: 148, color: "rgba(255,255,255,0.06)" }}
      >
        {letter}
      </span>

      <button
        type="button"
        onClick={onTogglePlay}
        aria-label={playing ? "Pause" : "Play"}
        className="relative z-[2] flex size-[74px] items-center justify-center rounded-full transition-transform duration-150 hover:scale-[1.06]"
        style={{
          background: "rgba(255,255,255,0.95)",
          color: "#15151a",
          boxShadow: "0 10px 30px -8px rgba(0,0,0,0.5)",
        }}
      >
        {playing ? (
          <Pause className="size-[26px]" />
        ) : (
          <Play className="ml-[3px] size-7" />
        )}
      </button>

      <div
        className="absolute inset-x-0 bottom-0 z-[2] flex items-center gap-3.5 px-[18px] py-3.5 text-white"
        style={{ background: "linear-gradient(0deg, rgba(0,0,0,0.6), transparent)" }}
      >
        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={playing ? "Pause" : "Play"}
          className="flex flex-none text-white"
        >
          {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
        </button>
        <span className="flex-none text-[12px] tracking-[0.02em]">
          {timecode(t)} / {timecode(durationSeconds)}
        </span>
        <div className="h-1 flex-1 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.25)" }}>
          <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
        </div>
        <Captions className="size-[18px] flex-none opacity-85" />
        <Maximize className="size-[18px] flex-none opacity-85" />
      </div>
    </div>
  );
}

function posterStops(tone: CoverTone): [string, string] {
  const grad = COVER_GRADIENTS[tone];
  const matches = grad.match(/#[0-9a-f]{6}/gi);
  return [matches?.[0] ?? "#211d44", matches?.[1] ?? "#332b6b"];
}
