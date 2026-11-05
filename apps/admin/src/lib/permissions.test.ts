import { describe, expect, it } from "vitest";

import { permissionsOf } from "./permissions";

const james = permissionsOf({
  orgRole: { key: "member", name: "Member" },
  isOwner: false,
  org: [],
  content: { crs_1: ["courses:read", "courses:write"] },
});

const tina = permissionsOf({
  orgRole: { key: "instructor", name: "Tutor" },
  isOwner: false,
  org: ["courses:read", "courses:write"],
  content: {},
});

describe("permissionsOf", () => {
  it("holds an item's permissions on that item only", () => {
    expect(james.has("courses:write", "crs_1")).toBe(true);
    expect(james.has("courses:write", "crs_2")).toBe(false);
    expect(james.has("courses:write")).toBe(false);
  });
  it("covers every item with a permission held on the org", () => {
    expect(tina.has("courses:write", "crs_2")).toBe(true);
    expect(tina.has("courses:write")).toBe(true);
  });
  it("answers anywhere and where", () => {
    expect(james.anywhere("courses:read")).toBe(true);
    expect(james.anywhere("people:read")).toBe(false);
    expect(james.where("courses:read")).toEqual({ org: false, content: ["crs_1"] });
    expect(tina.where("courses:read")).toEqual({ org: true, content: [] });
  });
  it("manages something only with a permission somewhere", () => {
    expect(james.manages).toBe(true);
    expect(
      permissionsOf({ orgRole: { key: "m", name: "Member" }, isOwner: false, org: [], content: {} })
        .manages,
    ).toBe(false);
  });
});
