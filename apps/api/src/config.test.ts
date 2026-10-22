import { afterEach, describe, expect, it } from "vitest";

import { parseMemberImageMaxBytes } from "./config.js";

const original = process.env.MEMBER_IMAGE_MAX_BYTES;

afterEach(() => {
  if (original === undefined) {
    delete process.env.MEMBER_IMAGE_MAX_BYTES;
  } else {
    process.env.MEMBER_IMAGE_MAX_BYTES = original;
  }
});

describe("parseMemberImageMaxBytes", () => {
  it("defaults to 10 MiB when unset", () => {
    delete process.env.MEMBER_IMAGE_MAX_BYTES;
    expect(parseMemberImageMaxBytes()).toBe(10 * 1024 * 1024);
  });

  it("reads a positive integer", () => {
    process.env.MEMBER_IMAGE_MAX_BYTES = "2097152";
    expect(parseMemberImageMaxBytes()).toBe(2097152);
  });

  it("refuses a value that would disable or break the cap", () => {
    for (const raw of ["10MB", "0", "-1", "1.5"]) {
      process.env.MEMBER_IMAGE_MAX_BYTES = raw;
      expect(() => parseMemberImageMaxBytes()).toThrow("invalid MEMBER_IMAGE_MAX_BYTES");
    }
  });
});
