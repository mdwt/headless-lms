import { describe, it, expect } from "vitest";
import { parseArgs, validateName } from "./args.js";

describe("parseArgs", () => {
  it("extracts name and --yes", () => {
    expect(parseArgs(["my-lms", "--yes"])).toEqual({ name: "my-lms", yes: true });
    expect(parseArgs([])).toEqual({ name: undefined, yes: false });
  });
});

describe("validateName", () => {
  it("accepts npm-safe names", () => {
    expect(validateName("my-lms")).toBeUndefined();
  });
  it("rejects invalid names with a reason", () => {
    expect(validateName("My LMS!")).toMatch(/lowercase/);
    expect(validateName("")).toMatch(/required/);
  });
});
