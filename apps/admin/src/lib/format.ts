/** Small, dependency-free formatters. Numbers stay tabular for tidy tables. */

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const DAY = 86_400_000;

/** Relative time against the current time (e.g. "3 days ago", "in 2 weeks"). */
export function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const past = diff < 0;
  const units: [number, string][] = [
    [365 * DAY, "year"],
    [30 * DAY, "month"],
    [7 * DAY, "week"],
    [DAY, "day"],
    [3_600_000, "hour"],
    [60_000, "minute"],
  ];
  for (const [ms, label] of units) {
    const n = Math.floor(abs / ms);
    if (n >= 1) {
      const plural = n === 1 ? label : `${label}s`;
      return past ? `${n} ${plural} ago` : `in ${n} ${plural}`;
    }
  }
  return "just now";
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

/** Human label for a content-editor format tag, e.g. "plate v1". */
export function formatContentType(tag: { type: string; version?: number }): string {
  return tag.version != null ? `${tag.type} v${tag.version}` : tag.type;
}
