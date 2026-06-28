"use client";

import { Pause, Play } from "lucide-react";

import { timecode } from "@/lib/format";

/** Audio player card with simulated waveform (handoff §10). */
export function AudioLesson({
  title,
  durationSeconds,
  playing,
  t,
  onTogglePlay,
}: {
  title: string;
  durationSeconds: number;
  playing: boolean;
  t: number;
  onTogglePlay: () => void;
}) {
  const pct = durationSeconds ? Math.min(100, Math.round((100 * t) / durationSeconds)) : 0;
  const played = (pct / 100) * 48;

  return (
    <div className="rounded-card border border-line bg-surface px-7 py-[30px]">
      <div className="mb-6 flex items-center gap-[18px]">
        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={playing ? "Pause" : "Play"}
          className="flex size-[60px] flex-none items-center justify-center rounded-full bg-brand text-white hover:bg-brand-strong"
          style={{ boxShadow: "0 10px 24px -12px var(--brand)" }}
        >
          {playing ? (
            <Pause className="size-[22px]" />
          ) : (
            <Play className="ml-0.5 size-6" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="mb-[3px] text-[17px] font-semibold">{title}</div>
          <div className="text-[12px] text-ink-3">
            {timecode(t)} / {timecode(durationSeconds)}
          </div>
        </div>
        <div className="flex flex-none gap-1.5">
          <span className="rounded-full border border-ring-conic px-[11px] py-[5px] text-[11.5px] text-ink-2">
            1.0×
          </span>
        </div>
      </div>
      <div className="flex h-14 items-end gap-[3px]">
        {Array.from({ length: 48 }, (_, i) => {
          const h = Math.min(
            100,
            24 + Math.round(Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.27)) * 70 + (i % 3) * 6),
          );
          return (
            <div
              key={i}
              className="flex-1 rounded-[2px]"
              style={{
                height: `${h}%`,
                background: i < played ? "var(--brand)" : "#e4e1da",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
