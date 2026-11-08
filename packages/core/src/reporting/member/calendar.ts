import type { Event } from '../../content/index.js';

function stamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

function text(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

const encoder = new TextEncoder();

function octets(value: string): number {
  return encoder.encode(value).length;
}

function fold(line: string): string {
  const parts: string[] = [];
  let part = '';
  let size = 0;
  let width = 75;
  for (const char of line) {
    const length = octets(char);
    if (size + length > width) {
      parts.push(part);
      part = '';
      size = 0;
      width = 74;
    }
    part += char;
    size += length;
  }
  parts.push(part);
  return parts.join('\r\n ');
}

function where(event: Event): string | null {
  const venue = event.location.venue;
  if (venue) {
    const address = venue.address;
    const lines = address
      ? [
          address.line1,
          address.line2,
          address.city,
          address.region,
          address.postalCode,
          address.country,
        ]
      : [];
    return [venue.name, ...lines].filter((part): part is string => Boolean(part)).join(', ');
  }
  return event.location.online?.url ?? null;
}

export function eventCalendar(
  event: Event,
  options: { pageUrl: string; withLocation: boolean; now: Date },
): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Headless LMS//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}`,
    `DTSTAMP:${stamp(options.now)}`,
    `DTSTART:${stamp(event.startsAt)}`,
    `DTEND:${stamp(event.endsAt)}`,
    `SUMMARY:${text(event.title)}`,
    `DESCRIPTION:${text(options.pageUrl)}`,
    `URL:${options.pageUrl}`,
  ];
  if (event.status === 'canceled') {
    lines.push('STATUS:CANCELLED');
  }
  if (options.withLocation) {
    const location = where(event);
    if (location) {
      lines.push(`LOCATION:${text(location)}`);
    }
    if (event.location.online) {
      lines.push(`CONFERENCE;VALUE=URI:${event.location.online.url}`);
    }
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
