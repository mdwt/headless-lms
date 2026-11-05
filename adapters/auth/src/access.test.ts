import { describe, it, expect } from "vitest";
import { roles } from "./access.js";

describe("auth access control", () => {
  it("defines only the two membership values", () => {
    expect(Object.keys(roles).sort()).toEqual(["owner", "participant"]);
  });
});
