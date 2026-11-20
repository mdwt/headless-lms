import { describe, expect, it } from "vitest";

import { sameSitePath, withNext } from "./next-path";

describe("sameSitePath", () => {
  it("keeps a path on this site, with its query and fragment", () => {
    expect(sameSitePath("/")).toBe("/");
    expect(sameSitePath("/courses/crs_1?tab=notes#top")).toBe("/courses/crs_1?tab=notes#top");
  });

  it("refuses an address that leaves the site", () => {
    expect(sameSitePath("https://evil.example.com/")).toBeNull();
    expect(sameSitePath("//evil.example.com")).toBeNull();
    expect(sameSitePath("/\\evil.example.com")).toBeNull();
    expect(sameSitePath("/\t/evil.example.com")).toBeNull();
    expect(sameSitePath("\\\\evil.example.com")).toBeNull();
    expect(sameSitePath("javascript:alert(1)")).toBeNull();
  });

  it("refuses a path that normalises to another site", () => {
    expect(sameSitePath("/.//evil.example.com")).toBeNull();
    expect(sameSitePath("/%2e//evil.example.com")).toBeNull();
    expect(sameSitePath("/..//evil.example.com")).toBeNull();
    expect(sameSitePath("/./\\evil.example.com")).toBeNull();
  });

  it("refuses a missing, empty, relative or repeated value", () => {
    expect(sameSitePath(null)).toBeNull();
    expect(sameSitePath(undefined)).toBeNull();
    expect(sameSitePath("")).toBeNull();
    expect(sameSitePath("courses")).toBeNull();
    expect(sameSitePath(["/courses", "/downloads"])).toBeNull();
  });
});

describe("withNext", () => {
  it("leaves the path alone when there is nowhere to go next", () => {
    expect(withNext("/login", null)).toBe("/login");
  });

  it("adds the next path, after a query the path already has", () => {
    expect(withNext("/login", "/courses/crs_1?tab=notes")).toBe(
      "/login?next=%2Fcourses%2Fcrs_1%3Ftab%3Dnotes",
    );
    expect(withNext("/login?reset=1", "/courses")).toBe("/login?reset=1&next=%2Fcourses");
  });
});
