import { describe, it, expect } from "vitest";
import { deepMerge } from "./settings.js";

describe("deepMerge", () => {
  it("keeps sibling keys the patch does not name", () => {
    expect(deepMerge({ a: 1, b: 2 }, { b: 3 })).toEqual({ a: 1, b: 3 });
  });

  it("merges nested objects key by key instead of replacing them", () => {
    const base = { comments: { enabled: false, threaded: true, reactions: false } };
    const patch = { comments: { enabled: true } };
    expect(deepMerge(base, patch)).toEqual({
      comments: { enabled: true, threaded: true, reactions: false },
    });
  });

  it("merges at arbitrary depth", () => {
    const base = { a: { b: { c: 1, d: 2 } } };
    expect(deepMerge(base, { a: { b: { d: 3 } } })).toEqual({ a: { b: { c: 1, d: 3 } } });
  });

  it("replaces arrays outright rather than merging element-wise", () => {
    expect(deepMerge({ tags: ["x", "y", "z"] }, { tags: ["q"] })).toEqual({ tags: ["q"] });
  });

  it("replaces a scalar with an object and an object with a scalar", () => {
    expect(deepMerge({ a: 1 }, { a: { b: 2 } })).toEqual({ a: { b: 2 } });
    expect(deepMerge({ a: { b: 2 } }, { a: 1 })).toEqual({ a: 1 });
  });

  it("stores an explicit null rather than treating it as absent", () => {
    expect(deepMerge({ a: 1, b: 2 }, { a: null })).toEqual({ a: null, b: 2 });
  });

  it("adds keys the base does not have", () => {
    expect(deepMerge({ a: 1 }, { b: { c: 2 } })).toEqual({ a: 1, b: { c: 2 } });
  });

  it("leaves the base untouched", () => {
    const base = { a: { b: 1 } };
    deepMerge(base, { a: { b: 2 } });
    expect(base).toEqual({ a: { b: 1 } });
  });

  it("treats a missing stored value as an empty base", () => {
    expect(deepMerge(undefined, { a: 1 })).toEqual({ a: 1 });
    expect(deepMerge(null, { a: 1 })).toEqual({ a: 1 });
  });
});
