import { describe, expect, it } from "vitest";

import { visitorHeaders, visitorOrigin } from "./visitor";

describe("visitorOrigin", () => {
  it("is the host the browser asked for, over http when nothing says otherwise", () => {
    expect(visitorOrigin(new Headers({ host: "acme.localhost:8002" }))).toBe(
      "http://acme.localhost:8002",
    );
  });

  it("is the forwarded host and protocol behind a proxy", () => {
    const headers = new Headers({
      host: "student.internal:8002",
      "x-forwarded-host": "learn.acme.com",
      "x-forwarded-proto": "https",
    });
    expect(visitorOrigin(headers)).toBe("https://learn.acme.com");
  });

  it("takes the first value of a forwarded chain", () => {
    const headers = new Headers({
      "x-forwarded-host": "learn.acme.com, student.internal",
      "x-forwarded-proto": "https, http",
    });
    expect(visitorOrigin(headers)).toBe("https://learn.acme.com");
  });
});

describe("visitorHeaders", () => {
  it("carries the visitor's domain as Origin and their IP address as X-Forwarded-For", () => {
    const headers = new Headers({
      host: "learn.acme.com",
      "x-forwarded-proto": "https",
      "x-forwarded-for": "203.0.113.7",
      cookie: "session=1",
    });
    expect(visitorHeaders(headers)).toEqual({
      origin: "https://learn.acme.com",
      "x-forwarded-for": "203.0.113.7",
    });
  });

  it("sends no forwarded address when the request carries none", () => {
    expect(visitorHeaders(new Headers({ host: "learn.acme.com" }))).toEqual({
      origin: "http://learn.acme.com",
    });
  });
});
