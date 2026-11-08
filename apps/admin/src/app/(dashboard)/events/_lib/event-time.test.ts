import { describe, expect, it } from "vitest";

import {
  addMinutes,
  cumulativeGrants,
  formatEventDate,
  hasEnded,
  utcToZoned,
  zonedToUtc,
} from "./event-time";

describe("zonedToUtc", () => {
  it("reads a wall time in the event's time zone", () => {
    expect(zonedToUtc("2026-05-12T17:00", "Europe/London")).toBe("2026-05-12T16:00:00.000Z");
    expect(zonedToUtc("2026-01-12T17:00", "Europe/London")).toBe("2026-01-12T17:00:00.000Z");
    expect(zonedToUtc("2026-05-12T09:30", "America/New_York")).toBe("2026-05-12T13:30:00.000Z");
    expect(zonedToUtc("2026-05-12T09:30", "UTC")).toBe("2026-05-12T09:30:00.000Z");
  });

  it("handles the day the clocks change", () => {
    expect(zonedToUtc("2026-03-29T12:00", "Europe/London")).toBe("2026-03-29T11:00:00.000Z");
    expect(zonedToUtc("2026-10-25T12:00", "Europe/London")).toBe("2026-10-25T12:00:00.000Z");
  });
});

describe("utcToZoned", () => {
  it("shows an instant as the wall time in the time zone", () => {
    expect(utcToZoned("2026-05-12T16:00:00.000Z", "Europe/London")).toBe("2026-05-12T17:00");
    expect(utcToZoned("2026-05-12T13:30:00Z", "America/New_York")).toBe("2026-05-12T09:30");
  });

  it("round-trips with zonedToUtc", () => {
    const local = "2026-07-01T08:15";
    expect(utcToZoned(zonedToUtc(local, "Asia/Tokyo"), "Asia/Tokyo")).toBe(local);
  });
});

describe("addMinutes", () => {
  it("moves a wall time across midnight", () => {
    expect(addMinutes("2026-05-12T23:30", 60)).toBe("2026-05-13T00:30");
  });
});

describe("hasEnded", () => {
  it("is true once the end has passed", () => {
    const now = Date.parse("2026-05-12T18:00:00Z");
    expect(hasEnded({ endsAt: "2026-05-12T17:00:00Z" }, now)).toBe(true);
    expect(hasEnded({ endsAt: "2026-05-12T19:00:00Z" }, now)).toBe(false);
  });
});

describe("formatEventDate", () => {
  it("shows the times in the event's time zone", () => {
    expect(
      formatEventDate({
        startsAt: "2026-05-12T16:00:00Z",
        endsAt: "2026-05-12T17:00:00Z",
        timeZone: "Europe/London",
      }),
    ).toBe("Tue 12 May 2026, 17:00–18:00 Europe/London");
  });
});

describe("cumulativeGrants", () => {
  it("starts from zero the day before and fills the days between grants", () => {
    expect(
      cumulativeGrants(
        [
          { date: "2026-05-03", count: 2 },
          { date: "2026-05-01", count: 1 },
        ],
        "2026-05-04",
      ),
    ).toEqual([
      { date: "2026-04-30", count: 0, total: 0 },
      { date: "2026-05-01", count: 1, total: 1 },
      { date: "2026-05-02", count: 0, total: 1 },
      { date: "2026-05-03", count: 2, total: 3 },
      { date: "2026-05-04", count: 0, total: 3 },
    ]);
  });

  it("is empty with no grants", () => {
    expect(cumulativeGrants([], "2026-05-04")).toEqual([]);
  });
});
