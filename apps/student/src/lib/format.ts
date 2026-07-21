// Display formatting helpers.

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

/** Up-to-two-letter initials from a display name. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}
