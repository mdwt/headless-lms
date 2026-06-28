// Display formatting helpers.

/** durationSeconds -> "9:45" (or "1:09:45" past an hour). */
export function timecode(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Sidebar/meta duration label, e.g. "9:45" or "6 min" for round minutes. */
export function durationLabel(totalSeconds: number): string {
  if (totalSeconds % 60 === 0) return `${totalSeconds / 60} min`;
  return timecode(totalSeconds);
}

/** "Friday · Jun 28" */
export function dateLabel(d = new Date()): string {
  const day = d.toLocaleDateString("en-US", { weekday: "long" });
  const md = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${day} · ${md}`;
}

/** "Good evening" by local hour. */
export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function firstName(name: string): string {
  return name.split(" ")[0] ?? name;
}

/** "Jun 14, 2026" */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
