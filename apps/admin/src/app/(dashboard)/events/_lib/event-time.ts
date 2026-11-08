const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = partsFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatters.set(timeZone, formatter);
  }
  return formatter;
}

function zonedParts(instant: Date, timeZone: string): Record<string, number> {
  const parts: Record<string, number> = {};
  for (const part of partsFormatter(timeZone).formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return parts;
}

function offsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    partsFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function isLocalDateTime(value: string): boolean {
  return LOCAL_PATTERN.test(value);
}

export function zonedToUtc(local: string, timeZone: string): string {
  const match = LOCAL_PATTERN.exec(local);
  if (!match) throw new Error(`Not a local date and time: ${local}`);
  const [, y, mo, d, h, mi] = match.map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const first = wall - offsetMs(new Date(wall), timeZone);
  const second = wall - offsetMs(new Date(first), timeZone);
  return new Date(second).toISOString();
}

export function utcToZoned(iso: string, timeZone: string): string {
  const p = zonedParts(new Date(iso), timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

export function addMinutes(local: string, minutes: number): string {
  const match = LOCAL_PATTERN.exec(local);
  if (!match) return local;
  const [, y, mo, d, h, mi] = match.map(Number);
  const next = new Date(Date.UTC(y, mo - 1, d, h, mi + minutes));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}T${pad(next.getUTCHours())}:${pad(next.getUTCMinutes())}`;
}

export function defaultStart(now: Date = new Date()): string {
  const start = new Date(now);
  start.setDate(start.getDate() + 1);
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  return `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T${pad(start.getHours())}:${pad(start.getMinutes())}`;
}

export function hasEnded(event: { endsAt: string }, now: number = Date.now()): boolean {
  return new Date(event.endsAt).getTime() < now;
}

function dayLabel(instant: Date, timeZone: string): string {
  const parts: Record<string, string> = {};
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  for (const part of formatter.formatToParts(instant)) parts[part.type] = part.value;
  return `${parts.weekday} ${parts.day} ${parts.month} ${parts.year}`;
}

function timeLabel(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

export function formatEventDate(
  event: { startsAt: string; endsAt: string; timeZone: string },
  options: { zone?: boolean } = {},
): string {
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  const startDay = dayLabel(start, event.timeZone);
  const endDay = dayLabel(end, event.timeZone);
  const text =
    startDay === endDay
      ? `${startDay}, ${timeLabel(start, event.timeZone)}–${timeLabel(end, event.timeZone)}`
      : `${startDay}, ${timeLabel(start, event.timeZone)} – ${endDay}, ${timeLabel(end, event.timeZone)}`;
  return options.zone === false ? text : `${text} ${event.timeZone.replace(/_/g, " ")}`;
}

export function cumulativeGrants(
  points: { date: string; count: number }[],
  until: string,
): { date: string; count: number; total: number }[] {
  if (points.length === 0) return [];
  const byDate = new Map(points.map((p) => [p.date, p.count]));
  const sorted = [...byDate.keys()].sort();
  const last = sorted[sorted.length - 1] > until ? sorted[sorted.length - 1] : until;
  const series: { date: string; count: number; total: number }[] = [];
  let total = 0;
  for (
    let day = new Date(Date.parse(`${sorted[0]}T00:00:00Z`) - 86_400_000);
    series.length < 730;
    day = new Date(day.getTime() + 86_400_000)
  ) {
    const date = day.toISOString().slice(0, 10);
    const count = byDate.get(date) ?? 0;
    total += count;
    series.push({ date, count, total });
    if (date >= last) break;
  }
  return series;
}

export function requestTime(): number {
  return Date.now();
}
